import { describe, expect, it } from "vitest";
import { resolveAuthGate } from "../src/utils/authGate";

/**
 * `resolveAuthGate` es la única fuente de verdad de a qué pantalla obligatoria
 * mandar a un usuario logueado. Se testea sola, sin router, porque es una
 * función pura — y porque el bug que arregla esta iteración (el onboarding
 * apareciendo "de la nada" después de un rato) era justo un problema de
 * datos incompletos llegando acá, no de la pantalla en sí.
 */
describe("resolveAuthGate", () => {
  it("sin usuario, no hay gate (lo resuelve PrivateRoute)", () => {
    expect(resolveAuthGate(null)).toBeNull();
  });

  it("email sin verificar manda a verificar, aunque el onboarding ya esté hecho", () => {
    expect(resolveAuthGate({ emailVerified: false, onboarded: true })).toBe("verify-email");
  });

  it("email verificado pero sin onboarding manda a onboarding", () => {
    expect(resolveAuthGate({ emailVerified: true, onboarded: false })).toBe("onboarding");
  });

  it("verificado y onboardeado no tiene gate", () => {
    expect(resolveAuthGate({ emailVerified: true, onboarded: true })).toBeNull();
  });

  it("el email se resuelve antes que el onboarding: los dos faltan a la vez", () => {
    expect(resolveAuthGate({ emailVerified: false, onboarded: false })).toBe("verify-email");
  });

  /**
   * `undefined` es el caso que causaba el bug real: si `buildAuthResponse` no
   * manda `onboarded`, el campo llega así y no como `false`. El gate tiene que
   * tratarlo como "todavía no", no como "ya está" — `!user.onboarded` cubre
   * los dos casos (`false` y `undefined`) con la misma regla.
   */
  it("un campo ausente (undefined) se trata como no cumplido, no como cumplido", () => {
    expect(resolveAuthGate({ emailVerified: true })).toBe("onboarding");
    expect(resolveAuthGate({})).toBe("verify-email");
  });
});
