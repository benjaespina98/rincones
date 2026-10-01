import { describe, it, expect } from "vitest";
import { atajosDeArranque, momentoDelDia, esFinde, azarConSemilla } from "../src/utils/atajosDeArranque";

/**
 * Los atajos de arranque del Sommelier tienen que mirar quién sos y cuándo es:
 * el momento del día, el fin de semana, la estación y, sobre todo, lo que de
 * verdad hay en la bodega. Ofrecer "¿Qué vinos tengo?" a quien no tiene ninguno
 * es prometer una pregunta que se contesta con un "nada".
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

// 2026: martes 14/07 (invierno, día hábil), sábado 17/01 (verano, finde).
const martesMediodia = new Date(2026, 6, 14, 13, 0);
const sabadoNoche = new Date(2026, 0, 17, 21, 0);

const frecuencia = (veces, hacer) => {
  const cuenta = {};
  for (let i = 0; i < veces; i += 1) {
    for (const x of hacer(i)) cuenta[x.label] = (cuenta[x.label] || 0) + 1;
  }
  return cuenta;
};

describe("momentoDelDia / esFinde", () => {
  it("parte el día en mediodía, tarde, noche y mañana", () => {
    expect(momentoDelDia(13)).toBe("mediodia");
    expect(momentoDelDia(17)).toBe("tarde");
    expect(momentoDelDia(21)).toBe("noche");
    expect(momentoDelDia(2)).toBe("noche");
    expect(momentoDelDia(8)).toBe("manana");
  });

  it("el fin de semana empieza el viernes a la noche", () => {
    expect(esFinde(new Date(2026, 0, 17, 10))).toBe(true); // sábado
    expect(esFinde(new Date(2026, 0, 18, 10))).toBe(true); // domingo
    expect(esFinde(new Date(2026, 0, 16, 21))).toBe(true); // viernes 21h
    expect(esFinde(new Date(2026, 0, 16, 10))).toBe(false); // viernes 10h
    expect(esFinde(new Date(2026, 0, 14, 21))).toBe(false); // miércoles
  });
});

describe("atajosDeArranque: las comidas", () => {
  it("devuelve cuatro, sin repetir, con su pregunta en primera persona", () => {
    const { comidas } = atajosDeArranque({ ahora: martesMediodia, azar: generador(1) });
    expect(comidas).toHaveLength(4);
    expect(new Set(comidas.map((c) => c.label)).size).toBe(4);
    for (const c of comidas) expect(c.pregunta).toMatch(/^¿Qué tomo con /);
  });

  it("el fin de semana pesa el asado y la picada (mismo mes y misma hora: sólo cambia el día)", () => {
    const miercolesNoche = new Date(2026, 0, 14, 21, 0);
    const finde = frecuencia(400, (i) => atajosDeArranque({ ahora: sabadoNoche, azar: generador(i) }).comidas);
    const semana = frecuencia(400, (i) => atajosDeArranque({ ahora: miercolesNoche, azar: generador(i) }).comidas);
    expect(finde["Asado"]).toBeGreaterThan(semana["Asado"]);
    expect(finde["Picada"]).toBeGreaterThan(semana["Picada"]);
  });

  it("al mediodía pesan los platos de mediodía (milanesas, ensalada)", () => {
    const mediodia = frecuencia(400, (i) => atajosDeArranque({ ahora: new Date(2026, 2, 10, 13), azar: generador(i) }).comidas);
    const noche = frecuencia(400, (i) => atajosDeArranque({ ahora: new Date(2026, 2, 10, 21), azar: generador(i) }).comidas);
    expect(mediodia["Ensalada"]).toBeGreaterThan(noche["Ensalada"]);
  });

  it("sigue la estación: pescado en verano, pasta en invierno", () => {
    const verano = frecuencia(400, (i) => atajosDeArranque({ ahora: new Date(2026, 0, 14, 13), azar: generador(i) }).comidas);
    const invierno = frecuencia(400, (i) => atajosDeArranque({ ahora: new Date(2026, 6, 14, 13), azar: generador(i) }).comidas);
    expect(verano["Pescado"]).toBeGreaterThan(invierno["Pescado"]);
    expect(invierno["Pasta"]).toBeGreaterThan(verano["Pasta"]);
  });

  it("cambia de una visita a otra", () => {
    const distintas = new Set();
    for (let i = 0; i < 40; i += 1) {
      distintas.add(atajosDeArranque({ ahora: martesMediodia, azar: generador(i) }).comidas.map((c) => c.label).join("|"));
    }
    expect(distintas.size).toBeGreaterThan(15);
  });
});

describe("atajosDeArranque: las preguntas", () => {
  const etiquetas = (args) => atajosDeArranque({ azar: generador(3), ...args }).preguntas.map((p) => p.label);

  it("sin bodega no ofrece nada que dependa de tenerla", () => {
    const l = etiquetas({ hayStock: false, listos: [], probados: 0 });
    expect(l).not.toContain("¿Qué abro hoy?");
    expect(l).not.toContain("¿Qué vinos tengo?");
    expect(l).not.toContain("¿Qué tomé antes?");
    expect(l.some((x) => /^¿Qué le va a mi /.test(x))).toBe(false);
  });

  it("con botellas ofrece '¿Qué abro hoy?' y '¿Qué vinos tengo?'", () => {
    const l = etiquetas({ hayStock: true });
    expect(l).toContain("¿Qué abro hoy?");
    expect(l).toContain("¿Qué vinos tengo?");
  });

  it("con un vino listo para tomar, pregunta por ese vino (con su nombre, en primera persona)", () => {
    const { preguntas } = atajosDeArranque({
      hayStock: true,
      listos: [{ name: "Quimera", varietal: "Cabernet Franc" }],
      azar: generador(3),
    });
    const p = preguntas.find((x) => x.label.startsWith("¿Qué le va a mi"));
    expect(p.label).toBe("¿Qué le va a mi Cabernet Franc?");
    // La pregunta tiene que decir "mi": es lo que hace que viaje la bodega al modelo.
    expect(p.pregunta).toBe("¿Qué plato le va a mi Cabernet Franc?");
  });

  it("un nombre largo se recorta para que el botón no se desborde", () => {
    const { preguntas } = atajosDeArranque({
      hayStock: true,
      listos: [{ name: "Una Bodega Con Un Nombre Larguísimo De Verdad" }],
      azar: generador(3),
    });
    const p = preguntas.find((x) => x.label.startsWith("¿Qué le va a mi"));
    expect(p.label.length).toBeLessThan(40);
    expect(p.label).toContain("…");
  });

  it("'¿Qué tomé antes?' sólo si ya probó algo", () => {
    expect(etiquetas({ hayStock: true, probados: 3 })).toContain("¿Qué tomé antes?");
    expect(etiquetas({ hayStock: true, probados: 0 })).not.toContain("¿Qué tomé antes?");
  });

  it("nunca pasa de cinco ni repite, y deja lugar para que algo cambie", () => {
    const todas = { hayStock: true, probados: 5, listos: [{ varietal: "Malbec" }] };
    const vistas = new Set();
    for (let i = 0; i < 40; i += 1) {
      const l = atajosDeArranque({ ...todas, azar: generador(i) }).preguntas.map((p) => p.label);
      expect(l.length).toBeLessThanOrEqual(5);
      expect(new Set(l).size).toBe(l.length);
      vistas.add(l.join("|"));
    }
    expect(vistas.size).toBeGreaterThan(5);
  });

  it("favorece la comparación con las uvas que ya tomás", () => {
    const con = frecuencia(400, (i) =>
      atajosDeArranque({ uvasFrecuentes: ["Torrontés"], azar: generador(i) }).preguntas
    );
    const sin = frecuencia(400, (i) => atajosDeArranque({ azar: generador(i) }).preguntas);
    expect(con["Torrontés o Chardonnay"]).toBeGreaterThan(sin["Torrontés o Chardonnay"]);
  });

  it("todas las preguntas son del dominio y están en primera persona o son comparaciones", () => {
    const { preguntas } = atajosDeArranque({ hayStock: true, probados: 1, listos: [{ name: "X" }], azar: generador(9) });
    for (const p of preguntas) {
      expect(p.pregunta.length).toBeGreaterThanOrEqual(3);
      expect(p.pregunta).not.toMatch(/\b(tenés|querés|preferís)\b/i);
    }
  });
});

describe("azarConSemilla", () => {
  it("con la misma semilla da la misma secuencia: los atajos no se re-sortean al llegar datos", () => {
    const a = azarConSemilla(42);
    const b = azarConSemilla(42);
    for (let i = 0; i < 20; i += 1) expect(a()).toBe(b());
  });

  it("con otra semilla, otra secuencia; y siempre entre 0 y 1", () => {
    const a = azarConSemilla(1);
    const b = azarConSemilla(2);
    expect(a()).not.toBe(b());
    for (let i = 0; i < 100; i += 1) {
      const v = a();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("las comidas no cambian cuando llegan los datos de la bodega (misma semilla)", () => {
    const antes = atajosDeArranque({ ahora: martesMediodia, azar: azarConSemilla(7) });
    const despues = atajosDeArranque({
      ahora: martesMediodia,
      hayStock: true,
      probados: 4,
      listos: [{ varietal: "Malbec" }],
      azar: azarConSemilla(7),
    });
    expect(despues.comidas).toEqual(antes.comidas);
  });
});
