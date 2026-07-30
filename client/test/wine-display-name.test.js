import { describe, it, expect } from "vitest";
import { wineDisplayName, composeDisplayName, composeSearchName } from "../src/utils/wineIdentity";

/**
 * El nombre de un vino NUNCA muestra la uva: ya la dice su propio chip.
 *
 * Esto se aplica al dibujar, así que protege también a los vinos cargados antes
 * del cambio —los que tienen la uva pegada al nombre— sin depender de que la
 * migración haya corrido. Por eso vale un test propio: es un invariante de la
 * interfaz, no un detalle de los datos.
 */
describe("wineDisplayName", () => {
  it("saca la uva del final del nombre", () => {
    expect(wineDisplayName({ name: "Álamos Cabernet Sauvignon", varietal: "Cabernet Sauvignon" }))
      .toBe("Álamos");
    expect(wineDisplayName({ name: "Saint Felicien Malbec", varietal: "Malbec" }))
      .toBe("Saint Felicien");
  });

  it("no toca un nombre que ya viene limpio", () => {
    expect(wineDisplayName({ name: "Saint Felicien", varietal: "Malbec" })).toBe("Saint Felicien");
  });

  it("ignora acentos y mayúsculas al comparar", () => {
    expect(wineDisplayName({ name: "Zuccardi Serie A Torrontes", varietal: "Torrontés" }))
      .toBe("Zuccardi Serie A");
  });

  it("no recorta si la uva no está al FINAL", () => {
    // "Malbec" aparece, pero el nombre no termina con él: recortarlo sería
    // inventar. Se deja tal cual.
    expect(wineDisplayName({ name: "Malbec de Familia", varietal: "Malbec" }))
      .toBe("Malbec de Familia");
  });

  it("compara por palabras completas, no por caracteres", () => {
    // El caso que rompe cualquier implementación con substrings: recortando a ojo
    // quedaría "Saint Felicien Cabernet".
    expect(wineDisplayName({ name: "Saint Felicien Cabernet Sauvignon", varietal: "Sauvignon" }))
      .toBe("Saint Felicien Cabernet");
  });

  it("nunca deja un vino sin nombre", () => {
    // Un vino que se llama sólo como su uva conserva el nombre: vaciarlo sería
    // peor que repetir la uva.
    expect(wineDisplayName({ name: "Malbec", varietal: "Malbec" })).toBe("Malbec");
    expect(wineDisplayName({ name: "", varietal: "Malbec" })).toBe("");
    expect(wineDisplayName({})).toBe("");
  });
});

describe("composeDisplayName / composeSearchName", () => {
  const saintFelicien = { line: "Saint Felicien", varietal: "Malbec", winery: "Catena Zapata" };

  it("lo que se muestra no lleva la uva; lo que se busca sí", () => {
    expect(composeDisplayName(saintFelicien)).toBe("Saint Felicien");
    expect(composeSearchName(saintFelicien)).toBe("Saint Felicien Malbec");
  });

  it("el nombre propio le gana a la línea", () => {
    expect(composeDisplayName({ name: "Angélica Zapata", line: "Catena Alta" }))
      .toBe("Angélica Zapata");
  });

  it("sin línea ni nombre propio queda la bodega, no un vacío", () => {
    expect(composeDisplayName({ winery: "Bodega Norton" })).toBe("Bodega Norton");
  });
});
