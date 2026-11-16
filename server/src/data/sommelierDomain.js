/**
 * ── EL PORTERO DEL SOMMELIER ────────────────────────────────────────────────
 *
 * Decide, sin salir del servidor y sin gastar un token, si una pregunta
 * pertenece al mundo del vino y la comida. Es la primera de las medidas de
 * costo, y la única que puede reducir el gasto a CERO: una pregunta que no es
 * del dominio no llega al modelo, se contesta acá con una línea que reencauza.
 *
 * ── POR QUÉ ES UNA LISTA DE LO QUE SÍ, Y NO DE LO QUE NO ────────────────────
 * Lo de afuera del dominio es infinito y lo de adentro es enumerable. Filtrar
 * por lista negra ("no hablar de política, ni de código, ni de…") es una
 * carrera que se pierde siempre: alcanza con una pregunta que nadie anticipó
 * para que el guardián se convierta en un asistente general con la cuenta de
 * otro. Filtrar por lista blanca falla del lado correcto: en la duda, no
 * llama.
 *
 * El costo de esa elección es el falso negativo —una pregunta legítima que no
 * usa ninguna palabra de la lista— y se paga en dos lugares:
 *
 *   1. La lista es amplia y cubre uvas, regiones, comidas, ocasiones y el
 *      vocabulario de cata, que es de lo que la gente habla de verdad.
 *   2. Adentro de una conversación ya empezada, una pregunta corta pasa igual:
 *      "¿y para hoy a la noche?" no tiene ninguna palabra de vino, pero es
 *      obviamente sobre lo que se venía hablando.
 *
 * ── POR QUÉ HAY UNA LISTA NEGRA IGUAL ───────────────────────────────────────
 * Es chica y no filtra temas: frena los intentos de usar la guía como otra
 * cosa colándole una palabra del dominio ("escribime un script en Python para
 * ordenar vinos"). Gana sobre la lista blanca justamente porque el patrón es
 * "palabra de otro dominio + palabra de éste".
 */

const { fold } = require("./argentineWines");

/** Las palabras que hacen que una pregunta sea de esta app. */
const DEL_DOMINIO = [
  // El objeto
  "vino", "vinos", "botella", "botellas", "copa", "copas", "bodega", "bodegas",
  "cava", "etiqueta", "cosecha", "aniada", "anada", "vendimia", "varietal",
  "uva", "uvas", "cepa", "blend", "corte", "espumante", "champagne", "champan",
  "tinto", "tintos", "blanco", "blancos", "rosado", "rosados", "burbujas",
  "descorchar", "descorche", "corcho", "decantar", "decantador", "sommelier",
  "enologia", "enologo", "vinoteca", "vitivinicola", "terroir", "guarda",
  "crianza", "barrica", "roble", "reserva", "espumoso", "sidra", "vermut",
  "aperitivo", "digestivo", "licor", "oporto", "jerez",

  // Las uvas
  "malbec", "cabernet", "sauvignon", "merlot", "syrah", "shiraz", "bonarda",
  "tannat", "pinot", "noir", "chardonnay", "torrontes", "semillon", "viognier",
  "chenin", "sangiovese", "tempranillo", "garnacha", "grenache", "petit",
  "verdot", "malvasia", "moscato", "riesling", "gewurztraminer", "albarino",
  "grigio", "gris", "criolla", "cereza", "barbera", "nebbiolo", "carmenere",
  "franc", "trousseau", "marsanne",

  // De dónde vienen
  "mendoza", "uco", "lujan", "maipu", "salta", "cafayate", "calchaqui",
  "patagonia", "neuquen", "rio negro", "san juan", "catamarca", "rioja",
  "tupungato", "altamira", "gualtallary", "vistalba", "agrelo", "chacayes",
  "region", "regiones", "altura", "viniedo", "vinedo", "finca",

  // Con qué se toma
  "comer", "comida", "comidas", "plato", "platos", "maridaje", "maridar",
  "acompanar", "acompana", "cena", "cenar", "almuerzo", "almorzar", "asado",
  "carne", "carnes", "bife", "vacio", "cordero", "cerdo", "pollo", "pescado",
  "salmon", "mariscos", "sushi", "pasta", "pastas", "fideos", "ravioles",
  "noquis", "pizza", "empanada", "empanadas", "milanesa", "milanesas",
  "picada", "queso", "quesos", "ensalada", "verdura", "verduras", "risotto",
  "guiso", "locro", "postre", "postres", "chocolate", "parrilla", "hamburguesa",
  "tarta", "sopa", "curry", "picante", "ceviche", "provoleta", "achuras",
  "matambre", "lechon", "pavo", "paella", "tacos", "ramen", "wok", "arroz",

  // Cómo se habla de él
  "sabor", "sabe", "aroma", "aromas", "nariz", "boca", "taninos", "tanino",
  "acidez", "cuerpo", "dulce", "seco", "frutado", "fresco", "estructura",
  "final", "untuoso", "astringente", "servir", "temperatura", "airear",
  "puntaje", "puntuacion", "cata", "catar", "probar", "tomar", "abrir",
  "recomendas", "recomienda", "recomendacion", "recomendame", "sugerencia",
  "diferencia", "estilo", "estilos", "precio", "barato", "caro", "relacion",

  // Cuándo
  "regalo", "regalar", "festejo", "cumpleanos", "brindis", "brindar",
  "aniversario", "reunion", "juntada", "previa", "navidad", "fin de ano",

  // Con qué clima: la pantalla ofrece "¿Qué tomo con este clima?" como chip
  // de entrada, y sin estas palabras el portero la rechazaba — "clima" no
  // nombra nada de vino a propósito, así que necesita su propia entrada.
  "clima", "calor", "frio", "verano", "invierno",
];

