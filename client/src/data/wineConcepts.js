import { leerCosecha, hayValorDeCosecha } from "../utils/vintage";
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
      "Los taninos son lo que seca y frunce la boca, como un té que se pasó de tiempo. Vienen de la piel y las semillas de la uva, y también de la barrica.",
      "Un tinto con mucho tanino pide comida: la grasa de un bife lo suaviza. Con los años se pule y gana suavidad.",
    ],
    copa: "Fijate si la sequedad se queda en las encías o pasa rápido.",
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
      "La acidez es lo que te hace agua la boca, como un limón. Mantiene el vino fresco y limpia el paladar entre bocado y bocado.",
      "Por eso un vino con buena acidez rescata un plato pesado, como una provoleta, y es lo que le permite guardarse años.",
    ],
    copa: "Notá si te hace salivar al tragar: esa es la acidez trabajando.",
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
      "El cuerpo es cuánto pesa el vino en la boca. Pensalo como agua, leche descremada y leche entera: un vino liviano pasa rápido y uno con cuerpo se queda.",
      "No es lo mismo que la intensidad: un Pinot Noir puede ser liviano y oler muchísimo. Lo define sobre todo el alcohol, y sirve para elegir el plato: comida y vino tendrían que pesar parecido.",
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
      "La guarda es el tiempo que un vino mejora antes de empezar a decaer. Sube, llega a una meseta y baja: en la subida los taninos se pulen y la fruta se vuelve más compleja.",
      "La mayoría de los vinos está hecha para tomarse en pocos años. Y pesa más dónde lo guardás que la añada: un lugar muy caluroso lo envejece mal y rápido.",
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
      "Servir a la temperatura justa cambia más un vino que casi cualquier otra cosa. Un tinto a temperatura de verano sabe a alcohol, y un blanco recién sacado de la heladera casi no se siente.",
      "Un truco simple: veinte minutos de heladera para el tinto y quince fuera de ella para el blanco.",
    ],
    anchor: ({ serve }) => (serve ? `Para este: ${serve}. Si está más caliente, veinte minutos de heladera.` : null),
  },

  decantar: {
    title: "Decantar o airear",
    body: [
      "Decantar es pasar el vino a otro recipiente para que tome aire. Sirve de verdad en dos casos: un tinto joven y muy tánico, que se afloja con media hora, y uno viejo con sedimento, para dejar el poso en la botella.",
      "En los demás casos es más ceremonia que necesidad, y un vino muy viejo puede apagarse con el aire.",
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
      "Tres reglas alcanzan para empezar. Primera: el peso manda, un plato contundente tapa a un vino liviano y al revés.",
      "Segunda: la acidez corta la grasa, por eso un blanco fresco funciona con una empanada frita. Tercera: lo que crece junto va junto. Y si algo te gusta, ninguna regla le gana.",
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
      "Lo más revelador de una etiqueta es el origen: cuanto más específico, más se compromete la bodega.",
      "Mendoza es media provincia, Valle de Uco ya es una zona con carácter y el nombre de un viñedo es un lugar concreto. Cuanto más grande el lugar que nombra, menos dice del origen exacto de la uva.",
    ],
    anchor: ({ wine }) =>
      wine?.region
        ? `El tuyo dice ${wine.region}. Fijate si en la botella hay algo más chico impreso abajo.`
        : null,
  },

  anada: {
    title: "Cómo leer una añada",
    body: [
      "La añada es el año de la cosecha, no el del embotellado. Cuenta cómo fue el clima de ese ciclo, y por eso el mismo vino puede cambiar de un año al siguiente.",
      "Un año fresco suele dar vinos más tensos y con más acidez, y uno caluroso, más maduros. Añada vieja no significa mejor: significa más vieja.",
    ],
    anchor: ({ wine, propio = true }) => {
      // Sin vino no hay nada que decir de "el tuyo": la lección de la home abre este pop-up sin
      // ninguna botella adelante.
      if (!wine) return null;
      const año = leerCosecha(wine);
      if (año === null) {
        // Hay algo escrito que no es un año (NV, "2019/20"): no se afirma que falte.
        if (hayValorDeCosecha(wine)) return null;
        // Sin dato: sólo se invita a anotarla si el vino es del usuario. Una ficha del catálogo
        // nunca trae cosecha (es el vino, no la botella) y decirle "el tuyo" sería falso.
        return propio
          ? "Este vino no tiene cosecha cargada. Si la etiqueta la dice, vale la pena anotarla."
          : null;
      }
      const edad = new Date().getFullYear() - año;
      if (edad <= 2) return `El tuyo es ${año}: joven, con la fruta en su punto más directo.`;
      if (edad <= 6) return `El tuyo es ${año}, así que tiene ${edad} años: la fruta empieza a dar paso a otra cosa.`;
      return `El tuyo es ${año}, de hace ${edad} años. Si no era un vino de guarda, no lo esperes más.`;
    },
  },

  corte: {
    title: "Qué es un corte",
    body: [
      "Un corte, o blend, es un vino hecho con más de una uva. No es una versión rebajada: los grandes vinos de Burdeos son cortes.",
      "Cada uva aporta algo distinto: el Malbec suma fruta y cuerpo, y el Cabernet Sauvignon, estructura. En la etiqueta, la primera uva que se nombra suele ser la que más pesa.",
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
      "Dos Malbec pueden costar muy distinto sobre todo por rendimiento y tiempo, más que por la uva. Una viña que da menos kilos por hectárea reparte los mismos costos entre menos botellas.",
      "Pesan además la barrica de roble, los años en bodega y el viñedo de origen. El precio no se explica por el peso de la botella ni por lo lindo de la etiqueta.",
    ],
    anchor: ({ wine }) =>
      wine?.purchase?.price > 0
        ? `Pagaste $${Number(wine.purchase.price).toLocaleString("es-AR")} por éste.`
        : null,
  },

  reserva: {
    title: "Reserva y Gran Reserva",
    body: [
      "En España e Italia, Reserva y Gran Reserva son categorías reguladas, con tiempos mínimos de barrica y de botella. En Argentina cada bodega usa la palabra a su criterio.",
      "Suele señalar la gama media o alta de esa bodega, a veces con más madera. Sirve como pista dentro de una misma bodega, menos para comparar entre bodegas.",
    ],
    anchor: () => null,
  },

  crianza: {
    title: "Crianza: roble, cemento y huevo",
    body: [
      "La crianza es el tiempo que el vino pasa en barrica, cemento u otro recipiente antes de embotellarse. Los aromas a vainilla, coco o tostado no vienen de la uva: los aporta la madera.",
      "El cemento no aporta sabor y deja la fruta más limpia. Un vino sin madera no es peor, tiene otra intención.",
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
      "Terroir es el conjunto de suelo, altura y clima que le da carácter a un vino. Suena misterioso y es bastante concreto.",
      "En Mendoza la altura pesa mucho: a mayor altura las noches son más frescas y la uva madura más lento, conservando acidez y color. Por eso dos Malbec de la misma bodega pueden no parecerse.",
    ],
    anchor: ({ wine }) => (wine?.region ? `El tuyo viene de ${wine.region}.` : null),
  },

  /**
   * El repaso general. Sólo se usa cuando NO sabemos de qué uva es el vino, o
   * cuando la uva que dice la etiqueta no está en la lista de abajo.
   *
   * Antes se abría siempre: tocabas "Cabernet Franc" en la ficha y te llegaba
   * un párrafo sobre Malbec, Bonarda, Syrah y Torrontés — cuatro uvas que no
   * tenías en la mano y ninguna línea sobre la que sí. La pregunta que hace
   * alguien tocando el varietal de SU botella es "¿cómo es ESTA uva?", así que
   * ahora cada una tiene su tarjeta (ver `UVAS`) y ésta quedó de red.
   */
  uvas: {
    title: "Las uvas argentinas",
    body: [
      "Las uvas argentinas más conocidas cuentan historias distintas. El Malbec es la insignia, la Bonarda es jugosa y sin pretensiones, el Syrah es especiado y el Torrontés huele dulce pero es seco.",
      "La Criolla y la Cereza son muy plantadas, pero casi nunca figuran en una etiqueta.",
    ],
    anchor: ({ wine }) => (wine?.varietal ? `El tuyo es ${wine.varietal}.` : null),
  },
};

