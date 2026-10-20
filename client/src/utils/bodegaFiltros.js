import { normalizeSearchText } from "./text";
import { wineDisplayName } from "./wineIdentity";
import { getCellarStatus } from "./cellarStatus";
import { WINE_TYPE_LABELS } from "../data/wineReference";

/**
 * Buscar, filtrar y ordenar la bodega.
 *
 * ── POR QUÉ ESTO SALIÓ DE BodyPage ──────────────────────────────────────────
 * Vivía adentro de un componente de 1965 líneas, envuelto en `useCallback` y
 * `useMemo`. Eso tenía dos costos concretos:
 *
 *   · No se podía testear. La regla de que "buscar mira TODA tu bodega y no la
 *     pestaña abierta" salió de un bug reportado desde la app —se cargaba un
 *     Piatelli, se escribía "piatelli" y no aparecía— y no había forma de
 *     fijarla sin montar la pantalla entera.
 *   · No se podía leer. Para entender por qué un vino no aparece había que
 *     seguir cinco closures a través de mil líneas de JSX.
 *
 * Acá son funciones puras: entran datos, sale una decisión. El componente
 * decide CUÁNDO llamarlas; estas deciden QUÉ pasa.
 */

/**
 * Las palabras de la búsqueda, normalizadas una vez.
 *
 * Se normaliza acá y no adentro del filtro porque si no se hace una vez por
 * VINO en vez de una por tecla: con 300 vinos, el mismo string se partía y
 * normalizaba 300 veces en cada pulsación.
 */
export const terminosDe = (searchTerm) =>
  normalizeSearchText(searchTerm || "").split(/\s+/).filter(Boolean);

/**
 * Todo el texto por el que se puede encontrar un vino.
 *
 * La lista creció por reportes, no por diseño: al principio eran nombre,
 * región, bodega, uva y notas. Faltaban la cosecha y el tipo —"2019" y "tinto"
 * son de las primeras cosas que uno escribe— y las tres maneras en que uno se
 * acuerda de una botella cuando no le viene el nombre: dónde la guardó
 * ("heladera"), dónde la compró ("carrefour") y en qué estante quedó.
 */
export const haystackDe = (wine) =>
  [
    wine.name,
    wine.region,
    wine.winery,
    wine.varietal,
    wine.notes,
    wine.vintage,
    WINE_TYPE_LABELS[wine.type],
    wine.cellar?.location,
    wine.cellar?.shelf,
    wine.purchase?.store,
  ]
    .map(normalizeSearchText)
    .join(" ");

/**
 * ¿Este vino pasa la búsqueda y las facetas?
 *
 * Cada palabra tiene que aparecer en ALGÚN campo, no la frase entera en uno
 * solo: así "rutini 2019" y "malbec uco" encuentran lo que corresponde, cosa
 * que antes fallaba porque se buscaba el texto completo dentro de un único
 * campo.
 */
export const pasaBusqueda = (wine, terms, facetas = {}) => {
  const {
    tipo = "all",
    varietal = "all",
    region = "all",
    vintage = "all",
    winery = "all",
    puntajeMin = "all",
  } = facetas;

  const haystack = haystackDe(wine);
  if (!terms.every((term) => haystack.includes(term))) return false;
  if (tipo !== "all" && wine.type !== tipo) return false;
  if (varietal !== "all" && wine.varietal !== varietal) return false;
  if (region !== "all" && wine.region !== region) return false;
  if (winery !== "all" && wine.winery !== winery) return false;
  // Puntaje mínimo: 4 es "4 o más". Un vino sin puntuar no pasa: no es un 0, es un dato que falta.
  if (puntajeMin !== "all" && !(Number(wine.rating) >= Number(puntajeMin))) return false;
  // El año se compara como texto porque la opción viene del combo, que maneja
  // strings; el vino lo guarda como número.
  if (vintage !== "all" && String(wine.vintage || "") !== vintage) return false;
  return true;
};

/**
 * Los filtros que no son facetas: probado y "listo para tomar".
 *
 * "Favoritos" no está acá porque dejó de ser un filtro combinable: es su propia
 * vista (ver VISTA_DESEOS en cellarViews.js), mismo trato que "Probados".
 */