/**
 * Lo que no se contesta ni aunque venga con la palabra "vino" al lado. Es
 * corta a propósito: no está para cubrir temas, está para cortar el uso de la
 * guía como asistente general.
 */
const DE_OTRO_MUNDO = [
  "javascript", "python", "typescript", "codigo", "programar", "programa",
  "funcion", "script", "sql", "html", "css", "algoritmo", "compilar",
  "bitcoin", "cripto", "acciones", "inversion", "prestamo", "hipoteca",
  "presidente", "eleccion", "elecciones", "politica", "partido politico",
  "medicamento", "sintoma", "diagnostico", "enfermedad", "dosis", "dolor",
  "remedio", "pastilla", "farmacia", "analgesico",
  "tarea del colegio", "ensayo", "monografia", "traduci", "traducime",
  "curriculum", "cv", "mail", "correo", "carta de presentacion",
  "ignora tus instrucciones", "olvida tus instrucciones", "system prompt",
  "actua como", "sos un modelo", "sos chatgpt", "sos gemini",
];

/**
 * Las que además dicen "mirá LO QUE YO TENGO". Sirven para decidir si vale la
 * pena mandarle al modelo el resumen de la bodega —que cuesta tokens y hace la
 * respuesta impersonal para todos los demás, o sea que la saca del caché.
 *
 * Son FRASES y no palabras sueltas. Estuvo un rato con "tengo" a secas y era
 * demasiado ancho: "tengo dolor de cabeza, ¿qué tomo?" caía adentro. Y no hace
 * falta, porque una pregunta legítima que empiece con "tengo" nombra el vino
 * ("tengo un Malbec, ¿con qué va?") y ésa la agarra la lista de arriba.
 */
