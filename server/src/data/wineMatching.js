// Qué botella es ésta: puntuar una lectura de etiqueta contra candidatos reales.
//
// ── POR QUÉ EXISTE ESTE ARCHIVO ─────────────────────────────────────────────
// El matching vivía adentro de catalog.service, mezclado con las consultas, y
// decidía con tres señales: bodega, "core" (la línea o el nombre) y uva. Eso
// alcanzaba para la lectura feliz y fallaba en los dos extremos, con casos
// medidos contra el catálogo real:
//
//   FALSO POSITIVO — Etiqueta ilegible de la que sólo salió "Malbec, Mendoza".
//     El core "malbec" contra "Trivento White Malbec" daba 1.0 (la similitud
//     dividía por el conjunto más chico, así que una palabra contenida en otro
//     nombre valía como nombre completo), la bodega faltante puntuaba 0.5
//     "neutro" y la uva 1.0. Total 0.77, por encima del umbral: la app te
//     cambiaba el nombre de tu vino por uno de otra bodega que nunca leíste.
//
//   FALSO POSITIVO — Zuccardi + Malbec + Gualtallary devolvía "Zuccardi Q", que
//     es de Valle de Uco. La región estaba en la lectura, estaba en el catálogo,
//     y no participaba de la decisión: el desempate entre dos líneas de la misma
//     bodega se hacía a ciegas.
//
//   FALSO NEGATIVO — Zuccardi + "Serie Q" (línea mal leída) no devolvía nada,
//     ni siquiera para confirmar, teniendo la bodega bien leída y catorce vinos
//     suyos en el catálogo.
//
// La causa común: el NOMBRE mandaba, y el resto de la etiqueta —que es
// justamente lo que distingue una botella de su vecina de góndola— apenas
// acompañaba. Acá el nombre es una señal entre varias.
//
// Es un módulo de datos PURO —sin red, sin base— para poder probar el criterio
// entero sin levantar nada.

const { fold } = require("./argentineWines");
const { canonicalWinery, canonicalGrape, composeDisplayName } = require("./wineIdentity");

/**
 * Palabras que describen una CATEGORÍA de vino, no un vino.
 *
 * "Reserva" es el caso testigo: lo dicen cientos de etiquetas de decenas de
 * bodegas, y el lector lo devuelve como línea porque en la etiqueta está impreso
 * grande. Que dos botellas compartan esa palabra no las hace la misma botella, y
 * sin embargo era una coincidencia de nombre perfecta.
 *
 * No se descartan —"Reserva" ES la línea de muchos vinos y hay que poder
 * encontrarlos—: pesan menos, y no alcanzan solas para identificar nada (ver
 * `NUCLEO_GENERICO_PIDE_BODEGA`).
 */
const TERMINOS_GENERICOS = new Set([
  "reserva", "reservas", "reserve", "gran reserva", "gran reserve", "reserva especial",
  "roble", "oak", "oak cask", "crianza", "joven", "clasico", "classic", "tradicion",
  "seleccion", "seleccion especial", "selection", "premium", "estate", "varietal",
  "cosecha", "cosecha tardia", "late harvest", "edicion limitada", "limited edition",
  "vino", "tinto", "blanco", "rosado", "espumante", "brut", "extra brut", "nature",
  "malbec", "cabernet sauvignon", "chardonnay", "bonarda", "syrah", "merlot",
  "torrontes", "pinot noir", "blend", "corte",
]);

const tokens = (text) => fold(text).split(/\s+/).filter(Boolean);

/** Distancia de edición acotada. La misma idea que en catalog.service. */
const editDistance = (a, b, max) => {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (row[j] < best) best = row[j];
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
};

/**
 * ¿Estas dos palabras son la misma con un error de lectura en el medio?
 *
 * Sólo desde 5 letras y con UNA diferencia: "felicien"/"felicen" sí, "malbec"/
 * "merlot" no. Es el error típico del lector —una letra que se pierde entre el
 * relieve de la etiqueta y el modelo— y no vale la pena tolerar más que eso.
 */
const mismaPalabra = (a, b) => {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5) return false;
  return editDistance(a, b, 1) <= 1;
};

