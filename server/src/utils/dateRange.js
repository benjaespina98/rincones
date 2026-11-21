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
/**
 * Cuántos días se pidieron, siempre un entero entre 1 y `maxDias`. Lo que no es un número positivo (NaN, 0,
 * negativos, texto) cae al valor por defecto; Infinity o un número enorme se recorta al techo. Sin esto,
 * `days=Infinity` junto con un `to` válido armaba una fecha inválida y terminaba en 500.
 */
const diasPedidos = (days, porDefecto, maxDias) => {
  const n = Number(days);
  if (!(n > 0)) return porDefecto;
  return Math.max(1, Math.min(Number.isFinite(n) ? Math.floor(n) : maxDias, maxDias));
};

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
    desde = sumarDias(hasta, -diasPedidos(days, porDefecto, maxDias) + 1);
  } else {
    const n = diasPedidos(days, porDefecto, maxDias);
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

/**
 * El instante en que empieza y termina un día de calendario argentino, como `Date`.
 * `fin` es el último milisegundo del día (23:59:59.999 hora de Argentina).
 *
 * Sirve para filtrar colecciones por `createdAt` con el MISMO corte de día que usan las
 * métricas. `new Date("2026-03-05")` es medianoche UTC (21 h del 4 acá) y `setHours` usa la
 * zona del proceso (UTC en Vercel): ninguno coincide con el calendario del panel.
 */
const limitesDelDia = (dia) => {
  const [anio, mes, d] = String(dia).split("-").map(Number);
  const inicio = new Date(Date.UTC(anio, mes - 1, d) - OFFSET_AR_MINUTOS * 60 * 1000);
  return { inicio, fin: new Date(inicio.getTime() + 86400000 - 1) };
};

/**
 * `{ $gte, $lte }` para un `createdAt` a partir de dos "YYYY-MM-DD" opcionales, en calendario
 * argentino. Un valor inválido se ignora (como antes); si vienen dados vuelta se ordenan.
 * Devuelve `null` si no queda ningún límite usable.
 */
const filtroDeFechas = ({ from, to } = {}) => {
  let desde = esDiaValido(from) ? String(from).trim() : "";
  let hasta = esDiaValido(to) ? String(to).trim() : "";
  if (desde && hasta && desde > hasta) [desde, hasta] = [hasta, desde];
  const filtro = {};
  if (desde) filtro.$gte = limitesDelDia(desde).inicio;
  if (hasta) filtro.$lte = limitesDelDia(hasta).fin;
  return Object.keys(filtro).length > 0 ? filtro : null;
};

module.exports = {
  diaDe,
  esDiaValido,
  sumarDias,
  diasEntre,
  construirRango,
  limitesDelDia,
  filtroDeFechas,
  OFFSET_AR_MINUTOS,
};
