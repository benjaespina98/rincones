/**
 * La gama de un vino: accesible, media o alta.
 *
 * ── PARA QUÉ ────────────────────────────────────────────────────────────────
 * Para que la home no recomiende siempre por el mismo rango de precio. Un set
 * de ocho botellas todas de gama alta es una lista de deseos, no una
 * recomendación; ocho accesibles es un supermercado. Lo que se busca es lo que
 * haría cualquiera que sepa: mezclar. Un Nicasia o un Trumpeter para el martes
 * y un Saint Felicien o un Luigi Bosca para cuando la ocasión lo pida.
 *
 * ── POR QUÉ NO ES UN PRECIO ─────────────────────────────────────────────────
 * Porque un precio en pesos argentinos queda viejo en semanas y habría que
 * mantenerlo a mano para cuatrocientas filas. La gama, en cambio, es una
 * propiedad estable de la LÍNEA: "Saint Felicien" fue siempre el escalón alto
 * de Catena y "Alamos" el de entrada, con la inflación que sea. Lo que se
 * ordena es la relación entre vinos, no cuánto sale cada uno.
 *
 * ── QUÉ ES ESTA TABLA Y QUÉ NO ──────────────────────────────────────────────
 * Es parcial y lo asume: sólo están las líneas de las que hay certeza razonable
 * por su posición dentro de la propia bodega. Todo lo demás cae en "media", que
 * es el default correcto porque la enorme mayoría del catálogo argentino vive
 * ahí. Agregar una línea es agregar un renglón; equivocarse en una sólo cambia
 * en qué mitad del set aparece esa botella, nunca si es correcta.
 */

const { fold } = require("./argentineWines");

const ACCESIBLE = "accesible";
const MEDIA = "media";
const ALTA = "alta";

/**
 * Líneas de entrada: las que una bodega pone para todos los días. Se reconocen
 * porque son las de mayor volumen y las que están en cualquier góndola.
 */
const LINEAS_ACCESIBLES = [
  "alamos",
  "nicasia",
  "trumpeter",
  "pispi",
  "portillo",
  "callia",
  "santa julia",
  "la linda",
  "finca las moras",
  "dada",
  "elementos",
  "fond de cave",
  "benjamin",
  "estancia mendoza",
  "tomero",
  "colon",
  "michel torino",
  "don david",
  "las perdices",
  "zolo",
  "huarpe",
  "ruca malen",
  "postales",
  "gran reserva",
];

/**
 * El escalón alto de cada bodega: los que se compran para una ocasión. No son
 * necesariamente los más caros del país — son los más caros DE SU BODEGA, que
 * es la comparación que alguien hace parado frente a la góndola.
 */
const LINEAS_ALTAS = [
  "saint felicien",
  "catena alta",
  "adrianna",
  "nicolas catena",
  "angelica zapata",
  "rutini",
  "apartado",
  "antología",
  "antologia",
  "gran enemigo",
  "enemigo",
  "de sangre",
  "icono",
  "finca los nobles",
  "gala",
  "piedra infinita",
  "aluvional",
  "concreto",
  "poligonos",
  "cheval des andes",
  "gran lurton",
  "chacayes",
  "quimera",
  "finca altamira",
  "finca bella vista",
  "finca mirador",
  "gran malbec",
  "gran cabernet",
  "gran corte",
  "unico",
  "único",
  "reserva especial",
  "single vineyard",
  "grand vin",
  "iscay",
  "cara sucia",
  "altura maxima",
  "altura máxima",
];

const contieneAlguna = (texto, lista) => lista.some((clave) => texto.includes(clave));

/**
 * La gama de un vino del catálogo.
 *
 * Mira la línea y el nombre, no la bodega: dentro de la misma bodega conviven
 * las dos puntas —Catena tiene Alamos y tiene Catena Alta— y clasificar por
 * bodega mandaría las dos al mismo lado, que es justamente el error que esta
 * tabla existe para no cometer.
 */
const gamaDe = (wine) => {
  const texto = fold(`${wine?.line || ""} ${wine?.name || ""}`);
  if (!texto.trim()) return MEDIA;
  if (contieneAlguna(texto, LINEAS_ALTAS)) return ALTA;
  if (contieneAlguna(texto, LINEAS_ACCESIBLES)) return ACCESIBLE;
  return MEDIA;
};

module.exports = { gamaDe, ACCESIBLE, MEDIA, ALTA };
