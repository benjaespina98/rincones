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

  it("email sin verificar manda a verificar, aunque lo demás ya esté hecho", () => {
    expect(resolveAuthGate({ emailVerified: false, hasBirthDate: true, onboarded: true })).toBe("verify-email");
  });

  it("email verificado pero sin fecha de nacimiento manda a completarla (cuentas de Google)", () => {
    expect(resolveAuthGate({ emailVerified: true, hasBirthDate: false, onboarded: true })).toBe("birthdate");
  });

  it("con fecha de nacimiento pero sin onboarding manda a onboarding", () => {
    expect(resolveAuthGate({ emailVerified: true, hasBirthDate: true, onboarded: false })).toBe("onboarding");
  });

  it("verificado, con fecha de nacimiento y onboardeado no tiene gate", () => {
    expect(resolveAuthGate({ emailVerified: true, hasBirthDate: true, onboarded: true })).toBeNull();
  });

  it("el email se resuelve antes que la fecha de nacimiento y el onboarding: todos faltan a la vez", () => {
    expect(resolveAuthGate({ emailVerified: false, hasBirthDate: false, onboarded: false })).toBe("verify-email");
  });

  it("la fecha de nacimiento se resuelve antes que el onboarding", () => {
    expect(resolveAuthGate({ emailVerified: true, hasBirthDate: false, onboarded: false })).toBe("birthdate");
  });

  /**
   * `undefined` es el caso que causaba el bug real: si `buildAuthResponse` no
   * manda `onboarded`, el campo llega así y no como `false`. El gate tiene que
   * tratarlo como "todavía no", no como "ya está" — `!user.campo` cubre los
   * dos casos (`false` y `undefined`) con la misma regla. Cuentas de ANTES de
   * `hasBirthDate` (todo registro pedía la fecha) también llegan así en algún
   * caché viejo, y tienen que tratarse igual: "todavía no", no un bloqueo real.
   */
  it("un campo ausente (undefined) se trata como no cumplido, no como cumplido", () => {
    expect(resolveAuthGate({ emailVerified: true, hasBirthDate: true })).toBe("onboarding");
    expect(resolveAuthGate({ emailVerified: true })).toBe("birthdate");
    expect(resolveAuthGate({})).toBe("verify-email");
  });
});
