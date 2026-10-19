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
      "Malbec: en Francia daba vinos duros y rústicos; acá la altura le dio fruta y taninos redondos, y por eso es nuestro. No es una uva, son muchas — un Malbec de Uco a 1.200 metros y uno de Luján a 900 no se parecen en nada. Cabernet Sauvignon: más firme y herbal, ese dejo a pimiento verde que aparece cuando la uva no terminó de madurar (en su punto es grafito y tabaco).",
      "Bonarda: la segunda más plantada y la más subestimada, jugosa y sin pretensiones; si te cansaste de la madera, empezá por acá. Syrah: especiado y oscuro, y en San Juan da algo que no da en ningún otro lado. Torrontés: floral en la nariz y seco en la boca — engaña a todo el mundo, porque huele dulce y no lo es. Y Criolla y Cereza, que son la mitad del viñedo argentino y casi nunca ves en una etiqueta: van al vino de mesa.",
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
      "En Francia daba vinos duros, delgados y con un dejo áspero: en Cahors la usaban casi por obligación. Acá la altura le dio lo que allá no tenía —sol de sobra para madurar la piel y noches frías para no perder la acidez— y el resultado es otra uva: fruta negra madura, violetas, taninos redondos y un final que no raspa. Por eso es nuestra, y no por decreto.",
      "No es una sola cosa. Un Malbec de Uco a 1.200 metros es tenso, floral y con filo; uno de Luján de Cuyo a 900 es más carnoso y redondo; uno del este de Mendoza es simple y jugoso, para tomar sin pensar. Va con todo lo que salga de una parrilla, y con la carne al horno mejor todavía.",
    ],
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
      "La uva más plantada del mundo, y la más reconocible: piel gruesa, grano chico, mucho color y mucho tanino. En la copa es firme y vertical —cassis, grafito, tabaco, cedro— con un dejo herbal que la delata siempre. Si ese dejo aparece como pimiento verde, la uva no terminó de madurar; en su punto es hoja de tabaco y menta, y ahí no molesta: ordena.",
      "Es la que mejor envejece de las tintas argentinas y la que más pide tiempo: joven puede parecer dura y cerrada, y a los cinco o seis años recién se suelta. Pide grasa y proteína —un bife de chorizo, un cordero— porque el tanino necesita algo que morder.",
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
      "Es el padre del Cabernet Sauvignon —salió de un cruce espontáneo con Sauvignon Blanc en Burdeos— y no se parece a su hijo: madura antes, tiene menos tanino y muchísimo más perfume. Frambuesa, grafito, tinta, y esa nota verde inconfundible que en su punto es pimiento asado, hoja de tabaco o menta, y no el pimiento crudo del Cabernet inmaduro. En boca es de cuerpo medio, filoso, con acidez alta y un final más largo de lo que su peso hace suponer.",
      "En Argentina venía de relleno en los cortes y en los últimos diez años se volvió la uva de moda entre bodegas serias: en Uco, a más de mil metros, da vinos frescos y aromáticos que muchos prefieren al Malbec del mismo viñedo. Pide platos con hierbas y verdura antes que grasa pura: cordero al romero, berenjenas, carnes con pimientos. Se toma un punto más fresco que un Cabernet Sauvignon —esos dos grados de menos le levantan el perfume.",
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
      "La tinta amable: piel más fina, tanino suave y fruta roja madura —ciruela, cereza negra— con un fondo que a veces va al chocolate. Es la que se le da a alguien que dice que el vino le resulta áspero, porque no tiene esquinas. Eso mismo le dio mala fama: muchísimo Merlot barato se hizo aguado y sin gracia, y la uva pagó por el rendimiento.",
      "Bien hecho es otra cosa: en Burdeos es la mayoría de los vinos más caros del mundo. En Argentina anda mejor donde hace frío —Uco alto, Patagonia—, que es donde conserva acidez en vez de volverse dulzón. Va con pastas con salsa de tomate, cerdo, quesos semiduros: comida sabrosa que no necesite un tanino que lo pelee.",
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
      "Oscura, especiada y carnosa: pimienta negra, aceituna, mora, cuero, y en las versiones más cálidas algo casi ahumado. Es de las pocas uvas donde el aroma a especia no viene de la barrica sino de la propia uva, y por eso un Syrah sin madera igual huele a pimienta.",
      "En San Juan —sobre todo en el Valle de Pedernal— da algo que no da en ningún otro lado del país: mineral, tenso, con el pimentón bien marcado. Es la uva del chorizo, de la carne especiada, del cordero con romero y de cualquier plato al que le hayas puesto pimienta en serio.",
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
      "La uva difícil: piel finita, se pudre con la lluvia, se cocina con el calor y no perdona un viñedo mal elegido. Cuando sale bien no se parece a ninguna otra tinta — color claro (no confundir con liviano de sabor), frutilla y cereza, un fondo terroso o a hongo, tanino bajo y acidez alta. Es la prueba de que cuerpo e intensidad son cosas distintas: pesa poco en la boca y aromáticamente llena la copa.",
      "Necesita frío, así que en Argentina vive en la Patagonia y en la punta alta de Uco. Se sirve más fresco que cualquier otro tinto —15 °C, incluso 20 minutos de heladera— y es de los pocos que van con salmón, atún sellado, hongos o un pollo al horno.",
    ],
    donde: [
      [/patagonia|r[íi]o negro|neuqu[ée]n|chubut|trevelin/i, "la Patagonia es donde el Pinot argentino tiene sentido: frío, viento y ciclo largo"],
      [/uco|gualtallary|tupungato|altamira/i, "en la parte más alta de Uco el Pinot funciona; abajo, el calor se lo come"],
    ],
  },

  bonarda: {
    title: "Bonarda",
    rasgo: "fruta jugosa y directa, sin una astilla de madera",
    body: [
      "La segunda uva más plantada del país y la más subestimada de todas. Es jugosa, de fruta negra y roja bien directa, tanino bajo y acidez viva: entra sola, sin ceremonia y sin madera que la disfrace. Durante décadas fue a parar al vino de mesa en damajuana, y por eso todavía carga fama de barata.",
      "Si te cansaste del roble y de los tintos que hay que masticar, empezá por acá. Anda mejor en el este de Mendoza y en San Juan, con viñedos viejos que ya nadie replanta. Va con milanesas, empanadas, pizza, fiambres — la comida de todos los días, que es justamente donde más se agradece un tinto que no exija nada.",
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
      "El nombre lo dice: es la uva con más tanino del mundo occidental. Viene del sudoeste francés, se hizo famosa en Uruguay y en Argentina aparece sobre todo en Salta y en cortes. Color casi opaco, fruta negra, tanino que te seca la lengua entera y una capacidad de guarda enorme.",
      "Joven puede ser directamente incómoda; con años, o con la mano de un enólogo que la trabaje suave, se vuelve profunda y sedosa. Es la uva que más pide comida: sin un asado adelante, un Tannat de verdad no se disfruta.",
    ],
  },

  "petit verdot": {
    title: "Petit Verdot",
    rasgo: "violetas, tinta y estructura de sobra",
    body: [
      "En Burdeos es un condimento: madura tarde, muchas añadas no llega, y se usa en dosis chicas para dar color y tanino a un corte. En Mendoza el sol le sobra, así que acá sí llega — y por eso hay Petit Verdot solos, que allá casi no existen.",
      "Es intensa y oscura: violeta, fruta negra muy madura, especias, tanino firme. No es una uva para tomar en cantidad ni sola: brilla al lado de un plato contundente o adentro de un corte, donde pone la columna vertebral sin llevarse el protagonismo.",
    ],
  },

  tempranillo: {
    title: "Tempranillo",
    rasgo: "cuero, tabaco y roble americano",
    body: [
      "La uva de Rioja, y una de las primeras que se plantó en serio en Mendoza — mucho antes de que el Malbec fuera el Malbec. Madura temprano (de ahí el nombre), da fruta roja, cuero y tabaco, tanino de término medio y una afinidad enorme con el roble americano, que le pone el coco y la vainilla del estilo español clásico.",
      "En Argentina quedó relegada y sobrevive en viñedos viejos que dan vinos serios y baratos, de los que casi nadie habla. Va con chorizo, cordero, jamón, guisos: comida española sin vueltas.",
    ],
  },

  sangiovese: {
    title: "Sangiovese",
    rasgo: "cereza ácida, tomate seco y acidez de mesa italiana",
    body: [
      "La uva del Chianti, y en Argentina la trajeron los inmigrantes italianos antes que cualquier moda. Cereza ácida, tomate seco, hierbas, un tanino áspero y una acidez muy alta: sola puede parecer flaca, y con comida se explica sola.",
      "Está hecha para la mesa italiana: salsa de tomate, pizza, provoleta, cualquier cosa con orégano. Es de las pocas uvas que mejora con un plato ácido, porque su propia acidez lo acompaña en vez de pelearlo.",
    ],
  },

  criolla: {
    title: "Criolla",
    rasgo: "color pálido y liviandad de otra época",
    body: [
      "Criolla Chica, Criolla Grande y Cereza son las uvas que trajeron los españoles en el siglo XVI y de las que salió el vino argentino durante cuatrocientos años. Todavía son cerca de un tercio del viñedo del país, y casi nunca las ves en una etiqueta: van al vino de mesa y al mosto.",
      "En los últimos años un puñado de bodegas empezó a tomarlas en serio, sobre todo la Criolla Chica de viñedos viejos: color pálido, fruta roja, tanino casi nulo, muy poca graduación. Son vinos livianos, para tomar fríos y sin ninguna solemnidad — y son lo más parecido a un vino histórico argentino que se puede comprar hoy.",
    ],
  },

  chardonnay: {
    title: "Chardonnay",
    rasgo: "cítrico o manteca, según cuánta barrica haya visto",
    body: [
      "El camaleón: por sí sola es una uva neutra, y lo que tomás es en gran medida lo que le hizo la bodega. Sin madera y en frío es cítrica, tensa y mineral. Fermentada en barrica y con la lía trabajada se vuelve untuosa, con manteca, avellana y pan tostado. Las dos son Chardonnay, y quien dice que no le gusta el Chardonnay casi siempre está pensando en la segunda.",
      "En Argentina la mejor viene de arriba —Gualtallary, Tupungato, la Patagonia—, donde la noche fría le deja la acidez. Va con pollo, cerdo, pescados con salsa, quesos cremosos y, si tiene madera, con una pastas al fungi.",
    ],
    donde: [
      [/uco|gualtallary|tupungato|altamira/i, "la altura de Uco es lo que le deja la acidez y evita el Chardonnay pesado"],
      [/patagonia|r[íi]o negro|neuqu[ée]n|chubut/i, "en la Patagonia sale filoso y cítrico, casi tenso"],
    ],
  },

  "sauvignon blanc": {
    title: "Sauvignon Blanc",
    rasgo: "pomelo y pasto recién cortado",
    body: [
      "El blanco que se reconoce con la nariz a un metro de la copa: pomelo, maracuyá, pasto recién cortado, a veces algo que recuerda a la ruda. Nunca lleva madera y no la necesita — todo su atractivo es la frescura, y por eso conviene tomarlo joven y bien frío.",
      "Es un cuchillo contra la grasa: va con provoleta, empanadas fritas, mariscos, ceviche, ensaladas con queso de cabra y todo lo que lleve limón. En Argentina lo mejor sale de Uco alto y de la Patagonia; en zonas cálidas pierde el filo y se vuelve dulzón.",
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
      "La única uva verdaderamente argentina: un cruce criollo entre Moscatel de Alejandría y Criolla Chica que no existe en ningún otro lado. Engaña a todo el mundo, porque huele dulce —jazmín, azahar, durazno, rosa— y en la boca es seco, con acidez alta y un final levemente amargo, casi como una cáscara de cítrico.",
      "Cafayate, a 1.700 metros, es su lugar: el sol de Salta le da el perfume y la noche fría le deja la acidez. Se toma bien frío y joven, y va con comida picante o especiada —tailandesa, peruana, ceviche, empanadas salteñas— porque el perfume aguanta el picante donde otro blanco se rendiría.",
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
      "Fue el blanco más plantado de la Argentina antes de que el Chardonnay se llevara todo, y hoy sobrevive en viñedos viejos de Mendoza y de la Patagonia que están dando algunos de los vinos más interesantes del país. Es cerosa, de cuerpo medio, con nota de manzana, cera de abeja y algo de hierba; la acidez no salta pero sostiene.",
      "Envejece de una manera rarísima para un blanco: a los cinco o diez años se vuelve más complejo, no menos. Va con pescado de mar, cerdo, pollo con hierbas y quesos de cabra curados.",
    ],
  },

  viognier: {
    title: "Viognier",
    rasgo: "damasco, madreselva y una textura casi grasa",
    body: [
      "Un blanco de perfume enorme y acidez baja: damasco, durazno blanco, madreselva, a veces algo de jengibre. Se siente untuoso, casi graso en la boca, y por eso muchas veces se lo confunde con un vino dulce cuando es seco.",
      "Justamente por la acidez baja pide beberse joven y bien frío, y anda mejor donde hace frío de noche. Va con curry suave, cerdo con frutas, calabaza y quesos untuosos.",
    ],
  },

  "chenin blanc": {
    title: "Chenin Blanc",
    rasgo: "manzana verde y acidez de cuchillo",
    body: [
      "La uva más versátil que existe: en el Loira hace desde espumantes hasta dulces de guardar cincuenta años. Su marca es la acidez —altísima— con nota de manzana verde, membrillo, miel y un fondo de lana mojada que suena raro y funciona.",
      "En Argentina hay Chenin viejo en el este de Mendoza y en San Juan, plantado cuando nadie sabía lo que tenía, y de ahí salen blancos secos, tensos y muy baratos para lo que dan. Va con pescado, pollo, cerdo agridulce y quesos de cabra.",
    ],
  },

  "pinot grigio": {
    title: "Pinot Grigio",
    rasgo: "cítrico liviano, de aperitivo y sin ceremonia",
    body: [
      "Es la misma uva que el Pinot Gris, con dos estilos detrás del nombre: el italiano (Grigio) es liviano, cítrico y neutro, hecho para tomar sin pensar; el alsaciano (Gris) es más gordo, especiado y con nota de pera y jengibre.",
      "Lo que llega a la mesa argentina suele ser el primero: un blanco fácil, de aperitivo, para tomar muy frío con picadas, sushi o pescado a la plancha. No pide guarda ni ceremonia.",
    ],
  },

  riesling: {
    title: "Riesling",
    rasgo: "lima, flores blancas y una acidez que dura décadas",
    body: [
      "Para mucha gente que sabe, la mejor uva blanca del mundo, y la peor vendida: arrastra fama de dulce por unas botellas alemanas baratas de los años ochenta, cuando la enorme mayoría de los Riesling es seca. Lima, manzana verde, flores blancas y una acidez filosa que lo mantiene vivo décadas.",
      "En Argentina es rarísimo y sale casi todo de la Patagonia. Va con comida asiática, cerdo, pescado y todo lo que tenga un toque agridulce o picante.",
    ],
  },

  moscatel: {
    title: "Moscatel",
    rasgo: "uva fresca y azahar, tal cual salen de la parra",
    body: [
      "Una de las pocas uvas cuyo vino huele igual que la uva comida de la mano: uva fresca, azahar, cáscara de naranja. Es la familia más antigua que se conoce en viticultura y la madre de nuestro Torrontés.",
      "Aparece sobre todo en espumantes dulces y en vinos de postre. Se toma muy frío, en copa chica, con fruta, tartas o un flan — y es el vino que más gente odia por prejuicio y termina disfrutando.",
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
