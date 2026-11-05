/**
 * Qué vinos recomendarle a ESTA persona.
 *
 * ── QUÉ HABÍA ANTES ─────────────────────────────────────────────────────────
 * `getFeatured` barajaba el catálogo con una semilla derivada del día y cortaba
 * los primeros ocho, deduplicando por bodega. Es decir: la misma home para todo
 * el mundo, sin mirar una sola vez qué tomás, qué puntuaste alto ni qué elegiste
 * en el onboarding.
 *
 * Lo llamativo es que la pantalla SÍ parecía personalizada: `whyThisWine`
 * (cliente) escribía motivos verdaderos cruzando el vino con tus estadísticas
 * ("Porque ya tenés 3 Malbec en tu bodega"). Pero el motivo se calculaba DESPUÉS
 * de que el vino ya había sido elegido al azar, así que explicaba una
 * coincidencia. Cuando no la había, caía a una frase de momento. La sensación de
 * "esto es para mí" estaba puesta entera en el copy y no en la elección.
 *
 * ── LO QUE HACE AHORA ───────────────────────────────────────────────────────
 * Dos rankings sobre el mismo catálogo y una lista que los intercala:
 *
 *   AFINIDAD      lo que se parece a lo que ya tomás y puntuaste bien.
 *   DESCUBRIMIENTO lo que NO tenés, pero por el lado por el que lo tomarías.
 *
 * Intercalar no es un adorno: es la regla. Una home de pura afinidad es ocho
 * Malbec de Mendoza —le da la razón a tu gusto y no te enseña nada—, y una de
 * puro descubrimiento son ocho vinos que no tienen que ver con vos. Empieza por
 * afinidad porque la primera tarjeta es la que decide si seguís mirando.
 *
 * ── LO QUE NUNCA HACE ───────────────────────────────────────────────────────
 * Recomendarte un vino que ya tenés en la bodega. Era el peor resultado posible
 * y el barajado no tenía forma de evitarlo: la home te descubría una botella que
 * estaba en tu cocina.
 */

const { gamaDe, puntosDeGama, ACCESIBLE } = require("../data/wineTiers");

const norm = (valor) => String(valor || "").trim().toLowerCase();

/** La identidad de un vino a los fines de "esto ya lo tengo". */
const clave = (wine) => `${norm(wine?.winery)}|${norm(wine?.name || wine?.line)}`;

/**
 * Cuánto pesa cada señal.
 *
 * Están juntos y con nombre para poder discutirlos: son el criterio del
 * producto, no una constante técnica. El orden dice la tesis — la uva describe
 * un gusto mucho mejor que la región, y la región mucho mejor que el color.
 */
const PESOS = {
  varietalQueTomas: 3,
  varietalElegido: 2.5, // el del onboarding: lo dijo con todas las letras
  varietalQuePuntuasteAlto: 2,
  regionQueTomas: 1.5,
  tipoQueTomas: 1,
  tipoElegido: 1,
  varietalQueEvitas: 3, // se RESTA: puntuó esa uva siempre bajo
  bodegaQueTomas: 2, // sus productores: lo que ya sabe que le gusta
  lineaQueTomas: 1.5, // la misma línea de una bodega que ya tomó (otra uva, mismo estilo)
  gamaPorDebajo: 2.5, // se RESTA por cada punto de gama por debajo de lo que toma
};

/** Desde qué gama media (1 a 3) se considera que alguien toma por encima de lo de góndola. */
const GAMA_QUE_EXCLUYE_ACCESIBLES = 2.2;

/** Una puntuación alta: de 4 para arriba es "esto me gustó de verdad". */
const PUNTUACION_ALTA = 4;

/** Una puntuación baja: de 2 para abajo es "esto no me gustó". */
const PUNTUACION_BAJA = 2;

/**
 * El retrato de gustos de una persona, a partir de su bodega y su onboarding.
 *
 * Las dos fuentes dicen cosas distintas y las dos valen: el onboarding es lo que
 * dijo que le gusta, la bodega es lo que efectivamente compró. Cuando se
 * contradicen manda la bodega —los hechos ganan—, pero el onboarding es lo único
 * que hay para alguien que recién llega y todavía no cargó nada.
 */
