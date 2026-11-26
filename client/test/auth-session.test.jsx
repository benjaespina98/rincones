import React, { useContext } from "react";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";

vi.mock("../src/services/authApi", () => ({
  getMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));

const authApi = await import("../src/services/authApi");
const { AuthProvider, AuthContext } = await import("../src/context/AuthContext.jsx");

/** Un promise que resolvemos a mano, para poder parar el tiempo donde importa. */
const diferido = () => {
  let resolver;
  let rechazar;
  const promesa = new Promise((res, rej) => {
    resolver = res;
    rechazar = rej;
  });
  return { promesa, resolver, rechazar };
};

const sin401 = () => {
  const error = new Error("Request failed with status code 401");
  error.response = { status: 401, data: {} };
  return error;
};

let ultimoContexto = null;
const Espia = () => {
  ultimoContexto = useContext(AuthContext);
  const { user, loading } = ultimoContexto;
  return <div>{loading ? "cargando" : user ? `hola ${user.email}` : "sin sesión"}</div>;
};

const montar = () => render(<AuthProvider><Espia /></AuthProvider>);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear(); // un usuario guardado por el test anterior saltearía el «cargando»
  ultimoContexto = null;
});

/**
 * ── "ENTRO CON GOOGLE Y ME DEVUELVE AL LOGIN" ───────────────────────────────
 *
 * La secuencia real, y por qué no se ve leyendo ninguna de las dos partes sola:
 *
 *   1. La app monta en /auth/google/callback. `AuthProvider` no sabe que está
 *      ahí: hace lo de siempre, pregunta `/auth/me`. Todavía no hay sesión en
 *      este navegador, así que ese pedido va camino a un 401 — y no es rápido,
 *      porque un 401 en `/auth/me` dispara además un intento de refresh (hasta
 *      25s de timeout) antes de darse por vencido.
 *   2. Mientras eso viaja, la página del callback canjea el credential de
 *      Google, le pega a `/auth/google`, y llama a `applySession(user)`. Ahí SÍ
 *      hay sesión: `user` queda puesto y navega a la home.
 *   3. Recién entonces contesta el `/auth/me` del paso 1, con su 401, y hace
 *      `setUser(null)`.
 *
 * El paso 3 pisa al paso 2 con una respuesta que ya no describe la realidad:
 * es la foto de un instante anterior a que la sesión existiera. `PrivateRoute`
 * ve `user === null` y redirige al login, con la sesión abierta y las cookies
 * puestas. De ahí que sea intermitente: depende de cuál de las dos llamadas
 * termine última.
 */
describe("una respuesta vieja de /auth/me no puede pisar una sesión nueva", () => {
  test("Google: applySession sobrevive al 401 de la hidratación en curso", async () => {
    const hidratacion = diferido();
    authApi.getMe.mockReturnValue(hidratacion.promesa);

    montar();
    await screen.findByText("cargando");

    // Llega la sesión de Google mientras /auth/me sigue en el aire.
    await act(async () => {
      ultimoContexto.applySession({ id: "u1", email: "ana@rincones.test" });
    });
    expect(screen.getByText("hola ana@rincones.test")).toBeInTheDocument();

    // Recién ahora contesta el /auth/me que salió ANTES de que hubiera sesión.
    await act(async () => {
      hidratacion.rechazar(sin401());
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText("hola ana@rincones.test")).toBeInTheDocument();
    });
    expect(ultimoContexto.loading).toBe(false);
  });

  test("login con email: mismo caso si alguien entra antes de que termine el arranque", async () => {
    const hidratacion = diferido();
    authApi.getMe.mockReturnValue(hidratacion.promesa);
    authApi.login.mockResolvedValue({ user: { id: "u2", email: "beto@rincones.test" } });

    montar();
    await screen.findByText("cargando");

    await act(async () => {
      await ultimoContexto.login("beto@rincones.test", "x");
    });
    expect(screen.getByText("hola beto@rincones.test")).toBeInTheDocument();

    await act(async () => {
      hidratacion.rechazar(sin401());
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText("hola beto@rincones.test")).toBeInTheDocument();
    });
  });

  test("logout no puede ser revertido por una hidratación que venía en camino", async () => {
    // El espejo del caso anterior: si el /auth/me viejo trae un usuario y llega
    // después de cerrar sesión, no puede volver a abrirla.
    const hidratacion = diferido();
    authApi.getMe.mockReturnValue(hidratacion.promesa);
    authApi.logout.mockResolvedValue({});

    montar();
    await screen.findByText("cargando");

    await act(async () => {
      await ultimoContexto.logout();
    });

    await act(async () => {
      hidratacion.resolver({ id: "u3", email: "caro@rincones.test" });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText("sin sesión")).toBeInTheDocument();
    });
  });
});

/**
 * La otra mitad: una hidratación que SÍ es la vigente tiene que poder cerrar
 * sesión cuando el server contesta 401. Sin esto, el arreglo de arriba podría
 * "arreglarse" ignorando siempre la respuesta, que es peor.
 */
describe("la hidratación vigente sí manda", () => {
  test("un 401 sin sesión previa deja el estado en 'sin sesión'", async () => {
    authApi.getMe.mockRejectedValue(sin401());

    montar();

    await waitFor(() => {
      expect(screen.getByText("sin sesión")).toBeInTheDocument();
    });
    expect(ultimoContexto.sinConexion).toBe(false);
  });

  test("una sesión válida se restaura al arrancar", async () => {
    authApi.getMe.mockResolvedValue({ id: "u4", email: "dani@rincones.test" });

    montar();

    await waitFor(() => {
      expect(screen.getByText("hola dani@rincones.test")).toBeInTheDocument();
    });
  });
});
