import { describe, it, expect } from "vitest";
import { pasaVista, normalizarVista, VISTA_DESEOS, VISTAS } from "../src/utils/cellarViews";
import { TABS, ADD_PATH, tabForPath } from "../src/data/navigation";

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
    // No se pierde de la bodega —sigue estando el buscador para encontrarlo—,
    // pero ya no tiene una cuarta vista "Todos" que lo muestre sin buscar
    // nada: ver el comentario grande sobre por qué se sacó, en
    // cellarViews.js.
  });

  it("lo que tenés sin abrir está en stock y no entre los probados", () => {
    expect(pasaVista("instock", sinAbrirTodavia)).toBe(true);
    expect(pasaVista("probados", sinAbrirTodavia)).toBe(false);
  });

  it("un enlace viejo a \"historial\" sigue llevando a algún lado", () => {
    // La vista se renombró. Traducir el nombre viejo cuesta una línea y evita que
    // un favorito guardado, o la preferencia que quedó en el navegador, caigan en
    // una vista que no existe.
    expect(normalizarVista("historial")).toBe("probados");
    expect(normalizarVista("instock")).toBe("instock");
    expect(normalizarVista("cualquier-cosa")).toBe(null);
  });

  it("un enlace viejo a \"Todos\" (?vista=all) aterriza en 'En stock'", () => {
    // "Todos" se sacó del segmentado (ver el comentario grande en
    // cellarViews.js) — un enlace guardado de antes no puede caer en una
    // vista que ya no existe.
    expect(normalizarVista("all")).toBe("instock");
    expect(VISTAS).not.toContain("all");
  });
});

/**
 * ── LA CUARTA VISTA: "FAVORITOS" ────────────────────────────────────────────
 *
 * Era "Quiero probar", una PESTAÑA de la barra de navegación ("Guardados")
 * con su propia pantalla, y sólo mostraba la wishlist. Se unificó con el
 * OTRO "favorito" que ya tenía la app —el corazón de un vino que sí tenés—
 * porque los dos significaban lo mismo bajo dos nombres, y "Quiero probar"
 * mentía sobre un vino que ya tenías y te gustaba (no es cierto que "querés
 * probarlo": ya lo probaste).
 *
 * Lo que estos tests fijan es lo que se puede romper sin que se note al
 * mirarla: que sólo entren los favoritos de verdad (no toda la bodega, ni
 * ninguno por opción), y que los enlaces viejos sigan aterrizando donde la
 * persona esperaba.
 */
describe("\"Favoritos\" dentro de Mi Bodega", () => {
  it("sólo el vino con el corazón puesto entra en esta vista", () => {
    // Si `pasaVista` devolviera `true` por omisión —que es el default de la
    // función para lo que no reconoce— la vista mostraría toda la bodega,
    // favorito o no: exactamente lo que esta vista dejó de ser cuando era
    // sólo la wishlist, y lo que tampoco puede pasar ahora.
    for (const w of [
      { quantity: 3, tasted: false, favorite: false },
      { quantity: 0, tasted: true, favorite: false },
      { quantity: 3, tasted: false }, // sin el campo: tampoco es favorito
    ]) {
      expect(pasaVista(VISTA_DESEOS, w)).toBe(false);
    }
  });

  it("cualquier vino tuyo con el corazón puesto entra, tenga o no stock", () => {
    // Es justo el caso que "Quiero probar" dejaba afuera: un vino que SÍ
    // tenés (o que ya tomaste y se te terminó) y marcaste como favorito
    // porque te gusta — no porque "quieras probarlo".
    expect(pasaVista(VISTA_DESEOS, { quantity: 2, tasted: false, favorite: true })).toBe(true);
    expect(pasaVista(VISTA_DESEOS, { quantity: 0, tasted: true, favorite: true })).toBe(true);
  });

  it("el enlace viejo /guardados aterriza en la vista nueva", () => {
    expect(normalizarVista("guardados")).toBe(VISTA_DESEOS);
    expect(VISTAS).toContain(VISTA_DESEOS);
  });
});

/**
 * La barra de navegación.
 *
 * "Guardados" tenía pestaña propia y ya no: la funcionalidad se mudó adentro de
 * Mi Bodega. El hueco NO se rellenó con otra sección para que la fila quedara
 * pareja, y esa decisión es justamente la que un cambio futuro puede deshacer
 * sin querer.
 */
describe("la barra de navegación", () => {
  it("no tiene una pestaña de guardados", () => {
    expect(TABS.some((t) => t.path === "/guardados")).toBe(false);
  });

  it("son cuatro lugares y nada más (Escanear va en el centro, aparte)", () => {
    // Cuatro LUGARES. Nada de rellenar la fila para que quede pareja: si una
    // sección no se justifica, la barra tiene una menos y listo.
    expect(TABS.map((t) => t.path)).toEqual(["/", "/bodega", "/sommelier", "/perfil"]);
  });

  it("agregar no es una pestaña: es la acción flotante", () => {
    // Cargar una botella no es un lugar al que se va y del que se vuelve, es
    // una tarea que se dispara desde donde estés. Como pestaña obligaba a un
    // botón redondo a repartirse el ancho con secciones que se visitan mucho
    // menos; afuera es siempre del mismo tamaño y en el mismo lugar.
    expect(TABS.some((t) => t.path === ADD_PATH)).toBe(false);
    expect(TABS.some((t) => t.primary)).toBe(false);
    expect(ADD_PATH).toBe("/agregar");
  });

  it("estando en la carga, la barra no marca ninguna sección", () => {
    // Es una tarea encima de la app, no una sección: si marcara una pestaña
    // estaría diciendo que la persona "está en" un lugar que no existe.
    expect(tabForPath(ADD_PATH)).toBe(null);
  });

  it("la ficha de un vino no apaga la barra: sigue marcando de dónde viniste", () => {
    expect(tabForPath("/vino/abc123")).toBe("bodega");
    expect(tabForPath("/descubrir/vino")).toBe("descubri");
  });
});