/* ── UNA TARJETA POR UVA ────────────────────────────────────────────────────
 *
 * Cada varietal explicado como si tuvieras esa botella abierta adelante: qué
 * esperar en la nariz y en la boca, qué le hace la Argentina que no le hace
 * ningún otro lado, y con qué va. Dos párrafos, ni uno más — esto se lee
 * parado, con la copa servida.
 *
 * `donde` es lo que vuelve la tarjeta TUYA y no de una enciclopedia: si la
 * región de tu botella cae en una de las zonas que le cambian el carácter a esa
 * uva, se dice; si no, se dice sólo la región. Nunca se inventa una zona para
 * completar la frase.
 */
const UVAS = {
  malbec: {
    title: "Malbec",
    rasgo: "fruta negra madura y taninos redondos",
    body: [
      "El Malbec es la uva insignia de Argentina: da vinos de fruta negra madura, violetas y taninos redondos.",
      "En Francia era una uva rústica; acá la altura le dio sol para madurar y noches frías para conservar la acidez. Un Malbec de Uco es más tenso y floral que uno de Luján de Cuyo, más carnoso.",
    ],
    copa: "Buscá las violetas en la nariz.",
    donde: [
      [/uco|gualtallary|altamira|tupungato|vista flores|chacayes/i, "que es donde el Malbec sale más tenso y floral, con filo en vez de dulzor"],
      [/luj[áa]n|agrelo|per?drie?l|vistalba|may[úu]/i, "cuna del Malbec moderno: ahí sale más carnoso y redondo que en Uco"],
      [/salta|cafayate|calchaqu/i, "a esa altura el Malbec se pone oscuro, especiado y con muchísima concentración"],
      [/patagonia|neuqu[ée]n|r[íi]o negro|chubut/i, "el viento y el frío le dan un Malbec más liviano y filoso que el mendocino"],
    ],
  },

  "cabernet sauvignon": {
    title: "Cabernet Sauvignon",
    rasgo: "cassis, grafito y un tanino que ordena",
    body: [
      "El Cabernet Sauvignon es una de las uvas más plantadas del mundo: piel gruesa, mucho color y mucho tanino, con aromas a cassis, grafito y tabaco.",
      "Suele tener un dejo herbal que, en su punto, es menta u hoja de tabaco. Necesita tiempo y comida con grasa, como un bife de chorizo.",
    ],
    donde: [
      [/luj[áa]n|agrelo|per?drie?l|vistalba/i, "Luján de Cuyo es la zona clásica del Cabernet argentino: maduro, con el herbal justo"],
      [/uco|gualtallary|altamira|tupungato/i, "en Uco el Cabernet sale más fresco y más herbal, más cerca de Burdeos que de Mendoza"],
    ],
  },

  "cabernet franc": {
    title: "Cabernet Franc",
    rasgo: "frambuesa, grafito y esa nota herbal que lo delata",
    body: [
      "El Cabernet Franc es uno de los padres del Cabernet Sauvignon, más perfumado y con menos tanino: frambuesa, grafito y una nota herbal inconfundible.",
      "En Argentina ganó prestigio en los últimos años, sobre todo en Uco. Va bien con cordero, berenjenas y platos con hierbas, y se toma un poco más fresco que otros tintos.",
    ],
    donde: [
      [/uco|gualtallary|altamira|tupungato|vista flores/i, "es donde el Cabernet Franc argentino se puso serio: fresco, floral y con esa nota de grafito"],
      [/luj[áa]n|agrelo|per?drie?l/i, "ahí sale más maduro y carnoso, con la nota verde más contenida"],
      [/patagonia|r[íi]o negro|neuqu[ée]n/i, "el frío patagónico le sube el perfume y le deja el cuerpo liviano"],
    ],
  },

  merlot: {
    title: "Merlot",
    rasgo: "ciruela madura y taninos sin esquinas",
    body: [
      "El Merlot es el tinto amable: piel más fina, tanino suave y fruta madura como ciruela y cereza negra.",
      "Por no tener esquinas suele gustarle a quien encuentra áspero el vino. En Argentina funciona mejor en zonas frías, como Uco alto y la Patagonia. Va con pastas, cerdo y quesos semiduros.",
    ],
    donde: [
      [/uco|tupungato|altamira|gualtallary/i, "en Uco el Merlot conserva acidez y deja de ser dulzón"],
      [/patagonia|r[íi]o negro|neuqu[ée]n/i, "en la Patagonia da su mejor versión argentina: fruta roja fresca y buen filo"],
    ],
  },

  syrah: {
    title: "Syrah",
    rasgo: "pimienta negra, aceituna y fruta oscura",
    body: [
      "El Syrah es oscuro, especiado y carnoso: pimienta negra, aceituna y mora. Parte de esa pimienta viene de la propia uva, no de la barrica.",
      "En San Juan suele dar vinos más tensos y minerales que en otras zonas. Es buen compañero del chorizo, el cordero y cualquier plato bien especiado.",
    ],
    donde: [
      [/san juan|pedernal|tulum|zonda/i, "San Juan es LA zona del Syrah argentino: más tenso y especiado que el mendocino"],
      [/uco|tupungato|gualtallary/i, "en altura el Syrah sale más floral y menos carnoso, con la pimienta bien al frente"],
    ],
  },

  "pinot noir": {
    title: "Pinot Noir",
    rasgo: "cereza, un fondo terroso y casi nada de tanino",
    body: [
      "El Pinot Noir es una uva delicada: piel fina, color claro y poco tanino, con aromas a cereza, frutilla y un fondo terroso.",
      "Necesita frío, por eso en Argentina vive en la Patagonia y en Uco alto. Se sirve algo más fresco que otros tintos y acompaña bien salmón, hongos o pollo al horno.",
    ],
    copa: "El color claro no significa liviano de sabor.",
    donde: [
      [/patagonia|r[íi]o negro|neuqu[ée]n|chubut|trevelin/i, "la Patagonia es donde el Pinot argentino tiene sentido: frío, viento y ciclo largo"],
      [/uco|gualtallary|tupungato|altamira/i, "en la parte más alta de Uco el Pinot funciona; abajo, el calor se lo come"],
    ],
  },

  bonarda: {
    title: "Bonarda",
    rasgo: "fruta jugosa y directa, sin una astilla de madera",
    body: [
      "La Bonarda es una de las uvas más plantadas de Argentina y de las más subestimadas: jugosa, de fruta directa, con poco tanino y buena acidez.",
      "Suele salir sin madera, así que es una buena opción si te cansaste del roble. Se da bien en el este de Mendoza y en San Juan, y va con milanesas, empanadas y fiambres.",
    ],
    donde: [
      [/san rafael|\beste\b|rivadavia|jun[íi]n|santa rosa|la paz/i, "el este de Mendoza es tierra de Bonarda vieja, y ahí es donde da lo mejor"],
      [/san juan/i, "en San Juan la Bonarda sale más madura y carnosa"],
    ],
  },

  tannat: {
    title: "Tannat",
    rasgo: "tanino de los que se mastican",
    body: [
      "El Tannat es una uva de mucho tanino, con color casi opaco, fruta negra y gran capacidad de guarda.",
      "Viene del sudoeste de Francia y es la insignia de Uruguay. Joven puede resultar áspera; con años o buena mano de enólogo se vuelve profunda. Pide un plato con grasa, como un asado.",
    ],
  },

  "petit verdot": {
    title: "Petit Verdot",
    rasgo: "violetas, tinta y estructura de sobra",
    body: [
      "El Petit Verdot es una uva intensa y oscura: violetas, fruta negra, especias y tanino firme.",
      "En Burdeos se usa en dosis chicas dentro de los cortes porque madura tarde. En Mendoza el sol le alcanza, y por eso se hacen Petit Verdot solos. Brilla con platos contundentes.",
    ],
  },

  tempranillo: {
    title: "Tempranillo",
    rasgo: "cuero, tabaco y roble americano",
    body: [
      "El Tempranillo es la uva de Rioja: fruta roja, cuero y tabaco, tanino medio y buena afinidad con el roble americano, que le suma vainilla y coco.",
      "Se llama así porque madura temprano. En Argentina quedó en segundo plano, en viñedos viejos. Va con chorizo, cordero y guisos.",
    ],
  },

  sangiovese: {
    title: "Sangiovese",
    rasgo: "cereza ácida, tomate seco y acidez de mesa italiana",
    body: [
      "El Sangiovese es la uva del Chianti: cereza ácida, tomate seco, hierbas y una acidez muy alta.",
      "La trajeron los inmigrantes italianos. Solo puede parecer flaco, pero con comida se entiende: pasta con salsa, pizza o provoleta. Su acidez acompaña los platos ácidos en lugar de pelearlos.",
    ],
  },

  criolla: {
    title: "Criolla",
    rasgo: "color pálido y liviandad de otra época",
    body: [
      "Criolla Chica, Criolla Grande y Cereza son las uvas que trajeron los españoles hace siglos y dieron origen al vino argentino. Hoy casi no figuran en las etiquetas.",
      "Un grupo de bodegas las trabaja de nuevo, sobre todo la Criolla Chica de viñedos viejos: color pálido, fruta roja, poco tanino y poco alcohol. Se toman frescos.",
    ],
  },

  chardonnay: {
    title: "Chardonnay",
    rasgo: "cítrico o manteca, según cuánta barrica haya visto",
    body: [
      "El Chardonnay es un camaleón: lo que tomás depende mucho de lo que hizo la bodega. Sin madera es cítrico y tenso; con barrica es más untuoso, con manteca y avellana.",
      "En Argentina los mejores suelen venir de zonas altas y frías, como Uco y la Patagonia, que conservan la acidez. Va con pollo, pescado con salsa y quesos cremosos.",
    ],
    copa: "Fijate si predomina lo cítrico o la manteca.",
    donde: [
      [/uco|gualtallary|tupungato|altamira/i, "la altura de Uco es lo que le deja la acidez y evita el Chardonnay pesado"],
      [/patagonia|r[íi]o negro|neuqu[ée]n|chubut/i, "en la Patagonia sale filoso y cítrico, casi tenso"],
    ],
  },

  "sauvignon blanc": {
    title: "Sauvignon Blanc",
    rasgo: "pomelo y pasto recién cortado",
    body: [
      "El Sauvignon Blanc se reconoce a un metro de la copa: pomelo, maracuyá y pasto recién cortado. Rara vez lleva madera, porque su atractivo es la frescura.",
      "Conviene tomarlo joven y bien frío. Corta la grasa, así que va con provoleta, mariscos, ceviche o ensaladas con queso de cabra.",
    ],
    donde: [
      [/uco|gualtallary|tupungato|altamira/i, "en Uco alto conserva el filo cítrico que la uva pierde con el calor"],
      [/patagonia|r[íi]o negro|neuqu[ée]n/i, "el frío patagónico le da la versión más punzante que hay en el país"],
    ],
  },

  torrontes: {
    title: "Torrontés",
    rasgo: "jazmín en la nariz y sequedad en la boca",
    body: [
      "El Torrontés es una uva típica de Argentina, cruce de Moscatel de Alejandría y Criolla Chica. Engaña: huele dulce, a jazmín, azahar y durazno, pero en la boca es seco.",
      "Cafayate, en Salta, es su zona clásica. Se toma joven y muy frío, y su perfume aguanta platos picantes o especiados, como el ceviche o las empanadas salteñas.",
    ],
    donde: [
      [/cafayate|salta|calchaqu|molinos|colom[ée]/i, "Cafayate es la casa del Torrontés: es de donde salen los mejores del país"],
      [/rioja|famatina|chilecito/i, "La Rioja hace un Torrontés más floral y más suave que el salteño"],
      [/patagonia|r[íi]o negro|neuqu[ée]n/i, "en el sur el Torrontés sale más contenido y más cítrico que el del norte"],
    ],
  },

  semillon: {
    title: "Semillón",
    rasgo: "manzana, cera de abeja y un filo que envejece raro",
    body: [
      "El Semillón es un blanco de cuerpo medio, con notas de manzana, cera de abeja y hierba, y una acidez que sostiene sin saltar.",
      "Fue muy plantado en Argentina y hoy sobrevive en viñedos viejos. Envejece raro para un blanco: con los años gana complejidad. Va con pescado de mar, cerdo y quesos de cabra.",
    ],
  },

  viognier: {
    title: "Viognier",
    rasgo: "damasco, madreselva y una textura casi grasa",
    body: [
      "El Viognier es un blanco de perfume enorme y poca acidez: damasco, durazno blanco y madreselva, con una textura casi untuosa.",
      "Por eso se lo confunde con un vino dulce, aunque es seco. Conviene tomarlo joven y bien frío, con curry suave, cerdo con frutas o calabaza.",
    ],
  },

  "chenin blanc": {
    title: "Chenin Blanc",
    rasgo: "manzana verde y acidez de cuchillo",
    body: [
      "El Chenin Blanc es una de las uvas más versátiles: en el Loira da desde espumantes hasta vinos dulces de guarda larga. Su marca es la acidez alta, con manzana verde, membrillo y miel.",
      "En Argentina hay Chenin viejo en el este de Mendoza y en San Juan, con blancos secos y muy buenos para su precio. Va con pescado, pollo y quesos de cabra.",
    ],
  },

  "pinot grigio": {
    title: "Pinot Grigio",
    rasgo: "cítrico liviano, de aperitivo y sin ceremonia",
    body: [
      "Pinot Grigio y Pinot Gris son la misma uva con dos estilos. El italiano es liviano, cítrico y fácil de tomar; el alsaciano es más pleno, especiado y con notas de pera.",
      "Lo que suele llegar a la mesa argentina es el primero: un blanco de aperitivo, muy frío, para picadas, sushi o pescado a la plancha.",
    ],
  },

  riesling: {
    title: "Riesling",
    rasgo: "lima, flores blancas y una acidez que dura décadas",
    body: [
      "El Riesling es muy valorado por quienes saben de vino y mal vendido: cargó con fama de dulce, aunque la mayoría es seca. Tiene lima, manzana verde, flores blancas y una acidez que lo mantiene vivo por décadas.",
      "En Argentina es raro y sale casi todo de la Patagonia. Va con cocina asiática, cerdo y platos agridulces o picantes.",
    ],
  },

  moscatel: {
    title: "Moscatel",
    rasgo: "uva fresca y azahar, tal cual salen de la parra",
    body: [
      "El Moscatel es una de las pocas uvas cuyo vino huele como la uva fresca: azahar, cáscara de naranja y uva de mesa. Es una familia muy antigua y parte del origen del Torrontés.",
      "Aparece en espumantes dulces y vinos de postre. Se toma muy frío, en copa chica, con frutas, tartas o flan.",
    ],
  },
};

