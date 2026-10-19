import { describe, expect, it } from "vitest";
import { CONCEPTS } from "../src/data/wineConcepts";

/**
 * Los pop-ups que explican un concepto (taninos, añada, terroir, cada uva) tienen un formato:
 * una definición simple, un ejemplo o dato concreto y, a veces, "En tu copa:". Entre 40 y 70
 * palabras en total, en voseo y sin muletillas.
 *
 * Los guiones los cubre sin-guiones-largos.test.js.
 */
const palabras = (c) =>
  [...(Array.isArray(c.body) ? c.body : [c.body]), c.copa || ""].join(" ").split(/\s+/).filter(Boolean).length;

const MULETILLAS = [
  /es importante (destacar|notar|mencionar)/i,
  /en (resumen|conclusi[oó]n)/i,
  /cabe (destacar|mencionar|se[ñn]alar)/i,
  /sin lugar a dudas/i,
  /un mundo de/i,
  /viaje sensorial/i,
  /danza (de|en)/i,
];

// Voseo: formas de tuteo que no deben aparecer en el texto.
const TUTEO = /\b(tú|tienes|puedes|quieres|sabes|prueba|mira|nota que)\b/i;

const ids = Object.keys(CONCEPTS);

describe("conceptos de los pop-ups", () => {
  it("hay 36 conceptos (15 generales y 21 uvas)", () => {
    expect(ids).toHaveLength(36);
  });

  for (const id of ids) {
    describe(id, () => {
      const c = CONCEPTS[id];

      it("tiene definición y ejemplo en dos párrafos", () => {
        expect(Array.isArray(c.body)).toBe(true);
        expect(c.body).toHaveLength(2);
        for (const p of c.body) expect(p.trim().length).toBeGreaterThan(20);
      });

      it("tiene entre 40 y 70 palabras", () => {
        const n = palabras(c);
        expect(n, `${id}: ${n} palabras`).toBeGreaterThanOrEqual(40);
        expect(n, `${id}: ${n} palabras`).toBeLessThanOrEqual(70);
      });

      it("está en voseo y sin muletillas", () => {
        const texto = [...c.body, c.copa || ""].join(" ");
        expect(texto).not.toMatch(TUTEO);
        for (const m of MULETILLAS) expect(texto).not.toMatch(m);
      });

      it('"En tu copa:" es opcional y va sin el rótulo en el dato', () => {
        if (c.copa) {
          expect(c.copa).not.toMatch(/^en tu copa/i);
          expect(c.copa.length).toBeLessThan(120);
        }
      });
    });
  }
});
