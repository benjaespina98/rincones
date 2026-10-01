import { describe, it, expect } from "vitest";
import { sugerenciasDeBusqueda, estacionDe } from "../src/utils/sugerenciasBusqueda";

/**
 * Los atajos de Descubrí tienen que cambiar entre visitas, seguir la estación,
 * favorecer lo que ya tomás y no llenar la fila de tintos. El azar se inyecta
 * con un generador fijo para que los tests no sean flojos ni intermitentes.
 */
const generador = (semilla) => {
  let a = semilla;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const TINTOS = new Set([
  "Malbec", "Cabernet Franc", "Pinot Noir", "Bonarda", "Merlot",
  "Cabernet Sauvignon", "Syrah", "Tannat", "Petit Verdot", "Gran Reserva",
]);

const frecuencia = (veces, hacer) => {
  const cuenta = {};
  for (let i = 0; i < veces; i += 1) {
    for (const q of hacer(i)) cuenta[q] = (cuenta[q] || 0) + 1;
  }
  return cuenta;
};

describe("estacionDe (hemisferio sur)", () => {
  it("el verano cruza el cambio de año", () => {
    for (const mes of [11, 0, 1, 2]) expect(estacionDe(mes)).toBe("calor");
    for (const mes of [5, 6, 7]) expect(estacionDe(mes)).toBe("frio");
    for (const mes of [3, 4, 8, 9, 10]) expect(estacionDe(mes)).toBe("todo");
  });
});

describe("sugerenciasDeBusqueda", () => {
  it("devuelve la cantidad pedida, sin repetidas", () => {
    const r = sugerenciasDeBusqueda({ cantidad: 6, azar: generador(1) });
    expect(r).toHaveLength(6);
    expect(new Set(r).size).toBe(6);
  });

  it("nunca llena la fila de tintos: tope de dos tercios", () => {
    for (let i = 0; i < 300; i += 1) {
      const r = sugerenciasDeBusqueda({ cantidad: 6, mes: 6, azar: generador(i) });
      expect(r.filter((q) => TINTOS.has(q)).length).toBeLessThanOrEqual(4);
    }
  });

  it("cambia de una visita a otra", () => {
    const distintas = new Set();
    for (let i = 0; i < 40; i += 1) {
      distintas.add(sugerenciasDeBusqueda({ azar: generador(i) }).join("|"));
    }
    expect(distintas.size).toBeGreaterThan(20);
  });

  it("sigue la estación: Torrontés en verano, Syrah en invierno", () => {
    const verano = frecuencia(400, (i) => sugerenciasDeBusqueda({ mes: 0, azar: generador(i) }));
    const invierno = frecuencia(400, (i) => sugerenciasDeBusqueda({ mes: 6, azar: generador(i) }));
    expect(verano["Torrontés"]).toBeGreaterThan(invierno["Torrontés"]);
    expect(invierno["Syrah"]).toBeGreaterThan(verano["Syrah"]);
    expect(verano["Espumante"]).toBeGreaterThan(invierno["Espumante"]);
  });

  it("favorece las uvas que ya tomás, sin volverlas obligatorias", () => {
    const sin = frecuencia(400, (i) => sugerenciasDeBusqueda({ mes: 9, azar: generador(i) }));
    const con = frecuencia(400, (i) =>
      sugerenciasDeBusqueda({ mes: 9, uvasFrecuentes: ["bonarda"], azar: generador(i) })
    );
    expect(con["Bonarda"]).toBeGreaterThan(sin["Bonarda"]);
    // Y no obligatoria: hay corridas donde no aparece.
    expect(con["Bonarda"]).toBeLessThan(400);
  });

  it("'otras ideas' no repite lo que ya se estaba mostrando", () => {
    for (let i = 0; i < 100; i += 1) {
      const antes = sugerenciasDeBusqueda({ cantidad: 6, azar: generador(i) });
      const despues = sugerenciasDeBusqueda({ cantidad: 6, excluir: antes, azar: generador(i + 1000) });
      expect(despues.filter((q) => antes.includes(q))).toEqual([]);
    }
  });

  it("si el pozo no alcanza para no repetir, completa con lo ya visto antes que mostrar menos", () => {
    const antes = sugerenciasDeBusqueda({ cantidad: 12, azar: generador(3) });
    const despues = sugerenciasDeBusqueda({ cantidad: 12, excluir: antes, azar: generador(4) });
    expect(despues).toHaveLength(12);
    expect(new Set(despues).size).toBe(12);
  });

  it("pedir más de lo que hay devuelve todo el pozo, una vez cada uno", () => {
    const r = sugerenciasDeBusqueda({ cantidad: 99, azar: generador(5) });
    expect(r).toHaveLength(15);
    expect(new Set(r).size).toBe(15);
  });

  it("es determinista con el mismo azar", () => {
    expect(sugerenciasDeBusqueda({ mes: 1, azar: generador(7) })).toEqual(
      sugerenciasDeBusqueda({ mes: 1, azar: generador(7) })
    );
  });
});