/**
 * De "Cab Sauv 2019" o "Malbec" a la clave de la tarjeta.
 *
 * Es intencionalmente laxa: la etiqueta la escribe una persona o la lee una
 * cámara, así que lo que llega puede ser "Cabernet Franc", "cabernet franc" o
 * "Cab. Franc". Se buscan las claves más largas primero para que "cabernet
 * sauvignon" no caiga en la tarjeta de un "cabernet" genérico.
 */
const ALIAS_UVA = {
  "cabernet franc": "cabernet franc",
  "cab franc": "cabernet franc",
  "cabernet sauvignon": "cabernet sauvignon",
  "cab sauvignon": "cabernet sauvignon",
  "cab sauv": "cabernet sauvignon",
  cabernet: "cabernet sauvignon",
  "pinot noir": "pinot noir",
  "pinot negro": "pinot noir",
  "pinot grigio": "pinot grigio",
  "pinot gris": "pinot grigio",
  "sauvignon blanc": "sauvignon blanc",
  "chenin blanc": "chenin blanc",
  chenin: "chenin blanc",
  "petit verdot": "petit verdot",
  torrontes: "torrontes",
  semillon: "semillon",
  moscato: "moscatel",
  moscatel: "moscatel",
  "muscat": "moscatel",
  cereza: "criolla",
  "criolla chica": "criolla",
  "criolla grande": "criolla",
};

