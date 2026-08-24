import { describe, it, expect } from "vitest";
import { homeTitle } from "../src/utils/momentCopy";

/**
 * El renglón de estado de la home.
 *
 * Sólo aparece cuando hay algo accionable que decir. Antes salía siempre —una
 * pregunta retórica rotativa— y por eso hubo que fijar por test que no mintiera
 * sobre el stock: la home anunciaba "Ya no te queda nada en stock" con botellas
 * en la cava, porque el server contaba el stock por `status` y un vino probado
 * deja de tener status "stock" aunque le queden botellas (ver
 * server/test/userStats.test.js).
 *
 * Ese contrato sigue valiendo con el texto nuevo, y encima ahora se puede
 * probar algo más fuerte: con la bodega andando NO hay renglón.
 */
describe("homeTitle", () => {
  const stats = (totals) => ({ totals, topVarietals: [], topRegions: [], countsByType: [] });

  it("no dice nada cuando la bodega está andando", () => {
    // Ningún aviso es la respuesta correcta: el espacio es para el buscador y
    // la recomendación, no para un renglón de relleno.
    expect(homeTitle({ stats: stats({ total: 1, stock: 1, bottles: 3, consumed: 1 }) })).toBe(null);
  });

  it("avisa que no queda stock sólo cuando de verdad no queda", () => {
    expect(homeTitle({ stats: stats({ total: 4, stock: 0, bottles: 0, consumed: 4 }) }))
      .toBe("No te quedan botellas en stock");
  });

  it("sin stats todavía no afirma nada sobre la bodega", () => {
    // `null` es "la consulta no respondió", no "bodega en cero".
    expect(homeTitle({ stats: null })).toBe(null);
  });

  it("con la bodega sin cargar, lo dice", () => {
    expect(homeTitle({ stats: stats({ total: 0, stock: 0, bottles: 0, consumed: 0 }) }))
      .toBe("Todavía no cargaste ningún vino");
  });
});