/**
 * Cuántas palabras de A aparecen en B, con tolerancia a un error de lectura.
 *
 * `estricto` cambia el denominador y es la corrección más importante de todas:
 *
 *   min  → "malbec" dentro de "Trivento White Malbec" da 1.0. Sirve para la
 *          BODEGA, donde las fuentes truncan de verdad ("Catena" es "Catena
 *          Zapata") y no hay dos bodegas distintas donde una contenga a la otra.
 *   max  → la misma comparación da 0.33. Es lo que corresponde para el NOMBRE:
 *          "Broquel" y "Broquel Reserva" son dos vinos, y las palabras que
 *          sobran son justamente lo que los distingue.
 */
const similitud = (a, b, { estricto = false, contencion = false } = {}) => {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;

  let hits = 0;
  for (const t of ta) if (tb.some((o) => mismaPalabra(t, o))) hits += 1;

  /**
   * `contencion` es para la REGIÓN, donde las dos formas de arriba se equivocan.
   *
   * Las etiquetas dicen la zona con el detalle que se les ocurre: una dice
   * "Mendoza" y el catálogo "Luján de Cuyo, Mendoza". Eso no es un desacuerdo —es
   * la misma zona dicha más corta— y con `estricto` puntuaba 0.33, castigando una
   * lectura correcta. Pero "Gualtallary, Mendoza" contra "Valle de Uco, Mendoza"
   * SÍ es un desacuerdo, y con `min` puntuaba 0.5 por compartir la provincia: la
   * mitad de un punto por decir las dos "Mendoza", que es lo que dicen casi todos
   * los vinos argentinos.
   *
   * Entonces: si todo lo que leí está adentro de lo que dice la fuente, es la
   * misma zona (1). Si además nombra otro lugar, cuenta lo que comparten sobre el
   * total — y ahí la provincia sola pesa poco, que es lo correcto.
   */
  if (contencion && hits === ta.length) return 1;

  return hits / (estricto || contencion ? Math.max(ta.length, tb.length) : Math.min(ta.length, tb.length));
};

/** El nombre de un vino, venga de donde venga (catálogo, comunidad, modelo). */
const nucleoDe = (wine = {}) =>
  String(wine.line || wine.properName || composeDisplayName(wine) || wine.name || "").trim();

const esGenerico = (texto) => {
  const limpio = fold(texto);
  if (!limpio) return false;
  if (TERMINOS_GENERICOS.has(limpio)) return true;
  // "Malbec Reserva", "Reserva Tinto": todas sus palabras son genéricas.
  const partes = tokens(limpio);
  return partes.length > 0 && partes.every((p) => TERMINOS_GENERICOS.has(p));
};

/**
 * ── LOS PESOS ───────────────────────────────────────────────────────────────
 * Cuánto vale cada parte de la etiqueta para decir qué botella es. La bodega
 * pesa más que el nombre a propósito: es el dato que el lector acierta más
 * seguido (está impreso aparte, sin adornos) y el que más recorta el universo.
 * El nombre desempata adentro de la bodega, y la región desempata adentro del
 * nombre — que es exactamente el orden en que se lee una etiqueta.
 *
 * La añada NO está, y no es un olvido: el catálogo describe VINOS, no botellas.
 * "Saint Felicien 2019" y "Saint Felicien 2021" son la misma fila. La cosecha
 * distingue botellas dentro de TU bodega (eso lo hace `findSameWine`) y no tiene
 * nada que decir acá.
 */
const PESOS = { winery: 0.4, core: 0.3, varietal: 0.15, region: 0.1, type: 0.05 };

/**
 * La masa mínima de evidencia que se le exige a una identificación.
 *
 * Sin esto, puntuar sólo sobre las señales presentes regala el resultado: una
 * lectura de la que salió apenas la uva y el tipo tendría un divisor de 0.20 y
 * cualquier coincidencia daría 1.0 — "estoy segurísimo", habiendo mirado dos
 * campos. Dividir por al menos 0.75 hace que lo que falta pese: para llegar a
 * una identificación automática hay que haber leído de verdad la etiqueta.
 */
const EVIDENCIA_MINIMA = 0.75;

/** Un núcleo genérico no identifica solo: sin bodega que lo sostenga, no hay match. */
const NUCLEO_GENERICO_PIDE_BODEGA = 0.5;

/**
 * De dónde viene el candidato. Es un desempate, no un argumento: cuando dos
 * filas puntúan casi igual, gana la fuente que mejor respaldada está. Los
 * valores son chicos a propósito — ninguna procedencia puede tapar una
 * contradicción de datos.
 */
