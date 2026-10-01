import { describe, it, expect } from "vitest";
import { claveDe, leerSesion, guardarSesion } from "../src/utils/sesionSommelier";

/**
 * Mensajes e id de la conversación se guardan JUNTOS. Cuando sólo se guardaban
 * los mensajes, volver a la pantalla restauraba el hilo y perdía el id: la
 * pregunta siguiente abría una conversación nueva y el panel mostraba dos
 * entradas para la misma charla.
 */
const memoria = () => {
  const datos = new Map();
  return {
    getItem: (k) => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => datos.set(k, v),
    removeItem: (k) => datos.delete(k),
    datos,
  };
};

const MSJ = [
  { id: "m1", role: "user", text: "¿Qué tomo con un asado?" },
  { id: "m2", role: "assistant", text: "Un Malbec." },
];

describe("sesión del Sommelier", () => {
  it("lo que se guarda vuelve igual: mensajes Y conversación", () => {
    const s = memoria();
    guardarSesion("u1", { mensajes: MSJ, conversacionId: "abc123" }, s);
    expect(leerSesion("u1", s)).toEqual({ mensajes: MSJ, conversacionId: "abc123" });
  });

  it("un id guardado sobrevive a restaurar la charla (el bug de las dos conversaciones)", () => {
    const s = memoria();
    guardarSesion("u1", { mensajes: MSJ, conversacionId: "abc123" }, s);
    // "Salir de la pantalla y volver": se lee de nuevo de cero.
    expect(leerSesion("u1", s).conversacionId).toBe("abc123");
  });

  it("lee el formato viejo —un array de mensajes pelado— sin id", () => {
    const s = memoria();
    s.setItem(claveDe("u1"), JSON.stringify(MSJ));
    expect(leerSesion("u1", s)).toEqual({ mensajes: MSJ, conversacionId: null });
  });

  it("sin mensajes no queda nada guardado", () => {
    const s = memoria();
    guardarSesion("u1", { mensajes: MSJ, conversacionId: "abc" }, s);
    guardarSesion("u1", { mensajes: [], conversacionId: "abc" }, s);
    expect(s.datos.size).toBe(0);
    expect(leerSesion("u1", s)).toEqual({ mensajes: [], conversacionId: null });
  });

  it("cada usuario tiene la suya", () => {
    const s = memoria();
    guardarSesion("u1", { mensajes: MSJ, conversacionId: "a" }, s);
    expect(leerSesion("u2", s)).toEqual({ mensajes: [], conversacionId: null });
    expect(claveDe(undefined)).toBe("rincones:sommelier:anon");
  });

  it("JSON roto o con forma inesperada no rompe: devuelve la charla vacía", () => {
    const s = memoria();
    s.setItem(claveDe("u1"), "{no es json");
    expect(leerSesion("u1", s)).toEqual({ mensajes: [], conversacionId: null });
    s.setItem(claveDe("u1"), JSON.stringify({ otra: "cosa" }));
    expect(leerSesion("u1", s)).toEqual({ mensajes: [], conversacionId: null });
  });

  it("un id que no es texto se descarta en vez de mandarse al servidor", () => {
    const s = memoria();
    s.setItem(claveDe("u1"), JSON.stringify({ mensajes: MSJ, conversacionId: { raro: 1 } }));
    expect(leerSesion("u1", s).conversacionId).toBeNull();
  });

  it("un storage que explota (modo privado) no tira la pantalla", () => {
    const roto = {
      getItem: () => { throw new Error("denegado"); },
      setItem: () => { throw new Error("cuota"); },
      removeItem: () => { throw new Error("denegado"); },
    };
    expect(leerSesion("u1", roto)).toEqual({ mensajes: [], conversacionId: null });
    expect(() => guardarSesion("u1", { mensajes: MSJ, conversacionId: "a" }, roto)).not.toThrow();
  });
});
