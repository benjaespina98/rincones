import { describe, it, expect } from "vitest";
import { pasaVista, normalizarVista } from "../src/utils/cellarViews";

/**
 * Las tres vistas de Mi Bodega.
 *
 * ── EL COMPORTAMIENTO QUE NO TENÍA LÓGICA ───────────────────────────────────
 * La tercera vista se llamaba "Historial" pero preguntaba `quantity <= 0`, que es
 * otra cosa: "no me queda ninguna". De ahí salía esto, reportado desde la app:
 *
 *   1. Tomás tu última botella → el vino aparece en Historial. Bien.
 *   2. Comprás otra y tocás "+" → el vino DESAPARECE del historial.
 *
 * Reponer stock borraba el hecho de haberlo tomado. Y al revés: un vino que
 * tomaste y del que te quedan dos botellas nunca aparecía, y uno cargado por
 * error y bajado a cero figuraba "en el historial" sin haberse probado nunca.
 *
 * Son dos hechos independientes —¿lo tengo? y ¿lo tomé?— y estaban colapsados en
 * uno solo. Este test fija que no vuelvan a mezclarse.
 */

const yaLoTomasteYRepusiste = { quantity: 1, tasted: true };
const teQuedaronYYaLoTomaste = { quantity: 2, tasted: true };
const seTerminoYNuncaLoProbaste = { quantity: 0, tasted: false };
const sinAbrirTodavia = { quantity: 3, tasted: false };

describe("las tres vistas de la bodega", () => {
  it("reponer stock no te saca de Probados: el caso que se reportó", () => {
    // Paso 1: se terminó y lo habías tomado.
    expect(pasaVista("probados", { quantity: 0, tasted: true })).toBe(true);
    // Paso 2: comprás otra. Sigue estando probado, y además vuelve a En stock.
    expect(pasaVista("probados", yaLoTomasteYRepusiste)).toBe(true);
    expect(pasaVista("instock", yaLoTomasteYRepusiste)).toBe(true);
  });

  it("tener botellas no te saca de Probados", () => {
    // Antes esto era imposible: con stock, el vino no aparecía en el historial
    // aunque lo hubieras tomado diez veces.
    expect(pasaVista("probados", teQuedaronYYaLoTomaste)).toBe(true);
    expect(pasaVista("instock", teQuedaronYYaLoTomaste)).toBe(true);
  });

  it("quedarte sin botellas no te mete en Probados", () => {
    // Un vino que cargaste de más y bajaste a cero no lo tomaste nunca, y antes
    // aparecía en el "historial" igual.
    expect(pasaVista("probados", seTerminoYNuncaLoProbaste)).toBe(false);
    expect(pasaVista("instock", seTerminoYNuncaLoProbaste)).toBe(false);
    // No se pierde: está en "Todos".
    expect(pasaVista("all", seTerminoYNuncaLoProbaste)).toBe(true);
  });

  it("lo que tenés sin abrir está en stock y no entre los probados", () => {
    expect(pasaVista("instock", sinAbrirTodavia)).toBe(true);
    expect(pasaVista("probados", sinAbrirTodavia)).toBe(false);
  });

  it("\"Todos\" es todos, sin excepción", () => {
    for (const w of [yaLoTomasteYRepusiste, teQuedaronYYaLoTomaste, seTerminoYNuncaLoProbaste, sinAbrirTodavia]) {
      expect(pasaVista("all", w)).toBe(true);
    }
  });

  it("un enlace viejo a \"historial\" sigue llevando a algún lado", () => {
    // La vista se renombró. Traducir el nombre viejo cuesta una línea y evita que
    // un favorito guardado, o la preferencia que quedó en el navegador, caigan en
    // una vista que no existe.
    expect(normalizarVista("historial")).toBe("probados");
    expect(normalizarVista("instock")).toBe("instock");
    expect(normalizarVista("cualquier-cosa")).toBe(null);
  });
});