const buildTasteProfile = ({ wines = [], preferences = {} } = {}) => {
  const varietals = new Map();
  const regions = new Map();
  const types = new Map();
  const puntuadosAlto = new Set();
  // Uvas que puntuó y siempre bajo (2 o menos): lo que NO le gustó. Recomendarle más de eso es el error más
  // visible que puede cometer la home.
  const notas = new Map();
  const yaLoTiene = new Set();
  // Por uva: cuántos YA TOMÓ y cuántos tiene en stock. Es lo que permite decir la verdad en la tarjeta:
  // "tenés tres Malbec" no es lo mismo que haber tomado dos y tener uno.
  const tomadosPorUva = new Map();
  const enStockPorUva = new Map();
  const tomadosPorRegion = new Map();
  const tomadosPorTipo = new Map();
  // Qué productores y qué líneas toma (lo que posee o probó), y en qué escalón se mueve.
  const bodegas = new Map();
  const tomadosPorBodega = new Map();
  const lineas = new Map();
  let sumaGama = 0;

  const sumar = (mapa, valor) => {
    const k = norm(valor);
    if (!k || k === "unknown") return;
    mapa.set(k, (mapa.get(k) || 0) + 1);
  };

  for (const wine of wines) {
    yaLoTiene.add(clave(wine));
    sumar(varietals, wine.varietal);
    sumar(bodegas, wine.winery);
    if (norm(wine.winery) && norm(wine.line || wine.name)) sumar(lineas, `${norm(wine.winery)}|${norm(wine.line || wine.name)}`);
    sumaGama += puntosDeGama(wine);
    if (wine.tasted === true) sumar(tomadosPorBodega, wine.winery);
    if (wine.tasted === true) {
      sumar(tomadosPorUva, wine.varietal);
      sumar(tomadosPorRegion, wine.region);
      sumar(tomadosPorTipo, wine.type);
    }
    if (Number(wine.quantity) > 0) sumar(enStockPorUva, wine.varietal);
    sumar(regions, wine.region);
    sumar(types, wine.type);
    if (Number(wine.rating) >= PUNTUACION_ALTA && norm(wine.varietal)) {
      puntuadosAlto.add(norm(wine.varietal));
    }
    if (Number(wine.rating) > 0 && norm(wine.varietal)) {
      const n = notas.get(norm(wine.varietal)) || [];
      n.push(Number(wine.rating));
      notas.set(norm(wine.varietal), n);
    }
  }
  const evitados = new Set(
    [...notas.entries()].filter(([, lista]) => lista.every((n) => n <= PUNTUACION_BAJA)).map(([uva]) => uva)
  );

  return {
    varietals,
    regions,
    types,
    puntuadosAlto,
    tomadosPorUva,
    enStockPorUva,
    tomadosPorRegion,
    tomadosPorTipo,
    bodegas,
    tomadosPorBodega,
    lineas,
    // El escalón en el que se mueve (promedio de 1 a 3): sólo con base mínima, que con dos botellas no es un patrón.
    gamaHabitual: wines.length >= 3 ? sumaGama / wines.length : null,
    evitados,
    total: wines.length,
    yaLoTiene,
    elegidos: {
      varietals: new Set((preferences.favoriteVarietals || []).map(norm).filter(Boolean)),
      types: new Set((preferences.favoriteTypes || []).map(norm).filter(Boolean)),
    },
    // Con muy pocos vinos cargados, la bodega todavía no describe un gusto: dos
    // botellas no son una tendencia. Quien lea esto puede decidir cuánto
    // confiar en el resto del perfil.
    tieneHistorial: wines.length >= 3,
  };
};

/**
 * Cuánto se parece este vino a lo que la persona ya toma.
 *
 * Es una suma de señales verificables, no un modelo: cada punto que suma se
 * puede señalar con el dedo en la bodega de quien lo recibe. Eso importa porque
 * la tarjeta después tiene que poder DECIR por qué, y sólo se puede explicar lo
 * que se puede justificar.
 */
/**
 * Cuánto pesa algo que tomás según CUÁNTO lo tomás: una uva que es la cuarta parte de tu bodega
 * pesa entero; la que probaste una vez entre veinte vinos, bastante menos. Sin esto, una sola botella
 * de Tannat te hacía "tomador de Tannat" igual que a quien tiene diez.
 */
