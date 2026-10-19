import { describe, it, expect, beforeEach } from "vitest";
import { limpiarDatosLocales, CLAVES_POR_PERSONA } from "../src/utils/limpiarDatosLocales";

describe("limpiarDatosLocales", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("borra lo que es de una persona y deja lo demás", () => {
    for (const k of CLAVES_POR_PERSONA) localStorage.setItem(k, "x");
    localStorage.setItem("otra_cosa", "queda");
    limpiarDatosLocales();
    for (const k of CLAVES_POR_PERSONA) expect(localStorage.getItem(k)).toBeNull();
    expect(localStorage.getItem("otra_cosa")).toBe("queda");
  });

  it("no revienta si el almacenamiento no está disponible", () => {
    const original = Storage.prototype.removeItem;
    Storage.prototype.removeItem = () => {
      throw new Error("bloqueado");
    };
    try {
      expect(() => limpiarDatosLocales()).not.toThrow();
    } finally {
      Storage.prototype.removeItem = original;
    }
  });
});
