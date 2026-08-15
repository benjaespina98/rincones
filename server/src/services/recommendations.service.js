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
};

/** Una puntuación alta: de 4 para arriba es "esto me gustó de verdad". */
const PUNTUACION_ALTA = 4;

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
  const yaLoTiene = new Set();

  const sumar = (mapa, valor) => {
    const k = norm(valor);
    if (!k || k === "unknown") return;
    mapa.set(k, (mapa.get(k) || 0) + 1);
  };

  for (const wine of wines) {
    yaLoTiene.add(clave(wine));
    sumar(varietals, wine.varietal);
    sumar(regions, wine.region);
    sumar(types, wine.type);
    if (Number(wine.rating) >= PUNTUACION_ALTA && norm(wine.varietal)) {
      puntuadosAlto.add(norm(wine.varietal));
    }
  }

  return {
    varietals,
    regions,
    types,
    puntuadosAlto,
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
const puntajeDeAfinidad = (wine, perfil) => {
  const uva = norm(wine.varietal);
  const region = norm(wine.region);
  const tipo = norm(wine.type);
  let puntaje = 0;

  if (perfil.varietals.has(uva)) puntaje += PESOS.varietalQueTomas;
  if (perfil.elegidos.varietals.has(uva)) puntaje += PESOS.varietalElegido;
  if (perfil.puntuadosAlto.has(uva)) puntaje += PESOS.varietalQuePuntuasteAlto;
  if (perfil.regions.has(region)) puntaje += PESOS.regionQueTomas;
  if (perfil.types.has(tipo)) puntaje += PESOS.tipoQueTomas;
  if (perfil.elegidos.types.has(tipo)) puntaje += PESOS.tipoElegido;

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
 * Arma la lista final: intercala afinidad y descubrimiento, sin repetir bodega
 * y sin cargar el set de una sola uva.
 *
 * El tope por uva existe porque sin él la mitad afinidad se llenaba de Malbec
 * —es lo que más hay en el catálogo y lo que más toma todo el mundo—, y una home
 * con cuatro Malbec no se lee como ocho recomendaciones sino como una repetida.
 */
const rankFeatured = (catalogo, perfil, { count = 8, seed = 0 } = {}) => {
  const candidatos = (catalogo || [])
    .filter((wine) => wine && !perfil.yaLoTiene.has(clave(wine)))
    .map((wine) => ({
      wine,
      afinidad: puntajeDeAfinidad(wine, perfil),
      descubrimiento: puntajeDeDescubrimiento(wine, perfil),
      ruido: desempate(wine, seed),
    }));

  const porAfinidad = [...candidatos].sort(
    (a, b) => b.afinidad - a.afinidad || b.ruido - a.ruido
  );
  const porDescubrimiento = [...candidatos].sort(
    (a, b) => b.descubrimiento - a.descubrimiento || b.ruido - a.ruido
  );

  const elegidos = [];
  const bodegas = new Set();
  const uvas = new Map();
  const yaElegido = new Set();

  const tomarDe = (lista) => {
    for (const candidato of lista) {
      const k = clave(candidato.wine);
      if (yaElegido.has(k)) continue;

      const bodega = norm(candidato.wine.winery);
      if (bodega && bodegas.has(bodega)) continue;

      const uva = norm(candidato.wine.varietal);
      if (uva && (uvas.get(uva) || 0) >= TOPE_POR_UVA) continue;

      yaElegido.add(k);
      if (bodega) bodegas.add(bodega);
      if (uva) uvas.set(uva, (uvas.get(uva) || 0) + 1);
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
    if (!listas.some(tomarDe)) break;
    turnoDeAfinidad = !turnoDeAfinidad;
  }

  return elegidos;
};

module.exports = {
  buildTasteProfile,
  rankFeatured,
  // Exportados para los tests: son las dos decisiones que definen la home y
  // conviene poder fijarlas por separado de cómo se intercalan.
  puntajeDeAfinidad,
  puntajeDeDescubrimiento,
};
