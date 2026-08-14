/**
 * Conceptos clave del vino, explicados donde aparece la palabra.
 *
 * ── POR QUÉ NO HAY UNA SECCIÓN DE CONCEPTOS ─────────────────────────────────
 * Porque un glosario al que hay que ir es un glosario que nadie abre. La
 * pregunta "¿qué son los taninos?" no agarra a nadie en una pantalla de
 * aprendizaje: agarra mirando una barra que dice TANINOS 4/5 sin saber si eso es
 * bueno. Cada concepto cuelga del rótulo que ya está en pantalla y no existe en
 * ningún otro lado: si nadie los toca, no le ocuparon lugar a nadie.
 *
 * ── EL RENGLÓN "EN TU BODEGA" ───────────────────────────────────────────────
 * Es lo que separa esto de una enciclopedia. Una definición de taninos existe en
 * mil webs; lo que ninguna puede hacer es explicártelos con el vino que tenés
 * abierto adelante. Sale de datos que la app YA tiene —la estructura de la ficha
 * IA, la ventana de guarda, la uva— y devuelve null cuando no los tiene: la
 * tarjeta se lee igual y nunca inventa un dato para completar la frase.
 *
 * El tono: sommelier que explica bien, sin misticismo ni adjetivos de catálogo.
 */

const TIPOS_CON_TANINO = new Set(["red", "fortified"]);