const peso = (mapa, clave, base, total) => {
  const n = mapa.get(clave) || 0;
  if (!n) return 0;
  const parte = total > 0 ? n / total : 1;
  return base * (0.5 + 0.5 * Math.min(1, parte / 0.25));
};

const puntajeDeAfinidad = (wine, perfil) => {
  const uva = norm(wine.varietal);
  const region = norm(wine.region);
  const tipo = norm(wine.type);
  let puntaje = 0;

  puntaje += peso(perfil.varietals, uva, PESOS.varietalQueTomas, perfil.total);
  if (perfil.elegidos.varietals.has(uva)) puntaje += PESOS.varietalElegido;
  if (perfil.puntuadosAlto.has(uva)) puntaje += PESOS.varietalQuePuntuasteAlto;
  puntaje += peso(perfil.regions, region, PESOS.regionQueTomas, perfil.total);
  puntaje += peso(perfil.types, tipo, PESOS.tipoQueTomas, perfil.total);
  if (perfil.elegidos.types.has(tipo)) puntaje += PESOS.tipoElegido;
  // Lo que no le gustó resta: el vino de esa uva baja y deja de competir por los primeros lugares.
  if (perfil.evitados?.has(uva)) puntaje -= PESOS.varietalQueEvitas;

  // Sus productores y sus líneas: si toma Luigi Bosca, otro Luigi Bosca es más suyo que un Malbec cualquiera.
  const bodega = norm(wine.winery);
  puntaje += peso(perfil.bodegas || new Map(), bodega, PESOS.bodegaQueTomas, perfil.total);
  const linea = norm(wine.line || wine.name);
  if (bodega && linea) puntaje += peso(perfil.lineas || new Map(), `${bodega}|${linea}`, PESOS.lineaQueTomas, perfil.total);

  // Las líneas son distintas: quien toma Piattelli, Luigi Bosca o DV Catena no es público de un Portillo. Cuanto más
  // por debajo de su escalón, más resta (hacia arriba no: subir es aspiracional, bajar es humo).
  const porDebajo = (perfil.gamaHabitual ?? 0) - puntosDeGama(wine);
  if (perfil.gamaHabitual != null && porDebajo >= 0.75) puntaje -= PESOS.gamaPorDebajo * porDebajo;

  return puntaje;
};

/**
 * Cuánto vale este vino como descubrimiento.
 *
 * "Nuevo" solo no alcanza: un vino que no tenés porque nunca tomarías nada
 * parecido no es un descubrimiento, es un error con cara de novedad. Lo que se
 * premia es lo nuevo POR UN LADO CONOCIDO — otra uva pero del color que tomás,
 * u otra región de una uva que ya te gusta—, que es exactamente la
 * recomendación que se puede contar: "si te gustó ese Malbec, probá este
 * Cabernet".
 */
const puntajeDeDescubrimiento = (wine, perfil) => {
  const uva = norm(wine.varietal);
  const region = norm(wine.region);
  const tipo = norm(wine.type);
  if (perfil.evitados?.has(uva)) return -PESOS.varietalQueEvitas;

  const uvaNueva = Boolean(uva) && !perfil.varietals.has(uva);
  if (!uvaNueva) {
    // La uva ya la tenés: sólo es descubrimiento si viene de otra zona, que es
    // la forma más chica y más honesta de "lo mismo, pero distinto".
    return Boolean(region) && !perfil.regions.has(region) ? 1.5 : 0;
  }

  let puntaje = 2;
  // El puente: la uva es nueva pero el color es el que tomás, así que hay una
  // razón para creer que te va a gustar.
  if (perfil.types.has(tipo) || perfil.elegidos.types.has(tipo)) puntaje += 1.5;
  // Y si además la zona ya te gusta, el salto es todavía más corto.
  if (perfil.regions.has(region)) puntaje += 0.5;

  return puntaje;
};

