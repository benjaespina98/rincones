/**
 * Qué rasgos propios le damos a la botella de relleno de un vino sin foto.
 *
 * El placeholder ya cambia de forma y de color según el TIPO, pero dos tintos de bodegas distintas seguían
 * siendo idénticos: una lista de resultados de búsqueda se leía como la misma botella repetida. Acá cada vino
 * recibe, a partir de su bodega, tres rasgos chicos y estables (la misma bodega siempre se dibuja igual) y una
 * inicial para la etiqueta:
 *
 *   tono       cuánto se corre el color del vino dentro de su tipo (rubí, granate…), en grados de matiz;
 *   etiqueta   0 estándar · 1 alta y angosta · 2 ancha y baja;
 *   capsula    0 sin cápsula · 1 oscura · 2 dorada · 3 violeta (los tres tonos son del sistema);
 *   inicial    la primera letra de la bodega, sin el "Bodega" / "Finca" que casi todas llevan adelante.
 *
 * No es la foto del vino ni lo pretende: es una botella genérica con personalidad, y por eso la etiqueta lleva una
 * letra y no un nombre inventado. Sin `marca` no se calcula nada y la botella se ve como siempre.
 */

/** Palabras que casi toda bodega lleva adelante y que no dicen cuál es. */
const PREFIJOS = new Set(["bodega", "bodegas", "finca", "vina", "vinas", "casa", "el", "la", "los", "las", "don", "de"]);

const sinTildes = (t) =>
  String(t || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Un número estable (sin signo) a partir de un texto. */
const hashDe = (texto) => {
  let h = 5381;
  for (let i = 0; i < texto.length; i += 1) h = ((h << 5) + h + texto.charCodeAt(i)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
};

/** La letra que va en la etiqueta: la primera de la primera palabra que no sea un prefijo genérico. */
export const inicialDeMarca = (marca) => {
  const palabras = sinTildes(marca)
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const util = palabras.find((p) => !PREFIJOS.has(p)) || palabras[0] || "";
  return util ? util.charAt(0).toUpperCase() : "";
};

/**
 * @param {string} marca  la bodega (o, si no hay, el nombre del vino).
 * @returns {{tono: number, etiqueta: 0|1|2, capsula: 0|1|2|3, inicial: string} | null}  null sin marca.
 */
export const variacionDeBotella = (marca) => {
  const clave = sinTildes(marca).trim();
  if (!clave) return null;
  const h = hashDe(clave);
  return {
    // De -7 a +7 grados: se nota entre una y otra, y un tinto sigue siendo un tinto. Con ±14 un tinto
    // llegaba al matiz del rosé (336° contra 337°) y un fortificado se volvía oliváceo.
    tono: (h % 15) - 7,
    etiqueta: Math.floor(h / 15) % 3,
    capsula: Math.floor(h / 45) % 4,
    inicial: inicialDeMarca(marca),
  };
};