export const CONCEPTS = {
  taninos: {
    title: "Taninos",
    body: [
      "Son lo que te seca la lengua, como cuando dejás el saquito de té de más en la taza. Vienen de la piel y la semilla de la uva, y de la madera si pasó por barrica — y los dos se sienten distinto: el de la uva envuelve y se queda, el de la madera raspa más adelante y a veces deja la boca áspera. Son el esqueleto de un tinto y lo que le permite aguantar años: con el tiempo se van puliendo, por eso un vino que hoy te parece duro puede estar perfecto en cinco.",
      "Un vino muy tánico pide comida —la grasa y la proteína los ablandan en la boca—, y por eso el mismo vino que solo te parece áspero, con un bife funciona.",
    ],
    anchor: ({ info }) => {
      const n = Number(info?.structure?.tannin);
      if (!Number.isFinite(n)) return null;
      if (n >= 4) return `El tuyo tiene ${n} de 5: por eso pide comida grasa y gana con media hora de aire.`;
      if (n <= 2) return `El tuyo tiene ${n} de 5: se toma suelto, sin necesidad de plato que lo acompañe.`;
      return `El tuyo tiene ${n} de 5: estructura de término medio, cómoda con casi cualquier mesa.`;
    },
    // Sólo tiene sentido donde hay taninos de verdad.
    appliesTo: (wine) => TIPOS_CON_TANINO.has(wine?.type),
  },

  acidez: {
    title: "Acidez",
    body: [
      "Es lo que te hace agua la boca, como una rodaja de limón. Suena a defecto y es lo contrario: mantiene el vino fresco y limpia el paladar entre bocado y bocado.",
      "Por eso uno con buena acidez salva un plato pesado —una provoleta, una salsa con crema— y uno sin acidez se vuelve pesado él mismo a la tercera copa. Es además lo que decide si un vino puede guardarse: sin acidez no hay guarda que aguante, por más tanino y madera que tenga. Y es la razón por la que en Argentina se plantó cada vez más alto — la noche fría es lo que la conserva.",
    ],
    anchor: ({ info }) => {
      const n = Number(info?.structure?.acidity);
      if (!Number.isFinite(n)) return null;
      if (n >= 4) return `El tuyo tiene ${n} de 5: bien fresco, se banca comida grasa sin cansar.`;
      return `El tuyo tiene ${n} de 5: acidez discreta, mejor con platos que no sean muy pesados.`;
    },
  },

  cuerpo: {
    title: "Cuerpo",
    body: [
      "Es cuánto pesa el vino en la boca, y se entiende mejor con leche: agua, leche descremada, leche entera. Un vino liviano pasa y se va; uno corpulento se queda y se siente denso. Ojo con confundirlo con intensidad de sabor: un Pinot Noir puede ser liviano y tener muchísimo aroma.",
      "Lo que da cuerpo es sobre todo el alcohol —de ahí que los vinos de zonas cálidas se sientan más densos— y también el azúcar que quedó y el paso por madera. No es calidad: hay livianos excelentes y corpulentos mediocres. Lo que sí decide es con qué comida va, porque el plato y el vino tienen que pesar parecido.",
    ],
    anchor: ({ info }) => {
      const n = Number(info?.structure?.body);
      if (!Number.isFinite(n)) return null;
      if (n >= 4) return `El tuyo tiene ${n} de 5: es de los que llenan la boca y piden un plato a la altura.`;
      if (n <= 2) return `El tuyo tiene ${n} de 5: liviano, para tomar sin que tape la comida.`;
      return `El tuyo tiene ${n} de 5: cuerpo medio, el más versátil de todos.`;
    },
  },

  guarda: {
    title: "Guarda",
    body: [
      "Un vino no mejora para siempre: sube, llega a una meseta y baja. En la subida los taninos se pulen y la fruta se vuelve más compleja; pasada la meseta pierde fruta y queda seco y sin gracia. La mayoría de lo que se compra en el súper está hecho para tomarse dentro de los tres años.",
      "Un Malbec de gama media aguanta cinco o seis; para hablar de diez o quince tenés que estar ante un vino con acidez y tanino de sobra, que son pocos y se notan al tomarlos jóvenes porque parecen cerrados. Y algo que pesa más que la añada: DÓNDE lo guardás. Un vino bueno en un placard que en verano llega a 30 grados envejece mal y rápido; uno modesto a 16 grados constantes te sorprende.",
    ],
    anchor: ({ guarda }) => {
      if (!guarda?.label) return null;
      if (guarda.status === "early") return `El tuyo entra en ventana en ${guarda.from}: si lo abrís hoy vas a encontrar más tanino y menos fruta de la que va a tener.`;
      if (guarda.status === "past") return `El tuyo pasó su ventana (${guarda.detail}). No está mal, pero no espera nada mejor: abrilo.`;
      return `El tuyo está en ventana (${guarda.detail}): es el momento para el que fue hecho.`;
    },
  },

  temperatura: {
    title: "Temperatura de servicio",
    body: [
      "Es el error más común, y el más fácil de arreglar. Un tinto a temperatura ambiente de verano argentino —30 grados— sabe a alcohol y nada más: el calor le tapa la fruta.",
      "Y un blanco recién sacado de la heladera está tan frío que no se siente nada. Veinte minutos de heladera para el tinto y quince fuera para el blanco arreglan más vinos que cualquier decantador.",
    ],
    anchor: ({ serve }) => (serve ? `Para este: ${serve}. Si está más caliente, veinte minutos de heladera.` : null),
  },

  decantar: {
    title: "Decantar o airear",
    body: [
      "Airear es dejar que el vino tome oxígeno, y sirve de verdad en dos casos: un tinto joven y muy tánico, que se afloja con media hora, y un vino viejo con sedimento, que se pasa a un decantador para dejar el poso en la botella.",
      "Fuera de eso es pose. Y ojo: un vino muy viejo puede desarmarse con el aire en veinte minutos, así que ahí conviene servir y tomar.",
    ],
    anchor: ({ info, wine }) => {
      const n = Number(info?.structure?.tannin);
      if (!TIPOS_CON_TANINO.has(wine?.type)) return "En blancos y espumantes no hace falta: el aire les quita más de lo que les da.";
      if (!Number.isFinite(n)) return null;
      return n >= 4
        ? `El tuyo tiene taninos ${n} de 5: es de los que ganan con media hora de aire.`
        : `El tuyo tiene taninos ${n} de 5: no necesita decantarse, se abre solo en la copa.`;
    },
  },

  maridaje: {
    title: "Maridaje: tres reglas",
    body: [
      "Una: el peso manda. Un plato contundente tapa a un vino liviano, y al revés el vino se come el plato.",
      "Dos: la acidez corta la grasa —por eso un blanco fresco con una empanada frita funciona mejor de lo que parece—. Tres: lo que crece junto va junto; la cocina de una región suele pedir el vino de esa región. Todo lo demás son detalles, y ninguna regla le gana a lo que te guste.",
    ],
    anchor: () => null,
  },

  /* ── Los cuatro de la etiqueta ────────────────────────────────────────────
     Estos no llevan renglón "en tu bodega" y está bien: no hay nada que
     personalizar en qué significa una palabra impresa en el papel. Se ganan el
     lugar por CUÁNDO aparecen —mientras cargás la botella y estás mirando la
     etiqueta— y no por a quién le hablan. */

  etiqueta: {
    title: "Qué te está diciendo la etiqueta",
    // Quedó sólo con el ORIGEN. Antes metía además la añada y el corte apretados
    // en las dos últimas oraciones: tres ideas que no tienen nada que ver entre
    // sí compartiendo párrafo, y las dos que iban al final leídas como una
    // aclaración menor cuando cada una da para su propia tarjeta. Ahora las
    // tienen (`anada` y `corte`).
    body: [
      "Lo que más dice de una etiqueta es lo más chico que esté impreso: el origen. Cuanto más específico, más se compromete quien lo escribió. \"Mendoza\" es media provincia y no significa casi nada — pueden ser uvas compradas a treinta productores distintos.",
      "\"Valle de Uco\" ya es una zona con carácter. \"Gualtallary\" o \"Paraje Altamira\" son lugares concretos, y una bodega que los imprime está apostando a que vos notes la diferencia. Si aparece el nombre de un viñedo o de una parcela, el vino salió de ahí y de ningún otro lado; \"single vineyard\" y \"vino de finca\" son la misma idea dicha en marketing. La regla es simple y no falla: cuanto más grande el lugar que nombra la etiqueta, menos sabe la bodega de dónde vino esa uva.",
    ],
    anchor: ({ wine }) =>
      wine?.region
        ? `El tuyo dice ${wine.region}. Fijate si en la botella hay algo más chico impreso abajo.`
        : null,
  },

  anada: {
    title: "Cómo leer una añada",
    body: [
      "El año de la etiqueta es el de la COSECHA, no el del embotellado, y no es un dato de archivo: es el clima de ese verano. En Mendoza un año fresco da vinos más tensos, con menos alcohol y más acidez; uno caluroso, más maduros y más dulces de fruta. Por eso el mismo vino de dos años seguidos puede no parecerse. 2016 fue el año del Niño y llovió como nunca — muchos tintos salieron livianos y hay quien los adora justamente por eso.",
      "Dos advertencias prácticas. Una: \"añada vieja\" no es sinónimo de mejor, es sinónimo de más vieja, y la mayoría de los vinos no está hecha para esperar. Dos: en un blanco joven o un espumante sin añada, el año importa poco y la frescura importa todo — ahí conviene el más nuevo que encuentres.",
    ],
    anchor: ({ wine }) => {
      const año = Number(wine?.vintage);
      if (!Number.isFinite(año)) return "El tuyo no tiene cosecha cargada; si la etiqueta la dice, vale la pena anotarla.";
      const edad = new Date().getFullYear() - año;
      if (edad <= 2) return `El tuyo es ${año}: joven, con la fruta en su punto más directo.`;
      if (edad <= 6) return `El tuyo es ${año}, así que tiene ${edad} años: la fruta empieza a dar paso a otra cosa.`;
      return `El tuyo es ${año} — ${edad} años. Si no era un vino de guarda, no lo esperes más.`;
    },
  },

  corte: {
    title: "Qué es un corte",
    body: [
      "Un corte (o blend) es un vino hecho con más de una uva, y no es una versión rebajada de nada: los vinos más caros del mundo, en Burdeos, son cortes. La idea es que cada uva aporte lo que a la otra le falta — el Malbec pone fruta y carnosidad, el Cabernet Sauvignon estructura y ese dejo herbal, el Petit Verdot color y tanino.",
      "Un dato para leer la etiqueta: el orden en que aparecen las uvas es el orden de proporción, así que un \"Malbec-Cabernet\" tiene más Malbec que Cabernet. Si no dice porcentajes es casi siempre porque cambian todos los años, según cómo vino cada cosecha. Y ojo con el vocabulario argentino: acá muchas bodegas llaman \"Gran Corte\" a su vino más caro, que suele ser un corte, pero la palabra no está regulada y no garantiza nada por sí sola.",
    ],
    anchor: ({ wine }) => {
      const uva = String(wine?.varietal || "").toLowerCase();
      if (!uva) return null;
      return /blend|corte/.test(uva)
        ? "El tuyo es un corte: fijate en la contraetiqueta si dice de qué uvas y en qué proporción."
        : `El tuyo es ${wine.varietal}, o sea de una sola uva: lo que tomás viene todo de ahí.`;
    },
  },

  precio: {
    title: "Por qué dos Malbec cuestan tan distinto",
    body: [
      "Casi nada de la diferencia está en la uva: está en el rendimiento y en el tiempo. Una viña cargada da doce mil kilos por hectárea y una podada para concentrar da cuatro mil, así que la segunda reparte los mismos costos de todo el año entre un tercio de las botellas.",
      "Después está la madera: una barrica nueva de roble francés cuesta como mil dólares y rinde unas trescientas botellas, o sea que sólo el envase de crianza puede poner varios dólares en cada una. Sumá los años que el vino pasa en bodega sin venderse —guardar plata quieta también cuesta— y el viñedo: una hectárea en Gualtallary vale muchísimo más que una en el este de Mendoza. Lo que casi nunca justifica el precio es el peso de la botella ni lo lindo del papel, que es donde algunas bodegas ponen la diferencia cuando no está adentro.",
    ],
    anchor: ({ wine }) =>
      wine?.purchase?.price > 0
        ? `Pagaste $${Number(wine.purchase.price).toLocaleString("es-AR")} por éste.`
        : null,
  },

  reserva: {
    title: "Reserva y Gran Reserva",
    body: [
      "En España e Italia son categorías reguladas por ley, con años mínimos de barrica y de botella. En Argentina no: cada bodega usa la palabra como quiere.",
      "Suele indicar la gama media o alta de esa bodega —y muchas veces sí implica algo más de madera— pero no lo garantiza nadie, y entre dos bodegas distintas no significan lo mismo. Como señal de calidad, vale menos de lo que parece; como pista del lugar que ocupa ese vino dentro de su bodega, sirve.",
    ],
    anchor: () => null,
  },

  crianza: {
    title: "Crianza: roble, cemento y huevo",
    body: [
      "Los aromas a vainilla, coco, tostado o humo no vienen de la uva: los pone la madera. El roble aporta esos sabores y también tanino, y cuanto más nueva la barrica, más se nota.",
      "El cemento y el huevo de hormigón hacen lo contrario: no aportan sabor y dejan la fruta limpia, por eso volvieron a usarse en los últimos años. \"Sin madera\" no es peor: es otra intención.",
    ],
    anchor: ({ info }) => {
      const aromas = Array.isArray(info?.aromas) ? info.aromas.join(" ").toLowerCase() : "";
      if (!aromas) return null;
      return /roble|vainilla|coco|tostad|humo|ahumad|especia/.test(aromas)
        ? "Los aromas de este vino delatan paso por madera."
        : "Los aromas de este vino apuntan a la fruta, no a la madera.";
    },
  },

  terroir: {
    title: "Terroir",
    body: [
      "Suena místico y es bastante concreto: suelo, altura y clima. En Mendoza la altura es la que más manda. Cada 100 metros que subís, la noche refresca más, la uva madura más lento y conserva acidez y color; por eso los vinos de altura son frescos aunque el día haya sido de 35 grados.",
      "El suelo hace el resto: en Gualtallary hay calcáreo y las raíces pelean, y eso da vinos más tensos y salinos; en Luján de Cuyo el suelo es más profundo y los Malbec salen más redondos y carnosos. Nada de esto es mejor ni peor, es otra cosa — y explica por qué dos Malbec de la misma bodega y el mismo año pueden no parecerse.",
    ],
    anchor: ({ wine }) => (wine?.region ? `El tuyo viene de ${wine.region}.` : null),
  },

  uvas: {
    title: "Las uvas argentinas",
    body: [
      "Malbec: en Francia daba vinos duros y rústicos; acá la altura le dio fruta y taninos redondos, y por eso es nuestro. No es una uva, son muchas — un Malbec de Uco a 1.200 metros y uno de Luján a 900 no se parecen en nada. Cabernet Sauvignon: más firme y herbal, ese dejo a pimiento verde que aparece cuando la uva no terminó de madurar (en su punto es grafito y tabaco).",
      "Bonarda: la segunda más plantada y la más subestimada, jugosa y sin pretensiones; si te cansaste de la madera, empezá por acá. Syrah: especiado y oscuro, y en San Juan da algo que no da en ningún otro lado. Torrontés: floral en la nariz y seco en la boca — engaña a todo el mundo, porque huele dulce y no lo es. Y Criolla y Cereza, que son la mitad del viñedo argentino y casi nunca ves en una etiqueta: van al vino de mesa.",
    ],
    anchor: ({ wine }) => (wine?.varietal ? `El tuyo es ${wine.varietal}.` : null),
  },
};