/**
 * Desempate estable dentro del día.
 *
 * Muchos candidatos empatan en puntaje —el catálogo tiene decenas de Malbec de
 * Mendoza— y sin un desempate el orden lo decidiría la posición en el archivo:
 * la home mostraría siempre las mismas bodegas, las que están arriba. Con la
 * fecha como semilla el orden es fijo mientras dura el día (dos visitas no se
 * contradicen) y distinto mañana.
 */
const desempate = (wine, semilla) => {
  const texto = `${wine.winery || ""}${wine.name || wine.line || ""}`;
  let h = semilla;
  for (let i = 0; i < texto.length; i += 1) h = (h * 31 + texto.charCodeAt(i)) | 0;
  return Math.abs(h % 1000) / 1000;
};

/** Cuántos vinos de la misma uva se toleran en un set de ocho. */
const TOPE_POR_UVA = 2;

/**
 * Cuántos de la misma gama de precio se toleran en un set de ocho.
 *
 * Tres de ocho fuerza a que aparezcan las tres gamas, que es la mezcla que
 * haría cualquiera que sepa: un accesible para el martes, uno de gama alta para
 * cuando la ocasión lo pida. Sin este tope el set se llenaba solo de una punta
 * —la afinidad tira a lo que ya tomás, y quien toma barato recibe barato para
 * siempre— y la home dejaba de mostrarle a nadie el escalón de arriba.
 *
 * Es un cupo blando: si con él no se llega a completar el set, se afloja antes
 * que devolver menos tarjetas (ver `tomarDe`). Un cupo que achica la home es
 * peor que un set desbalanceado.
 */
const TOPE_POR_GAMA = 3;

/**
 * Arma la lista final: intercala afinidad y descubrimiento, sin repetir bodega
 * y sin cargar el set de una sola uva.
 *
 * El tope por uva existe porque sin él la mitad afinidad se llenaba de Malbec
 * —es lo que más hay en el catálogo y lo que más toma todo el mundo—, y una home
 * con cuatro Malbec no se lee como ocho recomendaciones sino como una repetida.
 */
/**
 * `extra(wine)` suma o resta puntos por algo que NO es gusto (que tenga foto, que esté bien
 * identificado): empuja, no filtra. `jitter` es cuánto puede mover el desempate diario a un vino
 * de lugar: con 0 sólo desempata los empatados (la home de siempre); con más, vinos que puntúan
 * parecido rotan de un día al otro y la home deja de ser "los mismos de siempre" cuando el pool es
 * grande. Sigue siendo estable dentro del día.
 */