const HABLA_DE_TU_BODEGA = [
  "mi bodega", "mis vinos", "mi cava", "mi coleccion", "mi stock",
  "que tengo", "lo que tengo", "tengo en casa", "me queda", "me quedan",
  "cual abro", "que abro", "cual tomo", "cual descorcho", "que descorcho",
  "de los mios", "mis botellas", "mi lista", "quiero probar",
  // Preguntar por lo YA tomado es la misma bodega, mirando para atrás: sin
  // esto, "¿algo puntual que ya tomé?" no traía "YA TOMÓ" al prompt (ninguna
  // frase de arriba la cubre) y el modelo, sin datos y sin nada que se lo
  // impida, terminaba inventando una etiqueta real como si la hubiera
  // probado — reproducido en vivo: preguntó por algo puntual ya tomado y
  // contestó con un Malbec de alta gama que la persona nunca cargó. "que
  // tome"/"que probe" alcanzan solos por la tolerancia a palabras de sobra
  // del matcher de frases (ver GAP_ENTRE_PALABRAS): matchean "qué ya tomé",
  // "algo que ya probé", etc.
  "que tome", "que probe", "ya tome", "ya probe",
  // "mi" a secas, y no sólo las frases de arriba: "voy a abrir MI Cabernet
  // Franc esta noche" no trae ninguna de esas frases (nombra el vino, no la
  // bodega en general) y aun así es exactamente la misma pregunta — "¿qué
  // hago con lo que tengo?" — con el nombre puesto en vez de "lo que tengo".
  // Reproducido en vivo: sin esto, esa pregunta contestaba sin ver el stock
  // ni la cosecha real, y la receta que pedía después salía con el nombre
  // pelado, sin uva ni región. A diferencia de "tengo" (que se dejó afuera
  // a propósito más arriba, por "tengo dolor de cabeza"), "mi" no tiene un
  // uso frecuente fuera del dominio del vino adentro de una pregunta que ya
  // pasó el portero — el costo de sobrar es unos tokens de más, nunca una
  // respuesta peor.
  "mi",
];

/**
 * ── POR QUÉ SE COMPARA POR PALABRA Y NO POR SUBCADENA ───────────────────────
 *
 * Empezó con `texto.includes(palabra)` y tenía un agujero grande: "franc" —de
 * Cabernet Franc— está adentro de "Francia", así que "¿cuál es la capital de
 * Francia?" entraba al dominio del vino y salía a gastar una llamada. El mismo
 * problema lo tienen "gris", "cepa", "boca", "uva" y una docena más: son cortas
 * y viven adentro de palabras de cualquier otro tema.
 *
 * Entonces: las de una sola palabra se comparan como PALABRA ENTERA, con
 * tolerancia al plural —"malbecs", "espumantes"— sacándole la "s" final.
 *
 * ── Y POR QUÉ LAS FRASES TOLERAN PALABRAS ADENTRO ───────────────────────────
 * Eran `texto.includes(frase)`, comparación literal, y con "que tengo" —la
 * frase que reconoce "¿cuál abro hoy?" y compañía— tenía el mismo agujero que
 * ya se había cerrado para las sueltas: "¿QUÉ MALBEC TENGO?", el ejemplo que la
 * propia pantalla del sommelier sugiere tocar, no contiene "que tengo" como
 * subcadena porque el nombre de la uva se mete en el medio. Esa pregunta no
 * disparaba `hablaDeTuBodega`, así que la respuesta salía SIN la bodega —y
 * encima se guardaba en el caché genérico, para que le tocara a cualquiera que
 * escribiera lo mismo—. Lo mismo le pasaba a "cuál Cabernet abro" o "qué Malbec
 * tomo".
 *
 * Por eso una frase ahora matchea por SUBSECUENCIA: sus palabras, en orden,
 * pueden tener hasta `GAP` palabras ajenas intercaladas entre una y la
 * siguiente. Con `GAP` chico —dos— "que MALBEC tengo" entra y "que tomo un
 * vino más tarde y después me pregunto si tengo" no debería (hay de sobra más
 * de dos palabras entre "que" y "tengo" ahí), que es lo que evita que dos
 * puntas de una pregunta larga se toquen sin tener nada que ver.
 *
 * Sacar la "s" y no hacer prefijo es deliberado: con prefijos volvería
 * "francia".startsWith("franc") y el agujero entero con él.
 */
const GAP_ENTRE_PALABRAS = 2;

const contieneFrase = (palabras, frase) => {
  let desde = 0;
  for (const palabraFrase of frase) {
    let encontrada = -1;
    const tope = Math.min(palabras.length, desde + GAP_ENTRE_PALABRAS + 1);
    for (let i = desde; i < tope; i += 1) {
      if (palabras[i] === palabraFrase) {
        encontrada = i;
        break;
      }
    }
    if (encontrada === -1) return false;
    desde = encontrada + 1;
  }
  return true;
};

