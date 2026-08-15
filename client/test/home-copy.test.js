import { describe, it, expect } from "vitest";
import { homeTitle } from "../src/utils/momentCopy";

/**
 * El lado visible del bug de stock: la home anunciaba "Ya no te queda nada en
 * stock" con botellas en la cava, porque el server contaba el stock por
 * `status` y un vino probado deja de tener status "stock" aunque le queden
 * botellas (ver server/test/userStats.test.js).
 *
 * Estos tests fijan el contrato del texto, que es lo que el usuario lee: la
 * frase de bodega vacía sale SÓLO cuando de verdad no queda nada.
 */
describe("homeTitle", () => {
  const stats = (totals) => ({ totals, topVarietals: [], topRegions: [], countsByType: [] });

  it("no anuncia bodega vacía cuando quedan botellas", () => {
    const titulo = homeTitle({ stats: stats({ total: 1, stock: 1, bottles: 3, consumed: 1 }) });
    expect(titulo).not.toBe("Ya no te queda nada en stock");
  });

  it("anuncia que no queda nada sólo cuando el stock es cero", () => {
    const titulo = homeTitle({ stats: stats({ total: 4, stock: 0, bottles: 0, consumed: 4 }) });
    expect(titulo).toBe("Ya no te queda nada en stock");
  });

  it("habla de una botella cuando queda una botella, no cuando queda un vino", () => {
    // Un vino con seis botellas no es "te queda una botella".
    const seisBotellas = homeTitle({ stats: stats({ total: 1, stock: 1, bottles: 6, consumed: 0 }) });
    expect(seisBotellas).not.toBe("Te queda una botella");
  });

  it("sin stats todavía no afirma nada sobre la bodega", () => {
    // `null` es "la consulta no respondió", no "bodega en cero".
    expect(homeTitle({ stats: null })).toBe("¿Qué vino descubrimos hoy?");
  });

  it("con la bodega sin cargar invita a empezarla", () => {
    const titulo = homeTitle({ stats: stats({ total: 0, stock: 0, bottles: 0, consumed: 0 }) });
    expect(titulo).toBe("Empecemos tu bodega");
  });
});
