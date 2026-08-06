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
    body: "Son lo que te seca la lengua, como cuando dejás el saquito de té de más en la taza. Vienen de la piel y la semilla de la uva, y de la madera si el vino pasó por barrica. No son un defecto: son el esqueleto de un tinto, lo que le da agarre y lo que le permite aguantar años en la cava. Un vino muy tánico pide comida: la grasa y la proteína los ablandan en la boca.",
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
    body: "Es lo que te hace agua la boca, como una rodaja de limón. Suena a defecto y es lo contrario: es lo que mantiene al vino fresco y lo que limpia el paladar entre bocado y bocado. Por eso un vino con buena acidez salva un plato pesado —una provoleta, una salsa con crema— y uno sin acidez se vuelve pesado él mismo a la tercera copa.",
    anchor: ({ info }) => {
      const n = Number(info?.structure?.acidity);
      if (!Number.isFinite(n)) return null;
      if (n >= 4) return `El tuyo tiene ${n} de 5: bien fresco, se banca comida grasa sin cansar.`;
      return `El tuyo tiene ${n} de 5: acidez discreta, mejor con platos que no sean muy pesados.`;
    },
  },

  cuerpo: {
    title: "Cuerpo",
    body: "Es cuánto pesa el vino en la boca, y se entiende mejor con leche: agua, leche descremada, leche entera. Un vino liviano pasa y se va; uno corpulento se queda y se siente denso. No es calidad —hay livianos excelentes y corpulentos mediocres—: es carácter, y decide con qué comida va. Liviano con pescado, corpulento con carne.",
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
    body: "Un vino no mejora para siempre: sube, llega a una meseta y baja. En la subida los taninos se van puliendo y la fruta se vuelve más compleja; después de la meseta empieza a perder fruta y queda seco y sin gracia. La mayoría de los vinos argentinos que se compran en el súper están hechos para tomarse dentro de los tres años, no para guardar.",
    anchor: ({ guarda }) => {
      if (!guarda?.label) return null;
      if (guarda.status === "early") return `El tuyo entra en ventana en ${guarda.from}: si lo abrís hoy vas a encontrar más tanino y menos fruta de la que va a tener.`;
      if (guarda.status === "past") return `El tuyo pasó su ventana (${guarda.detail}). No está mal, pero no espera nada mejor: abrilo.`;
      return `El tuyo está en ventana (${guarda.detail}): es el momento para el que fue hecho.`;
    },
  },

  temperatura: {
    title: "Temperatura de servicio",
    body: "Es el error más común, y el más fácil de arreglar. Un tinto a temperatura ambiente de verano argentino —30 grados— sabe a alcohol y nada más: el calor le tapa la fruta. Y un blanco recién sacado de la heladera está tan frío que no se siente nada. Veinte minutos de heladera para el tinto y quince fuera para el blanco arreglan más vinos que cualquier decantador.",
    anchor: ({ serve }) => (serve ? `Para este: ${serve}. Si está más caliente, veinte minutos de heladera.` : null),
  },

  decantar: {
    title: "Decantar o airear",
    body: "Airear es dejar que el vino tome oxígeno, y sirve de verdad en dos casos: un tinto joven y muy tánico, que se afloja con media hora, y un vino viejo con sedimento, que se pasa a un decantador para dejar el poso en la botella. Fuera de eso es pose. Y ojo: un vino muy viejo puede desarmarse con el aire en veinte minutos, así que ahí conviene servir y tomar.",
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
    body: "Una: el peso manda. Un plato contundente tapa a un vino liviano, y al revés el vino se come el plato. Dos: la acidez corta la grasa —por eso un blanco fresco con una empanada frita funciona mejor de lo que parece—. Tres: lo que crece junto va junto; la cocina de una región suele pedir el vino de esa región. Todo lo demás son detalles, y ninguna regla le gana a lo que te guste.",
    anchor: () => null,
  },

  uvas: {
    title: "Las uvas argentinas",
    body: "Malbec: fruta madura, taninos redondos, el que casi siempre funciona. Cabernet Sauvignon: más firme y herbal, con un dejo a pimiento verde. Bonarda: la segunda más plantada del país y la más subestimada; jugosa, liviana, ideal para pizza. Syrah: especiado, oscuro, muy de San Juan. Torrontés: el blanco argentino de verdad, floral en la nariz y seco en la boca, que sorprende a todo el mundo.",
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