/**
 * El renglón "en tu bodega" de un concepto, o null.
 *
 * Nunca lanza: un concepto que no puede anclarse se muestra sin la línea, y eso
 * es preferible a que una tarjeta explote por un dato que no vino.
 */
export const conceptAnchor = (id, ctx = {}) => {
  const c = CONCEPTS[id];
  if (!c?.anchor) return null;
  try {
    return c.anchor(ctx) || null;
  } catch {
    return null;
  }
};

/* ── La lección de la home ──────────────────────────────────────────────────
 *
 * Estos conceptos ya existían colgados de los rótulos de la ficha, donde la
 * pregunta aparece sola. Eso sigue igual: esto no es un glosario al que haya
 * que ir, es UNA tarjeta en Descubrí que abre la misma hoja.
 *
 * Por qué se gana el lugar que ocupaba el directorio de links: es contenido
 * propio (no depende de que YouTube no baje un video), está en castellano y en
 * el tono de la app, no te saca de la aplicación, y —a diferencia de seis
 * enlaces fijos— se elige según lo que tenés en la bodega. La regla es la misma
 * que la del vino del día: si hay algo cierto que decirte, se dice; si no, cae
 * a lo general. Nunca se afirma algo que las estadísticas no sostengan.
 */

const TIPOS_TINTOS = new Set(["red", "fortified"]);
const TIPOS_FRESCOS = new Set(["white", "rosé", "sparkling"]);

