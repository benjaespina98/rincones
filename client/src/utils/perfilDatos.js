/**
 * Qué datos del perfil tienen SENTIDO mostrar, y cómo se escriben.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * El perfil mostraba todo lo que el servidor devolvía, sin preguntarse si decía
 * algo. Y varias cosas no decían nada, o decían algo falso:
 *
 *   · "Tomaste 0 vinos distintos este mes" — un cero dicho como logro.
 *   · "Tu inversión $9.800 en 1 vino con precio cargado", con 11 vinos: un
 *     total que parece el de toda la bodega y es el de una botella.
 *   · "Promedio por tipo: Tinto $9.800" — el mismo número, otra vez, con otra
 *     etiqueta.
 *   · "Blend" en la lista de UVAS: un corte no es una uva.
 *   · "Calchaquí Valley" y "Mendoza Argentina" mezclados con "Luján de Cuyo":
 *     idioma y nivel distintos en la misma columna, y un ranking donde todos
 *     tienen 1.
 *   · "4.4" con punto, cuando el resto de la app escribe "4,4".
 *
 * Una cifra que no se puede defender mirando el resto de la pantalla es peor
 * que no mostrarla: hace dudar de las que sí son ciertas. Acá viven las reglas,
 * puras y aparte de la pantalla, para poder probarlas.
 */

const norm = (v) => String(v || "").trim().toLowerCase();

/* ── Números ──────────────────────────────────────────────────────────────── */

/** Un decimal con coma, como se escribe en castellano: 4.4 → "4,4". */
export const decimal = (n, digitos = 1) =>
  Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: digitos,
    maximumFractionDigits: digitos,
  });

/* ── El renglón "este mes" ────────────────────────────────────────────────── */

/**
 * "Tomaste 3 vinos distintos este mes · 9 en 2026". Con cero no se festeja un
 * cero: se dice la verdad sin reproche. Y "1 vino distinto", en singular: la
 * frase vieja decía "1 vino distintos".
 */
export const fraseDelMes = ({ esteMes = 0, esteAnio = 0, anio }) => {
  const delAnio = `${esteAnio} en ${anio}`;
  if (esteMes === 0) return `Este mes todavía no tomaste ninguno · ${delAnio}`;
  const cuantos = esteMes === 1 ? "1 vino distinto" : `${esteMes} vinos distintos`;
  return `Tomaste ${cuantos} este mes · ${delAnio}`;
};

/* ── Uvas y regiones ──────────────────────────────────────────────────────── */

/** Un corte no es una uva: no entra en "las uvas que más elegís". */
const NO_ES_UVA = /^(blend|corte|assemblage|cuv[eé]e|ensamble)$/i;
export const esUva = (valor) => Boolean(norm(valor)) && !NO_ES_UVA.test(norm(valor));

const PAISES = /\s+(argentina|chile|uruguay|brasil|espa[nñ]a|italia|francia)$/i;

/**
 * El nombre de una región como se lee, no como vino de cada fuente.
 *
 * Los datos llegan de escaneos y catálogos: "Salta | Argentina", "Mendoza
 * Argentina", "Calchaquí Valley". Se queda con lo de adelante (lo que
 * distingue una región de otra), le saca el país pegado y pasa lo que quedó en
 * inglés a castellano.
 */
export const limpiarRegion = (valor) => {
  const primero = String(valor || "").split(/[|,]/)[0].trim();
  return primero
    .replace(PAISES, "")
    .replace(/\bvalley\b/i, "Valle")
    .replace(/\s+/g, " ")
    .trim();
};

/**
 * Suma las filas que, ya limpias, son la misma ("Mendoza" y "Mendoza Argentina")
 * y ordena de mayor a menor. Descarta las que se quedan sin nombre.
 */
export const agrupar = (items = [], nameKey, limpiar = (x) => String(x || "").trim()) => {
  const mapa = new Map();
  for (const item of items) {
    const nombre = limpiar(item?.[nameKey]);
    if (!nombre) continue;
    const clave = norm(nombre);
    const previo = mapa.get(clave);
    if (previo) previo.count += item.count || 0;
    else mapa.set(clave, { ...item, [nameKey]: nombre, count: item.count || 0 });
  }
  return [...mapa.values()].sort((a, b) => b.count - a.count);
};

/**
 * Un ranking donde nada se repite no dice nada: tres filas con "1" no son un
 * "lo que más elegís", son una lista. Sólo queda lo que se repitió.
 */
export const conRepeticion = (items = []) => items.filter((i) => (i.count || 0) >= 2);

/* ── La inversión ─────────────────────────────────────────────────────────── */

/** Cuántos vinos con precio hacen falta para que un total diga algo. */
const MINIMO_CON_PRECIO = 3;

/**
 * Qué mostrar de la inversión.
 *
 *  · Total: sólo si hay precio en al menos 3 vinos Y en al menos una cuarta
 *    parte de la bodega. "$9.800" sobre 11 vinos es el precio de uno.
 *  · "Mejor relación": necesita comparar, o sea dos vinos con precio.
 *  · "Promedio por tipo": sólo con DOS tipos o más; con uno repite el total.
 *  · Si no alcanza, un aviso que dice cuánto falta en lugar de un número flojo.
 */
export const queMostrarDeLaInversion = ({
  winesWithPrice = 0,
  totalVinos = 0,
  avgPriceByType = [],
  bestValueWine = null,
} = {}) => {
  const alcanza =
    winesWithPrice >= MINIMO_CON_PRECIO && winesWithPrice * 4 >= totalVinos;

  if (!alcanza) {
    return {
      total: false,
      mejorRelacion: false,
      porTipo: false,
      aviso:
        winesWithPrice > 0
          ? `Cargaste el precio de ${winesWithPrice} de ${totalVinos} vinos. Con más, acá ves cuánto invertís.`
          : null,
    };
  }

  return {
    total: true,
    mejorRelacion: Boolean(bestValueWine) && winesWithPrice >= 2,
    porTipo: Array.isArray(avgPriceByType) && avgPriceByType.length >= 2,
    aviso: null,
  };
};
