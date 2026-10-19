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

  /**
   * Sin línea ni nombre propio el nombre queda VACÍO, y eso es lo correcto.
   *
   * El fallback a la bodega —que este mismo test defendía— era lo que hacía que
   * una etiqueta leída como bodega "Pispi" terminara guardada con nombre "Pispi"
   * y bodega "Pispi", y de ahí pasara al catálogo público. Un vino del que sólo
   * sabemos quién lo hace no tiene nombre; el vacío es el que después hace que
   * la revisión lo pida.
   */
  it("sin línea ni nombre propio NO se usa la bodega como nombre", () => {
    expect(composeDisplayName({ winery: "Bodega Norton" })).toBe("");
  });

  it("pero la búsqueda sí puede caer a la bodega", () => {
    expect(composeSearchName({ winery: "Bodega Norton" })).toBe("Bodega Norton");
  });
});

/**
 * ── EL VINO QUE SE GUARDÓ COMO "RESERVA" ────────────────────────────────────
 *
 * Reportado desde la app con una foto: un Norton Reserva escaneado entró a la
 * bodega llamado "Reserva", a secas. La lectura no estaba mal —la gama ES
 * "Reserva"— pero el nombre visible salía de la línea sin más, y "Reserva" sola
 * no nombra ninguna botella: la usan Norton, Trapiche, Salentein y otras
 * cincuenta bodegas. En la lista quedaba una fila imposible de distinguir, y
 * ese string es además el que viaja al catálogo compartido.
 */
describe("las gamas genéricas se completan con la bodega", () => {
  it("Norton Reserva no se guarda como 'Reserva'", () => {
    expect(composeDisplayName({ line: "Reserva", winery: "Bodega Norton" }))
      .toBe("Norton Reserva");
  });

  it("la bodega entra sin sus palabras societarias", () => {
    expect(composeDisplayName({ line: "Gran Reserva", winery: "Bodegas y Viñedos Trapiche" }))
      .toBe("Trapiche Gran Reserva");
    expect(composeDisplayName({ line: "Single Vineyard", winery: "Rutini Wines" }))
      .toBe("Rutini Single Vineyard");
  });

  it("una línea distintiva NO se toca: agregarle la bodega la diría dos veces", () => {
    expect(composeDisplayName({ line: "Saint Felicien", winery: "Catena Zapata" }))
      .toBe("Saint Felicien");
    expect(composeDisplayName({ line: "Broquel", winery: "Trapiche" })).toBe("Broquel");
  });

  it("si la línea ya trae la bodega, no se repite", () => {
    expect(composeDisplayName({ line: "Norton Reserva", winery: "Bodega Norton" }))
      .toBe("Norton Reserva");
  });

  it("sin bodega, la gama sola es lo único que hay", () => {
    expect(composeDisplayName({ line: "Reserva" })).toBe("Reserva");
  });

  /**
   * Los que YA entraron mal se arreglan al dibujar, sin migración: lo que se
   * guardó no se toca, lo que se lee sí.
   */
  it("un vino ya guardado como 'Reserva' se muestra con su bodega", () => {
    expect(wineDisplayName({ name: "Reserva", winery: "Bodega Norton", varietal: "Malbec" }))
      .toBe("Norton Reserva");
  });

  it("y uno con nombre propio se sigue mostrando tal cual", () => {
    expect(wineDisplayName({ name: "Saint Felicien", winery: "Catena Zapata" }))
      .toBe("Saint Felicien");
  });
});

describe("wineDisplayName: no deja un nombre cortado en un conector", () => {
  it("'Rosado de Malbec' con uva Malbec se queda entero (no 'Rosado de')", () => {
    expect(wineDisplayName({ name: "Rosado de Malbec", varietal: "Malbec" })).toBe("Rosado de Malbec");
    expect(wineDisplayName({ name: "Rosé de Malbec", varietal: "Malbec" })).toBe("Rosé de Malbec");
    expect(wineDisplayName({ name: "Vino con Malbec", varietal: "Malbec" })).toBe("Vino con Malbec");
  });

  it("sigue sacando la uva pegada cuando el resto es un nombre de verdad", () => {
    expect(wineDisplayName({ name: "Saint Felicien Malbec", varietal: "Malbec" })).toBe("Saint Felicien");
  });
});