/** Lecciones que valen para cualquiera, en cualquier momento. */
const LECCIONES_GENERALES = [
  { id: "etiqueta", hook: "Cuanto más chico el lugar que dice la etiqueta, más dice" },
  { id: "maridaje", hook: "Tres reglas para no errarle con la comida" },
  { id: "temperatura", hook: "El error más común de todos, y el más fácil de arreglar" },
  { id: "reserva", hook: "“Reserva” en Argentina no significa lo que parece" },
  { id: "crianza", hook: "La vainilla y el tostado no vienen de la uva: los pone la madera" },
  { id: "uvas", hook: "Las cinco uvas argentinas, en un renglón cada una" },
  { id: "cuerpo", hook: "Qué quiere decir, en la boca, que un vino sea corpulento" },
  { id: "anada", hook: "El año de la etiqueta no es una fecha: es un clima" },
  { id: "corte", hook: "Un corte no es un vino rebajado (los de Burdeos lo son)" },
  { id: "precio", hook: "Por qué dos Malbec pueden costar diez veces distinto" },
];

const contar = (lista, prop, filtro) =>
  lista.reduce((acc, x) => (filtro(x[prop]) ? acc + (x.count || 0) : acc), 0);

/**
 * Qué conviene explicarte hoy, según tu bodega.
 *
 * Devuelve `{ id, hook }`: el concepto y la línea que dice por qué te toca ese.
 * `seed` sólo elige entre los candidatos que ya son verdad — igual que en
 * momentCopy, lo que rota es cuál de las cosas ciertas se cuenta, no si es
 * cierta.
 */