const sinTildes = (v) =>
  String(v || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Qué concepto abrir cuando alguien toca la uva de SU vino.
 *
 * Devuelve la tarjeta de esa uva; un corte manda a "Qué es un corte" (que es la
 * pregunta real ahí, porque no hay una uva sola de la que hablar); y lo que no
 * reconocemos cae al repaso general en vez de no abrir nada.
 */
export const grapeConceptId = (varietal) => {
  const texto = sinTildes(varietal);
  if (!texto) return "uvas";
  if (/\bblend\b|\bcorte\b|\bmezcla\b|\bensamblaje\b|[-/+]/.test(texto)) return "corte";

  const claves = [...Object.keys(ALIAS_UVA), ...Object.keys(UVAS)].sort(
    (a, b) => b.length - a.length
  );
  const encontrada = claves.find((clave) => texto.includes(clave));
  if (!encontrada) return "uvas";

  const uva = ALIAS_UVA[encontrada] || encontrada;
  return UVAS[uva] ? `uva:${uva}` : "uvas";
};

/**
 * Qué da esta uva en la copa, en media línea.
 *
 * Es el mismo conocimiento de las tarjetas, recortado a lo que entra en una
 * frase: sirve para que la app pueda RECOMENDAR hablando de vino —"cambiás
 * fruta negra madura por grafito y hierbas"— en vez de anunciar un cambio de
 * etiqueta. Devuelve "" para lo que no conocemos, y quien llama tiene que poder
 * seguir sin la frase: preferimos decir menos antes que inventar un descriptor.
 */
export const grapeTrait = (varietal) => {
  const id = grapeConceptId(varietal);
  return id.startsWith("uva:") ? UVAS[id.slice(4)]?.rasgo || "" : "";
};

/**
 * Las tarjetas de uva entran a `CONCEPTS` como cualquier otro concepto, así que
 * `ConceptTerm` y `ConceptSheet` no se enteran de que existe esta familia: para
 * ellos es un id más.
 *
 * El renglón "en tu bodega" sale de la región de TU botella cruzada con las
 * zonas que de verdad le cambian el carácter a esa uva. Sin región no hay
 * renglón: preferimos la tarjeta más corta antes que una frase de relleno.
 */
Object.entries(UVAS).forEach(([clave, uva]) => {
  CONCEPTS[`uva:${clave}`] = {
    title: uva.title,
    body: uva.body,
    copa: uva.copa,
    anchor: ({ wine }) => {
      const region = String(wine?.region || "").trim();
      if (!region) return null;
      const zona = (uva.donde || []).find(([patron]) => patron.test(region));
      return zona ? `El tuyo viene de ${region}, ${zona[1]}.` : `El tuyo viene de ${region}.`;
    },
  };
});

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