export const pasaFiltros = (wine, { probado = null, soloListos = false } = {}) => {
  if (probado !== null && Boolean(wine.tasted) !== probado) return false;
  if (soloListos && getCellarStatus(wine).status !== "peak") return false;
  return true;
};

/**
 * Las opciones de cada combo, sacadas de lo que la persona tiene de verdad.
 *
 * Las cosechas van de la más nueva a la más vieja y como texto, porque el combo
 * maneja strings. Y la lista misma es la respuesta a "¿qué años tengo?" antes
 * de filtrar nada — escribir "2019" en el buscador no contesta esa pregunta.
 */
export const opcionesDe = (wines = []) => ({
  varietales: [...new Set(wines.map((w) => w.varietal).filter(Boolean))].sort(),
  regiones: [...new Set(wines.map((w) => w.region).filter(Boolean))].sort(),
  bodegas: [...new Set(wines.map((w) => w.winery).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")),
  cosechas: [...new Set(wines.map((w) => w.vintage).filter(Boolean))]
    .sort((a, b) => b - a)
    .map(String),
});

const tiempoDe = (valor) => {
  const t = new Date(valor || 0).getTime();
  return Number.isFinite(t) ? t : 0;
};

/**
 * Cuándo pasó algo por última vez con este vino: el momento más nuevo entre que lo cargaste, que
 * sumaste botellas (la fecha de cada lote) y que abriste una. Es lo que "recientes" quiere decir:
 * en "Ya tomados" manda lo que tomaste hace poco, en "En stock" lo que cargaste o repusiste hace
 * poco. Sin fechas, 0 (queda al final).
 */
export const fechaReciente = (wine) =>
  Math.max(
    tiempoDe(wine?.createdAt),
    tiempoDe(wine?.lastConsumedAt),
    ...(Array.isArray(wine?.lots) ? wine.lots.map((l) => tiempoDe(l?.addedAt)) : [])
  );

/** El comparador de cada orden. Separado para poder testearlo suelto. */
export const comparadorDe = (sortBy) => (a, b) => {
  if (sortBy === "rating") return (b.rating || 0) - (a.rating || 0);
  if (sortBy === "year") return (b.vintage || 0) - (a.vintage || 0);
  // Más cara primero, como "Mejor puntuados" pone la nota más alta primero. Sin
  // precio cargado queda al final: no es una botella barata, es un dato que
  // falta, y las dos cosas no pueden verse igual en la lista.
  if (sortBy === "price") return (b.purchase?.price || 0) - (a.purchase?.price || 0);
  if (sortBy === "name") return wineDisplayName(a).localeCompare(wineDisplayName(b), "es");
  return fechaReciente(b) - fechaReciente(a);
};

/**
 * Ordena la lista, con dos reglas que mandan sobre el orden elegido.
 *
 * ── EL STOCK VA PRIMERO ─────────────────────────────────────────────────────
 * Mi Bodega responde "¿qué tengo para tomar?". En las vistas que mezclan, lo
 * que ya se terminó quedaba intercalado entre lo que sí hay, así que con 300
 * vinos había que ir salteando botellas vacías para encontrar una llena. Lo
 * vacío no desaparece —sigue siendo parte de la colección— pero deja de ser
 * protagonista.
 *
 * ── Y EL GRUPO ANTES QUE TODO ───────────────────────────────────────────────
 * Con agrupación activa hay que ordenar primero por grupo: si no, los vinos de
 * cada grupo quedan intercalados y el corte salta en cada cambio. Con 92 vinos
 * aparecían 35 encabezados repitiendo "Tinto / Blanco / Tinto".
 */
export const ordenarVinos = (wines = [], { sortBy = "recent", groupOf = null } = {}) => {
  const porOrden = comparadorDe(sortBy);

  // Por defecto ("recientes") el orden es PURO: lo último primero, sin reglas encima. El "stock
  // primero" sólo acompaña a un orden que la persona eligió a propósito.
  const conStockPrimero = (a, b) => {
    if (sortBy === "recent" || !sortBy) return porOrden(a, b);
    const sa = Number(a.quantity) > 0 ? 0 : 1;
    const sb = Number(b.quantity) > 0 ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return porOrden(a, b);
  };

  if (!groupOf) return [...wines].sort(conStockPrimero);

  return [...wines].sort((a, b) => {
    const ga = groupOf(a) || "";
    const gb = groupOf(b) || "";
    if (ga !== gb) return ga.localeCompare(gb, "es");
    return conStockPrimero(a, b);
  });
};

/**
 * ── BUSCAR MIRA TODA TU BODEGA, NO LA PESTAÑA ABIERTA ───────────────────────
 *
 * Reportado desde la app: se cargaba un Piatelli, se escribía "piatelli" y la
 * búsqueda no lo traía. El vino estaba y el texto coincidía; lo que pasaba es
 * que la pestaña abierta era "En stock" y ese vino no tenía botellas. Buscar
 * exigía adivinar antes en qué pestaña estaba el vino — que es exactamente lo
 * que uno viene a averiguar.
 *
 * Si hay búsqueda y en esta vista no hay nada pero en la bodega sí, se
 * devuelven ésos con `ampliada: true`, para que la pantalla lo diga. Nunca en
 * silencio: cambiar lo que muestra una lista sin avisar es la otra forma de
 * que mienta.
 *
 * Los filtros NO se amplían: un filtro puesto es una decisión explícita y
 * visible —tiene su ficha con la × al lado— y pasarlo por alto sería
 * desobedecer. La vista, en cambio, casi siempre es la que quedó de antes.
 */
export const resultadosDe = (wines = [], { terms = [], enLaVista, pasa }) => {
  const conFiltros = wines.filter(pasa);
  const enVista = conFiltros.filter(enLaVista);
  if (terms.length > 0 && enVista.length === 0 && conFiltros.length > 0) {
    return { lista: conFiltros, ampliada: true };
  }
  return { lista: enVista, ampliada: false };
};

/**
 * Los tipos que hay en una lista de vinos y cuántos de cada uno, en el orden de `tipos`, para el
 * filtro rápido de Mi Bodega. Con un solo tipo no hay nada que filtrar: devuelve [].
 */
export const tiposRapidosDe = (wines, tipos) => {
  const cuenta = new Map();
  for (const w of Array.isArray(wines) ? wines : []) {
    if (!w || !tipos.includes(w.type)) continue;
    cuenta.set(w.type, (cuenta.get(w.type) || 0) + 1);
  }
  return cuenta.size >= 2 ? tipos.filter((t) => cuenta.has(t)).map((t) => ({ id: t, n: cuenta.get(t) })) : [];
};

/**
 * El filtro rápido por una dimensión: los valores que hay en una lista de vinos, con cuántos vinos
 * de cada uno, para las fichas de arriba de Mi Bodega (Tipo · Uva · Región · Bodega).
 *
 * Ordenados por cantidad (los que más tenés primero) y después por nombre. Se cortan en `max` para
 * que la fila no sea una pared de fichas; el valor ACTIVO se conserva siempre, aunque quede afuera
 * del corte, porque si no la ficha que filtra la lista desaparecería de la fila.
 * Con un solo valor no hay nada que filtrar: devuelve [].
 */
const CLAVE_DE_DIMENSION = { uva: "varietal", region: "region", bodega: "winery" };

export const chipsRapidosDe = (wines, dimension, { max = 10, activo = "all" } = {}) => {
  const clave = CLAVE_DE_DIMENSION[dimension];
  if (!clave) return [];
  const cuenta = new Map();
  for (const w of Array.isArray(wines) ? wines : []) {
    const valor = w && typeof w[clave] === "string" ? w[clave].trim() : "";
    if (!valor) continue;
    cuenta.set(valor, (cuenta.get(valor) || 0) + 1);
  }
  if (cuenta.size < 2) return [];
  const todos = [...cuenta.entries()]
    .map(([id, n]) => ({ id, n }))
    .sort((a, b) => b.n - a.n || a.id.localeCompare(b.id, "es"));
  const visibles = todos.slice(0, max);
  if (activo !== "all" && !visibles.some((c) => c.id === activo)) {
    const elActivo = todos.find((c) => c.id === activo);
    if (elActivo) visibles.push(elActivo);
  }
  return visibles;
};
