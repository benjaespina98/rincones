/**
 * Qué días abarca un informe.
 *
 * ── POR QUÉ ESTO ES COMPARTIDO ──────────────────────────────────────────────
 * Porque lo usan tres pantallas que tienen que coincidir: las métricas de uso,
 * el informe de una campaña en el panel y el informe que abre el anunciante con
 * su enlace. Si cada una armara su rango, el día que una cambie —un límite, un
 * corte de medianoche— dos pantallas dirían cosas distintas sobre los mismos
 * datos, y la que se le muestra a quien paga sería una de ellas.
 *
 * ── EL DÍA ES EL DE ACÁ ─────────────────────────────────────────────────────
 * Todo se calcula en calendario argentino. Con el corte en UTC, lo que pasa entre
 * las 21 y la medianoche cae al día siguiente: alguien mirando el panel a las 23
 * ve el día de hoy vacío. Y en un informe que se factura, "el lunes tuve 300
 * impresiones" tiene que poder comprobarse contra el calendario del anunciante.
 */

const OFFSET_AR_MINUTOS = -180;

const enArgentina = (fecha = new Date()) =>
  new Date(fecha.getTime() + OFFSET_AR_MINUTOS * 60 * 1000);

/** Una fecha como "YYYY-MM-DD" en calendario argentino. */
const diaDe = (fecha = new Date()) => enArgentina(fecha).toISOString().slice(0, 10);

/** ¿Es un "YYYY-MM-DD" real? Descarta formatos raros y fechas que no existen. */
const esDiaValido = (valor) => {
  const texto = String(valor || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const d = new Date(`${texto}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
};

/** Suma (o resta) días a un "YYYY-MM-DD". */
const sumarDias = (dia, n) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Cuántos días hay entre dos "YYYY-MM-DD", contando los dos extremos. */
const diasEntre = (desde, hasta) =>
  Math.round((new Date(`${hasta}T12:00:00Z`) - new Date(`${desde}T12:00:00Z`)) / 86400000) + 1;

/**
 * Arma la lista de días de un informe.
 *
 * Acepta dos formas y en este orden de prioridad:
 *
 *   1. `from` y `to` — un período elegido a mano. Es lo que hace falta para
 *      informar un mes cerrado: si a alguien se le factura del 1 al 31 de marzo,
 *      "últimos 30 días" no sirve, porque el 5 de abril ya no incluye el 1 de
 *      marzo y encima mete cinco días que no se cobran.
 *   2. `days` — los últimos N días, que es lo que uno mira habitualmente.
 *
 * Reglas, todas pensadas para que un rango raro no rompa nada ni mienta:
 *  - fechas dadas vuelta se ordenan solas (elegir primero el "hasta" en un
 *    calendario es lo más normal del mundo);
 *  - no se puede pedir el futuro: se recorta a hoy, porque un informe con días
 *    que todavía no pasaron muestra ceros que se leen como caída de tráfico;
 *  - hay un techo de días, y si el pedido lo supera se conserva el FINAL del
 *    período —lo más reciente es lo que se estaba mirando— en vez de cortar por
 *    donde caiga.
 */
const construirRango = ({ days, from, to, maxDias = 730, porDefecto = 30 } = {}) => {
  const hoyAr = diaDe();

  let desde;
  let hasta;

  if (esDiaValido(from) && esDiaValido(to)) {
    [desde, hasta] = from <= to ? [from, to] : [to, from];
  } else if (esDiaValido(from)) {
    desde = from;
    hasta = hoyAr;
  } else if (esDiaValido(to)) {
    hasta = to;
    desde = sumarDias(hasta, -(Number(days) > 0 ? Math.floor(Number(days)) : porDefecto) + 1);
  } else {
    const n = Number(days) > 0 ? Math.min(Math.floor(Number(days)), maxDias) : porDefecto;
    hasta = hoyAr;
    desde = sumarDias(hasta, -n + 1);
  }

  // Nada del futuro.
  if (hasta > hoyAr) hasta = hoyAr;
  if (desde > hasta) desde = hasta;

  // Techo: se conserva lo más reciente.
  if (diasEntre(desde, hasta) > maxDias) desde = sumarDias(hasta, -maxDias + 1);

  const dias = [];
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) dias.push(d);
  return dias;
};

module.exports = { diaDe, esDiaValido, sumarDias, diasEntre, construirRango, OFFSET_AR_MINUTOS };
