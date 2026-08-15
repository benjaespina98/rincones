import React from "react";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("../src/services/authApi", () => ({
  getMe: vi.fn(),
  googleAuth: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("../src/utils/googleOAuth", () => ({
  consumeGoogleAuthResult: vi.fn(),
  isGoogleAuthEnabled: () => true,
  startGoogleAuth: vi.fn(),
}));

const authApi = await import("../src/services/authApi");
const googleOAuth = await import("../src/utils/googleOAuth");
const { AuthProvider } = await import("../src/context/AuthContext.jsx");
const { ToastProvider } = await import("../src/context/ToastContext.jsx");
const { default: GoogleCallbackPage } = await import("../src/pages/GoogleCallbackPage.jsx");
const { default: PrivateRoute } = await import("../src/components/PrivateRoute.jsx");
const { default: AppGate } = await import("../src/components/AppGate.jsx");

/**
 * El viaje de vuelta de Google, con el router y las pantallas de verdad.
 *
 * ── EL BUG QUE ESTO EVITA QUE VUELVA ────────────────────────────────────────
 * "Elijo mi cuenta de Google, Google autentica bien, y Rincones me devuelve al
 * login." La causa no estaba en el callback ni en el server: los dos hacían lo
 * suyo bien. Estaba en que la app monta de cero en /auth/google/callback y
 * `AuthProvider` pregunta `/auth/me` ANTES de que el credential se canjee. Ese
 * pedido va camino a un 401 (correcto: todavía no hay sesión) y encima tarda,
 * porque un 401 en `/auth/me` dispara además un intento de renovación.
 *
 * Cuando ese 401 llegaba DESPUÉS de que `applySession` ya había abierto la
 * sesión, la pisaba con `setUser(null)` — una respuesta que describía un
 * instante anterior a que la sesión existiera. `PrivateRoute` veía `null` y
 * redirigía al login con las cookies puestas. Intermitente, porque dependía de
 * cuál de las dos llamadas terminara última.
 *
 * Acá se fuerza el orden malo a propósito: Google resuelve primero, `/auth/me`
 * contesta su 401 después. Es el caso que fallaba siempre que el server estaba
 * frío, y el que la gente reportaba como "a veces".
 */
const usuarioListo = {
  id: "g1",
  email: "gina@rincones.test",
  role: "user",
  firstName: "Gina",
  emailVerified: true,
  onboarded: true,
  hasBirthDate: true,
};

const diferido = () => {
  let resolver;
  let rechazar;
  const promesa = new Promise((res, rej) => { resolver = res; rechazar = rej; });
  return { promesa, resolver, rechazar };
};

const sin401 = () => {
  const error = new Error("Request failed with status code 401");
  error.response = { status: 401, data: {} };
  return error;
};

const montarApp = () =>
  render(
    <MemoryRouter initialEntries={["/auth/google/callback"]}>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/auth/google/callback" element={<GoogleCallbackPage />} />
            <Route path="/login" element={<div>Pantalla de login</div>} />
            <Route
              path="/"
              element={<PrivateRoute><AppGate><div>Descubrí</div></AppGate></PrivateRoute>}
            />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe("volver de Google", () => {
  test("la sesión aguanta aunque el /auth/me del arranque conteste 401 más tarde", async () => {
    const hidratacion = diferido();
    authApi.getMe.mockReturnValue(hidratacion.promesa);
    googleOAuth.consumeGoogleAuthResult.mockReturnValue({ idToken: "id-token", mode: "login" });
    authApi.googleAuth.mockResolvedValue(usuarioListo);

    montarApp();

    // Google resolvió: la app ya tiene que estar adentro.
    await waitFor(() => expect(screen.getByText("Descubrí")).toBeInTheDocument());

    // Y AHORA llega el 401 del /auth/me que salió antes de que hubiera sesión.
    hidratacion.rechazar(sin401());

    // No puede moverse: esa respuesta ya no describe nada.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText("Descubrí")).toBeInTheDocument();
    expect(screen.queryByText("Pantalla de login")).not.toBeInTheDocument();
  });

  test("si Google falla de verdad, sí se vuelve al login", async () => {
    // La otra mitad: el arreglo no puede volverse "ignorar siempre lo que llega".
    authApi.getMe.mockRejectedValue(sin401());
    googleOAuth.consumeGoogleAuthResult.mockReturnValue({ idToken: "id-token", mode: "login" });
    authApi.googleAuth.mockRejectedValue(sin401());

    montarApp();

    await waitFor(() => expect(screen.getByText("Pantalla de login")).toBeInTheDocument());
  });

  test("cancelar en la pantalla de Google vuelve al login sin dar vueltas", async () => {
    authApi.getMe.mockRejectedValue(sin401());
    googleOAuth.consumeGoogleAuthResult.mockReturnValue({ error: "access_denied" });

    montarApp();

    await waitFor(() => expect(screen.getByText("Pantalla de login")).toBeInTheDocument());
    expect(authApi.googleAuth).not.toHaveBeenCalled();
  });
});