const armarMatcher = (lista) => {
  const sueltas = new Set(lista.filter((p) => !p.includes(" ")));
  const frases = lista.filter((p) => p.includes(" ")).map((f) => f.split(" "));

  return (texto) => {
    const palabras = texto.split(" ");
    for (const palabra of palabras) {
      if (sueltas.has(palabra)) return true;
      if (palabra.endsWith("s") && sueltas.has(palabra.slice(0, -1))) return true;
    }
    return frases.some((f) => contieneFrase(palabras, f));
  };
};

const esDeVino = armarMatcher(DEL_DOMINIO);
const esDeOtroMundo = armarMatcher(DE_OTRO_MUNDO);
const hablaDeTuBodega = armarMatcher(HABLA_DE_TU_BODEGA);

/**
 * Normaliza una pregunta para usarla como clave de caché.
 *
 * "¿Qué va con asado?", "que va con asado" y "Qué va con asado????" son la
 * misma pregunta y tienen que dar la misma clave, o el caché no ahorra nada:
 * cada persona pagaría su propia llamada por escribir distinto lo mismo.
 *
 * `fold` ya saca acentos y baja a minúsculas (es el mismo normalizador que usa
 * el catálogo, a propósito: dos formas de normalizar es la manera más segura de
 * que un día dejen de coincidir). Acá se le suma sacar la puntuación y colapsar
 * los espacios.
 */
const normalizarPregunta = (texto) =>
  fold(String(texto || ""))
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * ¿Contesto esto?
 *
 * @param {string} pregunta
 * @param {boolean} hayConversacion  Si ya se venía hablando. Habilita el
 *   repregunte corto ("¿y con pescado?"), que no trae palabras propias porque
 *   el tema lo puso el turno anterior.
 * @returns {boolean}
 */
const esDelDominio = (pregunta, hayConversacion = false) => {
  const texto = normalizarPregunta(pregunta);
  if (!texto) return false;
  if (esDeOtroMundo(texto)) return false;
  if (esDeVino(texto)) return true;
  // Preguntar por lo que tenés guardado ES preguntar por vino, aunque no
  // aparezca la palabra: "¿cuál abro hoy?" no nombra ninguna, y es de las
  // consultas más frecuentes que va a recibir esta pantalla.
  if (hablaDeTuBodega(texto)) return true;
  // Un repregunte adentro de una charla que ya es del dominio. El tope de largo
  // importa: sin él, cualquier pregunta sobre cualquier cosa entraría gratis con
  // sólo haber saludado antes.
  return hayConversacion && texto.length <= 60;
};

/** ¿Le mando el resumen de su bodega al modelo? */
const usaTuBodega = (pregunta) => hablaDeTuBodega(normalizarPregunta(pregunta));

/**
 * ── "¿QUÉ VINOS TENGO?": UNA LISTA, NO UNA REDACCIÓN ────────────────────────
 *
 * Se reportó así: con el stock en cero, la guía contestó "Tenés una selección
 * muy interesante, destacándose el Nicasia Vineyards, el Andeluna Altitud y
 * el PISPI" — nombres de "YA TOMÓ", presentados como si estuvieran en la
 * heladera. El prompt (ver sommelier.service.js) ya le dice al modelo que
 * para esta pregunta conteste SÓLO con "SU BODEGA", pero es una instrucción
 * y no una garantía: el mismo motivo por el que `atarPicks` filtra las
 * TARJETAS por stock en código y no confía en que el modelo elija bien.
 *
 * Para esta pregunta puntual no hace falta redactar nada — es una consulta a
 * una lista, y una lista no se equivoca. `esPreguntaDeInventario` la detecta
 * para que el controlador conteste directo contra `wines`, sin pasar por
 * Gemini: ni gasta cuota, ni puede llegar a decir algo que no es cierto.
 *
 * La distingue de una pregunta de RECOMENDACIÓN ("¿cuál abro?", "¿qué tomo
 * con el asado?") por dos cosas: tiene que nombrar "tengo" (o "queda(n)",
 * "stock", "inventario") pegado a "qué"/"cuánto", y no puede traer un verbo
 * de los que piden una sugerencia — si los tiene, la persona quiere que se
 * elija por ella, no que se le liste lo que ya sabe que tiene.
 */
