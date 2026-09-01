import React from "react";
import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * ── EL BUG: "TENGO QUE ACTUALIZAR PARA QUE ME RECONOZCA" ─────────────────────
 *
 * Se reportó así: confirmás el mail de una cuenta creada a mano (no con
 * Google) y la app sigue tratándote como no verificado hasta que recargás o
 * volvés atrás.
 *
 * La causa: tocar el link de confirmación desde la app de mail casi siempre
 * abre una PESTAÑA NUEVA, y en una pestaña nueva `AuthContext` arranca sin
 * sesión todavía — está a mitad de preguntarle al server quién sos. El efecto
 * de esta pantalla corre una sola vez (con el token/email de la URL) y
 * capturaba `user` de esa primera pintada: `null`, porque la hidratación
 * propia de `AuthContext` no había terminado. `if (user) refreshUser()` nunca
 * refrescaba nada, aunque `verifyEmail` ya hubiera confirmado la cuenta.
 *
 * Esta prueba fija exactamente ese caso: `useAuth` devuelve `user: null` (la
 * pestaña nueva, a mitad de hidratar) y el test comprueba que `refreshUser` se
 * llama IGUAL, sin condición.
 */
const refreshUserSpy = vi.fn();
const verifyEmailSpy = vi.fn(() => Promise.resolve({ ok: true }));

vi.mock("../src/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, refreshUser: refreshUserSpy }),
}));

vi.mock("../src/services/authApi", () => ({
  verifyEmail: (...args) => verifyEmailSpy(...args),
}));

const { default: VerifyEmailPage } = await import("../src/pages/VerifyEmailPage.jsx");

describe("VerifyEmailPage", () => {
  test("refresca la sesión aunque `user` todavía sea null en esta pestaña", async () => {
    render(
      <MemoryRouter initialEntries={["/verify-email?token=abc123&email=vos@ejemplo.com"]}>
        <VerifyEmailPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText("¡Email confirmado!")).toBeInTheDocument());

    expect(verifyEmailSpy).toHaveBeenCalledWith({ token: "abc123", email: "vos@ejemplo.com" });
    // El corazón del arreglo: sin `user`, antes esto no se llamaba nunca.
    expect(refreshUserSpy).toHaveBeenCalledTimes(1);
  });
});