const rankFeatured = (catalogo, perfil, { count = 8, seed = 0, extra = null, jitter = 0 } = {}) => {
  const candidatos = (catalogo || [])
    // Una uva que puntuó siempre bajo no se recomienda: mejor un set más corto que ofrecerle lo que no le gustó.
    .filter((wine) => wine && !perfil.yaLoTiene.has(clave(wine)) && !perfil.evitados?.has(norm(wine.varietal)))
    // Quien toma por encima de lo de góndola no recibe vinos de entrada: no es una recomendación, es humo.
    .filter((wine) => !(perfil.gamaHabitual >= GAMA_QUE_EXCLUYE_ACCESIBLES && gamaDe(wine) === ACCESIBLE))
    .map((wine) => {
      const e = typeof extra === "function" ? Number(extra(wine)) || 0 : 0;
      const ruido = desempate(wine, seed);
      return {
        wine,
        afinidad: puntajeDeAfinidad(wine, perfil) + e,
        descubrimiento: puntajeDeDescubrimiento(wine, perfil) + e,
        ruido,
        movimiento: ruido * jitter,
      };
    });

  const porAfinidad = [...candidatos].sort(
    (a, b) => b.afinidad + b.movimiento - (a.afinidad + a.movimiento) || b.ruido - a.ruido
  );
  const porDescubrimiento = [...candidatos].sort(
    (a, b) => b.descubrimiento + b.movimiento - (a.descubrimiento + a.movimiento) || b.ruido - a.ruido
  );

  const elegidos = [];
  const bodegas = new Set();
  const uvas = new Map();
  const gamas = new Map();
  const yaElegido = new Set();
  // El cupo por uva escala con el tamaño del set (con doce, tres de cada una) y se afloja de a uno
  // si no alcanza para completarlo: un set más corto porque el pool tiene poca variedad es peor
  // que uno con una uva repetida una vez más.
  let topePorUva = Math.max(TOPE_POR_UVA, Math.ceil(count / 4));

  const tomarDe = (lista, respetarGama = true) => {
    for (const candidato of lista) {
      const k = clave(candidato.wine);
      if (yaElegido.has(k)) continue;

      const bodega = norm(candidato.wine.winery);
      if (bodega && bodegas.has(bodega)) continue;

      const uva = norm(candidato.wine.varietal);
      if (uva && (uvas.get(uva) || 0) >= topePorUva) continue;

      const gama = gamaDe(candidato.wine);
      if (respetarGama && (gamas.get(gama) || 0) >= TOPE_POR_GAMA) continue;

      yaElegido.add(k);
      if (bodega) bodegas.add(bodega);
      if (uva) uvas.set(uva, (uvas.get(uva) || 0) + 1);
      gamas.set(gama, (gamas.get(gama) || 0) + 1);
      elegidos.push(candidato.wine);
      return true;
    }
    return false;
  };

  // Empieza por afinidad: la primera tarjeta es la que decide si la persona
  // sigue mirando, y para eso tiene que reconocerse en ella.
  let turnoDeAfinidad = true;
  while (elegidos.length < count) {
    const listas = turnoDeAfinidad
      ? [porAfinidad, porDescubrimiento]
      : [porDescubrimiento, porAfinidad];
    // Si la lista de turno ya no tiene nada admisible, se prueba con la otra
    // antes de darse por vencido: es preferible un set completo aunque quede
    // desbalanceado a devolver menos tarjetas de las que la home espera.
    //
    // Y si con ninguna de las dos entra nada, lo primero que se afloja es el
    // cupo de gama: es el más nuevo y el menos importante de los tres. El tope
    // por uva y el de bodega se sostienen hasta el final —cuatro Malbec de la
    // misma bodega arruinan el set mucho más que cuatro botellas del mismo
    // rango de precio—.
    if (!listas.some((lista) => tomarDe(lista, true))) {
      if (!listas.some((lista) => tomarDe(lista, false))) {
        // Nada admisible con este cupo de uva: se afloja de a uno (el de bodega sigue firme).
        if (topePorUva >= count) break;
        topePorUva += 1;
        continue;
      }
    }
    turnoDeAfinidad = !turnoDeAfinidad;
  }

  return elegidos;
};

/**
 * Una de varias formas de decir lo mismo, estable para ese vino ese día.
 *
 * Con una sola frase por razón la home se leía como un loop ("te recomiendo este vino", "te recomiendo este vino"...).
 * La elección sale de la semilla del día y del vino, no del azar: dos visitas el mismo día no se contradicen, y las
 * tarjetas vecinas no suenan iguales. Todas las variantes afirman exactamente el mismo dato.
 */
const variante = (opciones, wine, semilla, sal = "") => {
  const texto = `${sal}${wine?.winery || ""}${wine?.name || wine?.line || ""}`;
  let h = Number(semilla) | 0;
  for (let i = 0; i < texto.length; i += 1) h = (h * 31 + texto.charCodeAt(i)) | 0;
  // Un último revoltijo de bits: sin él, dos vinos que sólo difieren en un carácter caían casi siempre en la misma frase.
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return opciones[(h >>> 0) % opciones.length];
};

const TIPO_PLURAL = { red: "tintos", white: "blancos", "rosé": "rosados", sparkling: "espumantes", fortified: "fortificados" };

/**
 * Por qué se recomienda este vino a ESTA persona, dicho con los datos de su bodega: un porcentaje de
 * coincidencia y hasta tres razones concretas. Es lo que hace que la tarjeta no sea una frase
 * genérica sino algo verificable (cada razón se puede señalar en su bodega).
 *
 * ── EL PORCENTAJE ───────────────────────────────────────────────────────────
 * Es qué parte de lo que esta persona nos dejó ver de su gusto cubre el vino: los puntos que suma
 * sobre los que PODRÍA sumar con su perfil (si nunca puntuó nada, "puntuaste alto" no cuenta en el
 * total). Así un vino que coincide en todo lo que sabemos de alguien con poco historial puede
 * llegar al 100%, y uno que sólo comparte el color queda bajo. Sólo se calcula con una base mínima
 * (tres vinos o gustos elegidos): con menos, un porcentaje sería inventar precisión.
 *
 * Devuelve `{ modo, coincidencia, razones }`: modo "afinidad" (se parece a lo que tomás) o
 * "descubrimiento" (nuevo, pero por un lado que conocés).
 */