export const pickLesson = ({ stats, seed = 0 } = {}) => {
  const total = stats?.totals?.total || 0;
  const varietals = stats?.topVarietals || [];
  const regions = stats?.topRegions || [];
  const types = stats?.countsByType || [];

  // Bodega vacía: no hay nada tuyo que mirar, y lo que hace falta es lo básico.
  if (total === 0) {
    const arranque = [
      { id: "etiqueta", hook: "Antes de la primera botella: qué dice cada palabra del papel" },
      { id: "uvas", hook: "Las cinco uvas argentinas, para saber por dónde empezar" },
    ];
    return arranque[Math.abs(seed) % arranque.length];
  }

  const tintos = contar(types, "type", (t) => TIPOS_TINTOS.has(t));
  const frescos = contar(types, "type", (t) => TIPOS_FRESCOS.has(t));
  const uvaTop = varietals[0];
  const regionTop = regions[0];

  // Candidatos anclados en datos verificables. Se juntan todos los que aplican
  // y después se elige uno: así dos personas con bodegas distintas no leen lo
  // mismo, y la misma persona no lee siempre lo mismo.
  const propios = [];

  if (tintos >= 2) {
    propios.push(
      { id: "taninos", hook: `Tenés ${tintos} tintos: esto es lo que les da el esqueleto` },
      { id: "decantar", hook: "Tus tintos: cuándo airear sirve de verdad y cuándo es pose" }
    );
  }

  if (frescos >= 2) {
    propios.push({
      id: "acidez",
      hook: `Tenés ${frescos} blancos o espumantes: la acidez es lo que los mantiene vivos`,
    });
  }

  if (regionTop?.count >= 2 && regionTop.region) {
    propios.push({
      id: "terroir",
      hook: `Repetís ${regionTop.region}: qué le da esa zona a la uva`,
    });
  }

  /**
   * Los tres conceptos nuevos, anclados en datos que antes no existían.
   *
   * `vintages`, `blends` y `prices` los calcula la misma agregación que ya
   * devolvía uvas, regiones y tipos (ver `getUserStats` en wine.model.js): no
   * cuestan una consulta extra ni obligan a Descubrí a traerse la bodega entera
   * para contar tres cosas. Si no hay datos suficientes, el candidato no se
   * propone y quedan los generales — nunca se afirma algo que la bodega no
   * sostenga.
   */
  const añadas = stats?.vintages;
  if (añadas?.count >= 2 && añadas.max > añadas.min) {
    propios.push({
      id: "anada",
      hook: `Tenés botellas de ${añadas.min} y de ${añadas.max}: qué cambia entre una añada y otra`,
    });
  }

  const cortes = Number(stats?.blends) || 0;
  if (cortes >= 1) {
    propios.push({
      id: "corte",
      hook:
        cortes === 1
          ? "Tenés un corte en la bodega: qué significa eso en la botella"
          : `Tenés ${cortes} cortes: qué aporta cada uva a la mezcla`,
    });
  }

  const precios = stats?.prices;
  // Sólo si la diferencia es de verdad grande: con dos botellas parecidas la
  // pregunta "por qué cuestan distinto" no se le ocurre a nadie.
  if (precios?.count >= 2 && precios.max >= precios.min * 3) {
    propios.push({
      id: "precio",
      hook: "Entre tu botella más cara y la más barata hay una diferencia grande: en qué se va esa plata",
    });
  }

  if (uvaTop?.count >= 3 && uvaTop.varietal) {
    propios.push({
      id: "uvas",
      hook: `Tenés mano de ${uvaTop.varietal}: cómo son las otras uvas argentinas`,
    });
  }

  if (total >= 3) {
    propios.push({
      id: "guarda",
      hook: `Tenés ${total} botellas: cuándo conviene abrir cada una`,
    });
  }

  const pool = propios.length > 0 ? propios : LECCIONES_GENERALES;
  return pool[Math.abs(seed) % pool.length];
};
