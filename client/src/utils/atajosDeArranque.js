import { estacionDe } from "./sugerenciasBusqueda";

/**
 * Los atajos con los que arranca la pantalla del Sommelier.
 *
 * ── QUÉ ESTABA MAL ──────────────────────────────────────────────────────────
 * Eran los mismos nueve botones para todas las personas, a toda hora y con
 * cualquier bodega: "Asado, Pasta, Pizza, Milanesas" un martes al mediodía y un
 * domingo a la noche, y "¿Qué vinos tengo?" para alguien con la bodega vacía.
 * Un atajo que no mira quién sos ni cuándo es, es un adorno.
 *
 * ── QUÉ HACE AHORA ──────────────────────────────────────────────────────────
 *   COMIDAS     Cuatro platos sorteados con peso por momento del día (mediodía,
 *               tarde, noche), por día (el fin de semana pide asado y picada) y
 *               por estación (en verano, pescado y ensalada).
 *   PREGUNTAS   Cinco, de las cuales las PERSONALES salen de lo que la persona
 *               tiene de verdad: "¿Qué abro hoy?" sólo si hay botellas, "¿Qué le
 *               va a mi Cabernet Franc?" con el vino que está listo para tomar,
 *               "¿Qué tomé antes?" sólo si ya probó algo. Sin bodega, nada de eso
 *               aparece: ofrecer "¿Qué vinos tengo?" a quien no tiene ninguno es
 *               prometer una pregunta que se contesta con un "nada".
 *
 * Las preguntas se escriben en PRIMERA PERSONA (son botones que la persona toca
 * para hablar) y las que dependen de su bodega se verificaron contra el portero
 * del servidor: tienen que mandarle el inventario al modelo, o la respuesta sería
 * genérica y el atajo mentiría.
 *
 * Es una función pura con el azar y la hora inyectables: así se prueba sin
 * relojes ni sorteos reales.
 */

/** Platos que la pantalla reconoce (ver FOOD_PAIRINGS en data/wineReference.js). */
const COMIDAS = [
  { label: "Asado", pregunta: "¿Qué tomo con un asado?", momentos: ["noche", "mediodia"], finde: 2, clima: "todo" },
  { label: "Pasta", pregunta: "¿Qué tomo con pasta?", momentos: ["noche", "mediodia"], finde: 0.5, clima: "frio" },
  { label: "Pizza", pregunta: "¿Qué tomo con pizza?", momentos: ["noche"], finde: 1, clima: "todo" },
  { label: "Milanesas", pregunta: "¿Qué tomo con milanesas?", momentos: ["mediodia", "noche"], finde: 0, clima: "todo" },
  { label: "Pollo", pregunta: "¿Qué tomo con pollo?", momentos: ["mediodia", "noche"], finde: 0, clima: "todo" },
  { label: "Pescado", pregunta: "¿Qué tomo con pescado?", momentos: ["mediodia", "noche"], finde: 0.5, clima: "calor" },
  { label: "Ensalada", pregunta: "¿Qué tomo con una ensalada?", momentos: ["mediodia"], finde: 0, clima: "calor" },
  { label: "Mariscos", pregunta: "¿Qué tomo con mariscos?", momentos: ["noche"], finde: 1, clima: "calor" },
  { label: "Picada", pregunta: "¿Qué tomo con una picada?", momentos: ["tarde", "noche"], finde: 2, clima: "todo" },
  { label: "Quesos", pregunta: "¿Qué tomo con quesos?", momentos: ["tarde"], finde: 1, clima: "todo" },
  { label: "Postre", pregunta: "¿Qué tomo con un postre?", momentos: ["noche"], finde: 0.5, clima: "todo" },
];

/** Comparaciones entre uvas: la primera es la que ya se tiene en cuenta si coincide. */
const COMPARACIONES = [
  { label: "Malbec o Cabernet", pregunta: "Malbec o Cabernet", uvas: ["malbec", "cabernet"] },
  { label: "Malbec o Bonarda", pregunta: "Malbec o Bonarda", uvas: ["malbec", "bonarda"] },
  { label: "Syrah o Merlot", pregunta: "Syrah o Merlot", uvas: ["syrah", "merlot"] },
  { label: "Torrontés o Chardonnay", pregunta: "Torrontés o Chardonnay", uvas: ["torrontés", "chardonnay"] },
  { label: "Pinot Noir o Malbec", pregunta: "Pinot Noir o Malbec", uvas: ["pinot noir", "malbec"] },
];

/** Preguntas que sirven a cualquiera, con o sin bodega. */
const GENERALES = [
  { label: "¿Qué tomo con este clima?", pregunta: "¿Qué tomo hoy con este clima?" },
  { label: "¿Qué me recomendás comprar?", pregunta: "¿Qué me recomendás comprar?" },
  { label: "Un tinto para regalar", pregunta: "Un tinto para regalar" },
];