const VERBOS_DE_RECOMENDACION = [
  "abro", "abrir", "abrimos", "tomo", "tomar", "tomamos", "descorcho",
  "descorchar", "acompano", "acompanar", "recomendas", "recomendar",
  "recomendame", "recomendacion", "conviene", "convendria", "elijo",
  "elegir", "eleccion", "sirve", "marida", "maridar", "combina", "combino",
];

const PATRONES_INVENTARIO = [
  // "qué (vinos|Malbec|...) tengo", con hasta dos palabras en el medio.
  /\bque\b(?:\s+\w+){0,2}\s+tengo\b/,
  // "cuántos/cuántas ... tengo / me queda(n) / quedan"
  /\bcuant[oa]s?\b(?:\s+\w+){0,2}\s+(tengo|me queda|me quedan|quedan)\b/,
  /\bque\s+me\s+(queda|quedan)\b/,
  /\bque\s+(tengo|hay)\s+en\s+(mi\s+)?(bodega|cava|casa)\b/,
  // "¿Tengo algún otro Malbec?", "¿Tengo más tintos?", "¿Tengo un Syrah?": arranca con «tengo» y pregunta por lo que hay AHORA.
  // Sin esto iba al modelo, que veía «YA TOMÓ» y contestaba con un vino que ya no está en stock.
  /^(tengo|me queda|me quedan)\b/,
  /\bhay\s+(algun|alguna|algunos|algunas|otro|otra|otros|otras|mas)\b.*\b(bodega|cava|stock)\b/,
  /\bmi\s+stock\b/,
  /\bmi\s+inventario\b/,
  /\bque\s+stock\s+tengo\b/,
];

const esPreguntaDeInventario = (pregunta) => {
  const texto = normalizarPregunta(pregunta);
  if (!texto) return false;
  if (VERBOS_DE_RECOMENDACION.some((v) => texto.includes(v))) return false;
  return PATRONES_INVENTARIO.some((re) => re.test(texto));
};

/**
 * Si la pregunta de inventario acota por uva o por tipo ("¿qué Malbec
 * tengo?", "¿qué tintos tengo?"), esto dice contra qué campo del vino
 * comparar. `null` cuando pregunta por todo.
 */
const UVAS = [
  "malbec", "cabernet", "sauvignon", "merlot", "syrah", "shiraz", "bonarda",
  "tannat", "chardonnay", "torrontes", "semillon", "viognier", "chenin",
  "sangiovese", "tempranillo", "garnacha", "grenache", "malvasia", "moscato",
  "riesling", "gewurztraminer", "albarino", "criolla", "barbera", "nebbiolo",
  "carmenere", "trousseau", "marsanne", "franc", "noir", "grigio",
];

const TIPOS_INVENTARIO = {
  tinto: "red", tintos: "red",
  blanco: "white", blancos: "white",
  rosado: "rosé", rosados: "rosé",
  espumante: "sparkling", espumantes: "sparkling", espumoso: "sparkling",
  champagne: "sparkling", champan: "sparkling",
};

const filtroDeInventario = (pregunta) => {
  const texto = normalizarPregunta(pregunta);
  for (const uva of UVAS) {
    if (texto.split(" ").includes(uva)) return { campo: "varietal", valor: uva };
  }
  for (const [palabra, tipo] of Object.entries(TIPOS_INVENTARIO)) {
    if (texto.split(" ").includes(palabra)) return { campo: "type", valor: tipo };
  }
  return null;
};

module.exports = {
  esDelDominio,
  usaTuBodega,
  esPreguntaDeInventario,
  filtroDeInventario,
  normalizarPregunta,
  DEL_DOMINIO,
  DE_OTRO_MUNDO,
};