const PRIOR_POR_FUENTE = {
  "catalogo-ar": 0.03,
  "mis-vinos": 0.04,
  "comunidad-verificada": 0.02,
  gemini: 0.01,
  comunidad: 0,
};

/**
 * Puntúa un candidato contra la lectura. Devuelve `null` si está VETADO.
 *
 * Los vetos son las tres formas de estar seguro de que NO es esta botella:
 *
 *  1. Otra uva. Un Broquel Malbec y un Broquel Bonarda son dos vinos distintos,
 *     y la uva es de los datos que mejor se leen.
 *  2. Otra bodega. Se compara sobre la forma canónica —sin "Bodega", "Wines",
 *     "S.A."— porque si no, "Bodega Norton" y "Bodega Chacra" comparten la
 *     palabra "bodega" y el veto no dispara nunca: dos bodegas cualesquiera
 *     parecían tener algo en común.
 *  3. Color imposible. Un tinto no puede ser el mismo vino que un blanco.
 */
const scoreCandidate = (lectura = {}, candidato = {}) => {
  const uvaLeida = fold(canonicalGrape(lectura.varietal || ""));
  const uvaCand = fold(canonicalGrape(candidato.varietal || ""));
  if (uvaLeida && uvaCand && uvaLeida !== uvaCand) return null;

  const bodegaLeida = canonicalWinery(lectura.winery || "");
  const bodegaCand = canonicalWinery(candidato.winery || "");
  const bodegaScore = bodegaLeida && bodegaCand ? similitud(bodegaLeida, bodegaCand) : null;
  if (bodegaScore === 0) return null;

  const tipoLeido = String(lectura.type || "unknown").trim();
  const tipoCand = String(candidato.type || "unknown").trim();
  const tiposConocidos = tipoLeido !== "unknown" && tipoCand !== "unknown";
  const COLORES = { red: "tinto", white: "blanco" };
  if (tiposConocidos && COLORES[tipoLeido] && COLORES[tipoCand] && tipoLeido !== tipoCand) {
    return null;
  }

  const nucleoLeido = nucleoDe({ line: lectura.line, properName: lectura.name });
  const nucleoCand = nucleoDe(candidato);
  const generico = esGenerico(nucleoLeido);

  // El nombre se compara "estricto": las palabras que sobran de un lado o del
  // otro son las que distinguen dos vinos de la misma bodega.
  const coreScore = nucleoLeido && nucleoCand ? similitud(nucleoLeido, nucleoCand, { estricto: true }) : null;

  // Un nombre que es una categoría no puede sostener una identificación solo.
  if (generico && coreScore !== null && (bodegaScore === null || bodegaScore < NUCLEO_GENERICO_PIDE_BODEGA)) {
    return null;
  }

  const regionScore =
    lectura.region && candidato.region
      ? similitud(lectura.region, candidato.region, { contencion: true })
      : null;
  const varietalScore = uvaLeida && uvaCand ? 1 : null;
  const typeScore = tiposConocidos ? (tipoLeido === tipoCand ? 1 : 0) : null;

  const señales = [
    ["winery", bodegaScore],
    // La mitad del peso cuando el nombre es una categoría: aporta, no decide.
    ["core", coreScore, generico ? 0.5 : 1],
    ["varietal", varietalScore],
    ["region", regionScore],
    ["type", typeScore],
  ];

  let suma = 0;
  let masa = 0;
  const detalle = {};
  for (const [campo, valor, factor = 1] of señales) {
    if (valor === null) continue;
    const peso = PESOS[campo] * factor;
    suma += peso * valor;
    masa += peso;
    detalle[campo] = Number(valor.toFixed(2));
  }

  if (masa === 0) return null;

  const base = suma / Math.max(EVIDENCIA_MINIMA, masa);
  const prior = PRIOR_POR_FUENTE[candidato.source] ?? 0;

  return {
    wine: candidato,
    /**
     * El puntaje puede pasar de 1, y tiene que poder.
     *
     * Estaba acotado a 1 "por prolijidad" y eso anulaba el desempate justo
     * cuando servía: dos filas idénticas —la misma botella en el catálogo curado
     * y en el comunitario— llegaban las dos a 1.0 y ganaba la que venía primero
     * en la lista. Esto es un ranking, no una probabilidad: el 1.0 no significa
     * nada por sí solo, y el margen entre candidatos sí.
     */
    score: Number((base + prior).toFixed(4)),
    detalle,
    flags: {
      // El nombre leído no comparte NI UNA palabra con el del candidato. No es
      // lo mismo que no haber leído el nombre (eso es `core: null`): acá lo
      // leímos y dice otra cosa. Lo que sostiene el puntaje es todo lo demás
      // —bodega, uva, región, tipo—, que es justo lo que comparten entre sí las
      // diez etiquetas de una misma bodega.
      nombreNoCoincide: coreScore === 0,
      nucleoGenerico: generico,
    },
  };
};