const norm = (v) => String(v || "").trim().toLowerCase();

/**
 * Un azar reproducible (mulberry32). La pantalla lo siembra UNA vez por visita: así los
 * atajos no se re-sortean cada vez que llega un dato nuevo (la bodega, las estadísticas)
 * y los que ya estaban a la vista no cambian de lugar.
 */
export const azarConSemilla = (semilla) => {
  let a = semilla | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** "mediodia" (11–15), "tarde" (15–19), "noche" (19–5) o "manana" (5–11). */
export const momentoDelDia = (hora) => {
  if (hora >= 11 && hora < 15) return "mediodia";
  if (hora >= 15 && hora < 19) return "tarde";
  if (hora >= 19 || hora < 5) return "noche";
  return "manana";
};

/** Sábado, domingo y el viernes a la noche (donde ya empieza el fin de semana). */
export const esFinde = (ahora) => {
  const dia = ahora.getDay();
  return dia === 0 || dia === 6 || (dia === 5 && ahora.getHours() >= 18);
};

/**
 * Sorteo ponderado SIN repetición: lo que encaja pesa más pero nada queda
 * descartado de antemano, así que dos visitas seguidas no dan lo mismo.
 */
const muestrear = (items, peso, cantidad, azar) => {
  const restantes = [...items];
  const elegidos = [];
  while (elegidos.length < cantidad && restantes.length > 0) {
    const total = restantes.reduce((suma, e) => suma + Math.max(peso(e), 0.1), 0);
    let tiro = azar() * total;
    let elegido = restantes[restantes.length - 1];
    for (const e of restantes) {
      tiro -= Math.max(peso(e), 0.1);
      if (tiro <= 0) {
        elegido = e;
        break;
      }
    }
    elegidos.push(elegido);
    restantes.splice(restantes.indexOf(elegido), 1);
  }
  return elegidos;
};

/** Cómo llamar a un vino en un botón: la uva si la tiene, si no el nombre; corto. */
const nombreCorto = (vino) => {
  const base = String(vino?.varietal || vino?.name || "").trim();
  return base.length > 22 ? `${base.slice(0, 21).trimEnd()}…` : base;
};

export const atajosDeArranque = ({
  ahora = new Date(),
  listos = [],
  hayStock = false,
  probados = 0,
  uvasFrecuentes = [],
  azar = Math.random,
  cantidadComidas = 4,
  cantidadPreguntas = 5,
} = {}) => {
  const momento = momentoDelDia(ahora.getHours());
  const finde = esFinde(ahora);
  const estacion = estacionDe(ahora.getMonth());

  const comidas = muestrear(
    COMIDAS,
    (c) => {
      let p = 1;
      if (c.momentos.includes(momento)) p += 1.5;
      if (finde) p += c.finde;
      if (estacion !== "todo" && c.clima === estacion) p += 1.2;
      // Un plato de la otra estación pesa menos, no cero: una ensalada en invierno
      // no está mal, sólo es menos probable.
      if (estacion !== "todo" && c.clima !== "todo" && c.clima !== estacion) p -= 0.5;
      return p;
    },
    cantidadComidas,
    azar
  ).map(({ label, pregunta }) => ({ label, pregunta }));

  // ── Las preguntas: primero las personales, que dependen de lo que hay ──────
  const personales = [];
  if (hayStock || listos.length > 0) {
    personales.push({ label: "¿Qué abro hoy?", pregunta: "¿Qué abro hoy?" });
  }
  const listo = listos.find((v) => nombreCorto(v));
  if (listo) {
    const nombre = nombreCorto(listo);
    personales.push({ label: `¿Qué le va a mi ${nombre}?`, pregunta: `¿Qué plato le va a mi ${nombre}?` });
  }
  if (probados > 0) {
    personales.push({ label: "¿Qué tomé antes?", pregunta: "¿Qué tomé antes?" });
  }
  if (hayStock) {
    personales.push({ label: "¿Qué vinos tengo?", pregunta: "¿Qué vinos tengo?" });
  }

  // ── El resto se completa al azar, favoreciendo la comparación con SUS uvas ──
  const frecuentes = new Set(uvasFrecuentes.map(norm));
  const comparacion = muestrear(
    COMPARACIONES,
    (c) => 1 + (c.uvas.some((u) => frecuentes.has(u)) ? 1.5 : 0),
    1,
    azar
  );
  const generales = muestrear(GENERALES, () => 1, GENERALES.length, azar);
  const relleno = [...comparacion, ...generales].map(({ label, pregunta }) => ({ label, pregunta }));

  // Las personales mandan, pero no ocupan toda la fila: siempre queda lugar para
  // que algo cambie de una visita a otra.
  const maxPersonales = Math.max(cantidadPreguntas - 2, 0);
  const preguntas = [...personales.slice(0, maxPersonales), ...relleno].slice(0, cantidadPreguntas);

  return { comidas, preguntas };
};
