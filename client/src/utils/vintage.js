/**
 * La cosecha de un vino como año, o `null` si no hay un año legible.
 *
 * Es la ÚNICA función que interpreta ese campo. Antes cada lugar hacía `Number(wine.vintage)`, y
 * eso falla en las dos direcciones: `Number(null)` y `Number("")` dan 0 (un vino sin cosecha
 * "tenía 2026 años") y `Number("NV")` o `Number("2019/20")` dan NaN (un vino con cosecha "no la
 * tenía cargada").
 *
 * Devuelve un año sólo si es un entero de 4 cifras plausible: de 1800 al año que viene (se
 * aceptan las añadas que salen a la venta antes de terminar el año). NV, rangos, textos, 0,
 * vacío y null devuelven `null`.
 *
 * `hayValor` distingue "no hay dato" de "hay un dato que no es un año" (NV, "2019/20"): a quien
 * dice "no tenés cargada la cosecha" le importa la diferencia.
 */
const MIN_ANIO = 1800;

const textoDe = (wine) => {
  const v = wine?.vintage;
  if (v === null || v === undefined) return "";
  return String(v).trim();
};

export const leerCosecha = (wine, ahora = new Date()) => {
  const texto = textoDe(wine);
  if (!/^\d{4}$/.test(texto)) return null;
  const anio = Number(texto);
  return anio >= MIN_ANIO && anio <= ahora.getFullYear() + 1 ? anio : null;
};

/** ¿El vino trae algo escrito en la cosecha, aunque no sea un año ("NV", "2019/20")? */
export const hayValorDeCosecha = (wine) => {
  const texto = textoDe(wine);
  return texto !== "" && texto !== "0";
};