/**
 * ── CUÁNDO ALCANZA ──────────────────────────────────────────────────────────
 *
 * Tres tramos, y el del medio es el que faltaba. Antes había un solo umbral:
 * arriba se adoptaba el candidato en silencio y abajo no pasaba nada. O sea que
 * todo lo dudoso se resolvía solo de un lado o del otro, y la persona —que tiene
 * la botella en la mano y podía contestar en un toque— nunca era consultada.
 *
 *   alta  → es este vino. Se completa la ficha y se sigue.
 *   media → probablemente sea éste. Se muestra y se pregunta.
 *   ninguna → no sabemos. Vale más decirlo que adivinar.
 *
 * `MARGEN` es la otra mitad de la regla: dos candidatos casi empatados NUNCA se
 * resuelven solos, por más alto que puntúen. Un 0.95 contra un 0.93 no es
 * certeza, es un empate entre dos botellas parecidas de la misma bodega — el
 * caso donde equivocarse es más fácil y más caro.
 */
const UMBRAL_ALTA = 0.82;
const UMBRAL_MEDIA = 0.62;
const MARGEN = 0.08;

/**
 * Un nombre genérico que ADEMÁS no coincide con el candidato no identifica nada.
 *
 * Es el caso "Trapiche / Reserva / Malbec / Mendoza". Lo único que ata esa
 * lectura a "Trapiche Broquel" es la bodega, la uva y la provincia — que son
 * exactamente los datos que comparten entre sí todos los Malbec de esa bodega.
 * El nombre, que es lo que los distingue, dice "Reserva" y no aparece por ningún
 * lado en el candidato. Ofrecerlo, aunque sea como pregunta, es proponer una
 * botella al azar de la góndola correcta.
 */
const descartar = (puntuado) =>
  puntuado.flags.nucleoGenerico && puntuado.flags.nombreNoCoincide;

const rankCandidates = (lectura, candidatos = []) =>
  candidatos
    .map((c) => scoreCandidate(lectura, c))
    .filter((p) => p && !descartar(p))
    .sort((a, b) => b.score - a.score);

/**
 * El resultado de la identificación: qué vino es, con cuánta seguridad, y cuál
 * era la otra opción.
 *
 * La alternativa viaja para que corregir sea un toque y no una búsqueda: cuando
 * la app duda entre dos botellas, la que no eligió es casi siempre la respuesta.
 */
const identify = (lectura, candidatos = []) => {
  const ranking = rankCandidates(lectura, candidatos);
  if (ranking.length === 0) return { level: "ninguna", best: null, alternative: null, ranking };

  const [mejor, segundo] = ranking;
  const margen = segundo ? mejor.score - segundo.score : 1;

  /**
   * El nombre leído no coincide con el del candidato: nunca se resuelve solo.
   *
   * Puede ser la botella correcta con la línea mal leída —pasa seguido— o puede
   * ser la de al lado en la góndola. Desde afuera son idénticas: mismos datos
   * coincidiendo, mismo dato en desacuerdo. La diferencia la sabe quien tiene la
   * botella en la mano, así que el techo acá es preguntar.
   */
  const automatico =
    mejor.score >= UMBRAL_ALTA && margen >= MARGEN && !mejor.flags.nombreNoCoincide;

  const level = automatico ? "alta" : mejor.score >= UMBRAL_MEDIA ? "media" : "ninguna";

  return {
    level,
    best: level === "ninguna" ? null : mejor,
    // Sólo si de verdad compite: ofrecer como alternativa algo que puntuó la
    // mitad es ruido con forma de ayuda.
    alternative: segundo && segundo.score >= UMBRAL_MEDIA && margen < 0.25 ? segundo : null,
    ranking,
  };
};

module.exports = {
  PESOS,
  UMBRAL_ALTA,
  UMBRAL_MEDIA,
  MARGEN,
  TERMINOS_GENERICOS,
  esGenerico,
  similitud,
  nucleoDe,
  scoreCandidate,
  rankCandidates,
  identify,
};
