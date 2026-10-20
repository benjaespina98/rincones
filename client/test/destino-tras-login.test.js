import { describe, it, expect } from "vitest";
import { destinoTrasLogin } from "../src/utils/destinoTrasLogin";

describe("destinoTrasLogin", () => {
  it("vuelve a la pantalla que se quería abrir, con su búsqueda", () => {
    expect(destinoTrasLogin("/vino/abc123")).toBe("/vino/abc123");
    expect(destinoTrasLogin("/bodega?vista=probados")).toBe("/bodega?vista=probados");
  });

  it("sin destino, o con uno que no es una ruta interna, va al inicio", () => {
    for (const malo of [undefined, null, "", 42, "https://otro.com", "//otro.com", "otro", "/" + String.fromCharCode(92) + "otro.com", "javascript:alert(1)"]) {
      expect(destinoTrasLogin(malo)).toBe("/");
    }
  });

  it("nunca vuelve a una pantalla de acceso (evita el bucle)", () => {
    for (const p of ["/login", "/register", "/forgot-password", "/reset-password/tok", "/verify-email?token=x", "/onboarding"]) {
      expect(destinoTrasLogin(p)).toBe("/");
    }
  });
});