const explicarRecomendacion = (wine, perfil, { semilla = 0 } = {}) => {
  const uva = norm(wine.varietal);
  const region = norm(wine.region);
  const tipo = norm(wine.type);

  if (perfil.evitados?.has(uva)) return { modo: "descubrimiento", coincidencia: null, razones: [], motivos: [] };

  const hayBase = perfil.tieneHistorial || perfil.elegidos.varietals.size > 0 || perfil.elegidos.types.size > 0;
  const maximo =
    (perfil.varietals.size ? PESOS.varietalQueTomas : 0) +
    (perfil.elegidos.varietals.size ? PESOS.varietalElegido : 0) +
    (perfil.puntuadosAlto.size ? PESOS.varietalQuePuntuasteAlto : 0) +
    (perfil.regions.size ? PESOS.regionQueTomas : 0) +
    (perfil.types.size ? PESOS.tipoQueTomas : 0) +
    (perfil.elegidos.types.size ? PESOS.tipoElegido : 0);
  // (El productor y la línea suman al puntaje pero no al máximo: son un plus que no todo vino parecido puede tener.)
  const bruto = puntajeDeAfinidad(wine, perfil);
  const coincidencia =
    hayBase && maximo > 0 ? Math.max(0, Math.min(99, Math.round((100 * bruto) / maximo))) : null;

  // Razones en voz de persona, cortas y verdaderas. La tarjeta muestra la primera, así que el
  // orden es el de lo más convincente a lo más general. Cada una tiene varias formas de decirse (ver `variante`).
  const razones = [];
  // Lo mismo dicho en corto y en neutro, para mostrar como chips o lista: «Tomaste Malbec», no «Como tomaste
  // Malbec, te recomiendo este vino». Mismo orden y mismas condiciones que `razones`: cada motivo es
  // verificable en la bodega de la persona. La tarjeta usa éstos; `razones` queda para quien ya la leía.
  const motivos = [];
  const U = wine.varietal;
  const cuantas = perfil.varietals.get(uva);
  const tomados = perfil.tomadosPorUva?.get(uva) || 0;
  const enStock = perfil.enStockPorUva?.get(uva) || 0;
  const di = (opciones, sal) => variante(opciones, wine, semilla, sal);

  if (perfil.puntuadosAlto.has(uva) && cuantas) {
    motivos.push(`Puntuaste alto el ${U}`);
    razones.push(
      di(
        [
          `Como te gusta el ${U}, te recomiendo este vino`,
          `El ${U} te gustó mucho: este puede ser otro acierto`,
          `Sé que disfrutás el ${U}, así que te sugiero este vino`,
          `Por lo que te gusta el ${U}, mirá este vino`,
        ],
        "alto"
      )
    );
  }
  // Su productor: si toma Luigi Bosca o Piattelli, uno de ellos pesa más que un Malbec cualquiera.
  if ((perfil.tomadosPorBodega?.get(norm(wine.winery)) || 0) >= 1 && wine.winery) {
    motivos.push(`Ya tomaste ${wine.winery}`);
    razones.push(
      di(
        [
          `Como ya tomaste ${wine.winery}, te recomiendo este vino`,
          `Ya conocés ${wine.winery}: te propongo este vino`,
          `Tomaste ${wine.winery} antes, por eso te sugiero este vino`,
        ],
        "bodega"
      )
    );
  }
  if (perfil.elegidos.varietals.has(uva)) {
    motivos.push(`${U} está entre tus gustos`);
    razones.push(
      di(
        [
          `Como elegiste el ${U}, te recomiendo este vino`,
          `Dijiste que te gusta el ${U}: te propongo este vino`,
          `Pediste ${U} entre tus gustos, así que va este`,
        ],
        "elegido"
      )
    );
  }
  if (tomados > 0) {
    motivos.push(`Tomaste ${U}`);
    razones.push(
      di(
        [
          `Como tomaste ${U}, te recomiendo este vino`,
          `Ya probaste ${U}: te sugiero seguir por acá`,
          `El ${U} ya pasó por tu copa, por eso te propongo este vino`,
          `Tomaste ${U} y este viene bien para seguir`,
        ],
        "tomado"
      )
    );
  } else if (enStock > 0) {
    motivos.push(`Tenés ${U} en tu bodega`);
    razones.push(
      di(
        [
          `Como tenés ${U} en tu bodega, te recomiendo este vino`,
          `Ya tenés ${U} en casa: este va muy bien con tu bodega`,
          `Para acompañar el ${U} que tenés, te sugiero este vino`,
        ],
        "stock"
      )
    );
  } else if (cuantas) {
    // Está en su bodega pero sin botellas y sin haberlo tomado: no se afirma que lo tiene en casa.
    motivos.push(`${U} está en tu lista`);
    razones.push(
      di([`Como el ${U} ya forma parte de tu bodega, te recomiendo este vino`, `El ${U} ya está en tu lista: te sugiero este vino`], "lista")
    );
  }
  // Región y tipo sólo se afirman con lo que TOMÓ, no con lo que tiene guardado: "tomás mucho tinto" con un
  // único tinto sin abrir sería mentira.
  if ((perfil.tomadosPorRegion?.get(region) || 0) >= 2) {
    motivos.push(`${wine.region} aparece seguido en lo que tomás`);
    razones.push(
      di(
        [
          `Como tomaste varios vinos de ${wine.region}, te recomiendo este vino`,
          `${wine.region} aparece seguido en lo que tomás: te propongo este vino`,
          `Se nota que te gusta ${wine.region}: va este`,
        ],
        "region"
      )
    );
  }
  if ((perfil.tomadosPorTipo?.get(tipo) || 0) >= 3 && razones.length < 3 && TIPO_PLURAL[tipo]) {
    const t = TIPO_PLURAL[tipo].replace(/s$/, "");
    motivos.push(`Tomás mucho ${t}`);
    razones.push(
      di(
        [
          `Como tomás mucho ${t}, te recomiendo este vino`,
          `Sos de tomar ${t} seguido: te sugiero este vino`,
          `El ${t} es lo tuyo de siempre: probá este`,
        ],
        "tipo"
      )
    );
  }

  const esDescubrimiento = razones.length === 0 || (bruto < 2 && puntajeDeDescubrimiento(wine, perfil) > 0);
  if (esDescubrimiento) {
    let puente = "";
    let puenteCorto = "";
    if (uva && !perfil.varietals.has(uva)) {
      puenteCorto = `Una uva nueva para vos: ${U}`;
      puente = di(
        [
          "Para que pruebes una uva nueva, te recomiendo este vino",
          "Una uva nueva para vos: te propongo este vino",
          "Para salir de lo de siempre, una uva nueva: te sugiero este vino",
        ],
        "nueva"
      );
    } else if (perfil.tomadosPorRegion?.get(region)) {
      puenteCorto = `Ya conocés ${wine.region}`;
      puente = di(
        [`Como ya conocés ${wine.region}, te recomiendo este vino`, `${wine.region} ya es terreno conocido: te propongo este vino`],
        "regionc"
      );
    } else if (perfil.tomadosPorTipo?.get(tipo) && TIPO_PLURAL[tipo]) {
      puenteCorto = "Un estilo que ya conocés";
      puente = di(["Como ya conocés este estilo, te recomiendo este vino", "Un estilo que ya conocés: te sugiero este vino"], "estilo");
    }
    return { modo: "descubrimiento", coincidencia: null, razones: puente ? [puente] : [], motivos: puenteCorto ? [puenteCorto] : [] };
  }

  return { modo: "afinidad", coincidencia, razones: razones.slice(0, 3), motivos: motivos.slice(0, 3) };
};

module.exports = {
  buildTasteProfile,
  explicarRecomendacion,
  rankFeatured,
  // Exportados para los tests: son las dos decisiones que definen la home y
  // conviene poder fijarlas por separado de cómo se intercalan.
  puntajeDeAfinidad,
  puntajeDeDescubrimiento,
};
