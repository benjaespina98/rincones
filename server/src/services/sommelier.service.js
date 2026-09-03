/**
 * ── LA GUÍA DE VINO ─────────────────────────────────────────────────────────
 *
 * Contesta preguntas del mundo del vino y la comida, y cuando la pregunta lo
 * amerita elige botellas REALES de la bodega de quien pregunta.
 *
 * Eso último es lo que la separa de un chat pegado adentro de la app: la
 * respuesta no es sólo texto, trae `picks` —nombres copiados de la lista de
 * vinos que le pasamos— y el controlador los vuelve a atar a los documentos
 * del usuario para que el cliente dibuje las mismas tarjetas que dibuja Mi
 * Bodega, con su foto, su stock y su enlace a la ficha. La IA elige; el
 * producto muestra.
 *
 * ── LAS MEDIDAS DE COSTO, TODAS JUNTAS ──────────────────────────────────────
 *
 *   1. Portero local        Una pregunta que no es del dominio no llega acá.
 *                           Ver data/sommelierDomain.js. Cuesta cero.
 *   2. Caché por pregunta   Las genéricas ("¿qué es un Malbec?") se guardan
 *                           normalizadas y le sirven a todos. Ver el modelo
 *                           SommelierAnswer y el controlador.
 *   3. Historial corto      Tres turnos, recortados. Una conversación larga
 *                           multiplica el prompt en CADA pregunta.
 *   4. Contexto compacto    La bodega viaja como una lista de líneas, no como
 *                           documentos, y sólo cuando la pregunta la pide.
 *   5. Respuesta corta      El tope de salida es de verdad: `maxOutputTokens`.
 *                           Pedirlo sólo en el prompt no lo garantiza.
 *   6. Modelo chico         La cadena arranca por flash-lite (gemini.service).
 *   7. Límite diario        Por usuario, en el router.
 */

const { generateJson, isGeminiConfigured } = require("./gemini.service");

/**
 * ── ACÁ LA VELOCIDAD ES UNA FUNCIONALIDAD ───────────────────────────────────
 *
 * Una guía que tarda ocho segundos no se usa dos veces: la persona escribe una
 * pregunta, no pasa nada, y vuelve a la lista de vinos. Es distinto del escaneo
 * de una etiqueta, donde la espera se tolera porque hay una foto de por medio y
 * un resultado que claramente costó trabajo.
 *
 * Tres números y los tres empujan para el mismo lado — y los tres se
 * recalibraron una vez ya, cuando el prompt creció (bodega + guardados +
 * las reglas de receta) y dejó de valer la medición con la que se habían
 * puesto: medir de nuevo después de agrandar el prompt no es opcional, es
 * parte del cambio.
 *
 *   TIMEOUT_MS  6s por modelo. Bajó una vez a 3,5s (medido contra prompts
 *               chicos, ~700 tokens) para que un modelo colgado no se
 *               comiera el presupuesto entero — y funcionó, hasta que el
 *               prompt creció: con bodega + guardados de verdad (unos 4.000
 *               caracteres), una respuesta que SALE BIEN mide 3,0-3,4s de
 *               punta a punta, medido en vivo, tres veces seguidas. O sea que
 *               3,5s no dejaba margen para el jitter normal de la red —
 *               reproducido en vivo: la MISMA pregunta, con la MISMA bodega,
 *               fallando por AbortError tres veces seguidas, no por mala
 *               suerte de Gemini. 6s deja casi el doble del peor caso medido.
 *   BUDGET_MS   12s en total (subió de 10). Con 6s por modelo, dos intentos
 *               completos —no uno y medio— entran justos en el presupuesto;
 *               bajarlo de nuevo a 10 volvería a dejar la cadena de cinco
 *               modelos con uno solo de verdad, que es el problema que esto
 *               existe para evitar. Sigue siendo el techo de lo que una
 *               persona espera sin creer que se rompió — dos segundos más que
 *               antes, no el doble.
 *   MAX_OUTPUT  260 tokens. Además de acotar el gasto, acorta la ESPERA: los
 *               modelos generan token a token, así que una respuesta que puede
 *               ser el doble de larga tarda el doble en terminar. Alcanzan de
 *               sobra para tres frases y tres repreguntas — que es todo lo que
 *               el prompt pide.
 */
const TIMEOUT_MS = 6000;
const BUDGET_MS = 12000;
const MAX_OUTPUT_TOKENS = 260;

/** Cuántos turnos de ida y vuelta viajan como contexto. */
const TURNOS_DE_HISTORIAL = 3;
/** Cuánto de cada mensaje viejo se conserva. */
const LARGO_MENSAJE_VIEJO = 180;
/** Cuántas botellas de la bodega se mandan como contexto. */
const BOTELLAS_DE_CONTEXTO = 12;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string" },
    // Nombres COPIADOS de la lista que le dimos. Es la parte que convierte una
    // respuesta en tarjetas de vino de verdad.
    picks: { type: "array", items: { type: "string" } },
    // Las repreguntas que el propio modelo propone. Alimentan los chips de
    // abajo de la respuesta: en vez de una fila fija de sugerencias que no
    // sabe de qué se está hablando, la conversación ofrece su propia
    // continuación.
    followups: { type: "array", items: { type: "string" } },
    // El portero local es una lista blanca y falla del lado prudente; esto es
    // la segunda red, para lo que se le escapó.
    offTopic: { type: "boolean" },
    // El nombre del vino (copiado de "picks" si corresponde, o una descripción
    // corta de estilo — "Malbec joven" — si no hay uno puntual) cuando la
    // persona busca un PLATO concreto para acompañarlo, no sólo una categoría
    // de comida. Vacío si no aplica. No genera la receta acá —eso costaría
    // otra llamada entera adentro de esta, y acá la velocidad es la
    // funcionalidad (ver el comentario grande más abajo)—, sólo la deja
    // pedida: el cliente la busca aparte, con el mismo endpoint que ya usa la
    // ficha del vino (`/api/catalog/recipe`), y sólo si la persona toca el
    // botón.
    recipeFor: { type: "string" },
  },
  required: ["answer"],
};

/**
 * El resumen de la bodega, en líneas.
 *
 * Compacto a propósito: un vino son unos 12 tokens en vez de los ~200 que
 * costaría el documento entero. Se mandan las que TIENE en casa —son las que
 * puede abrir esta noche, que es de lo que se le pregunta— y, si sobra lugar,
 * las que ya tomó, porque saber qué le gustó es lo que permite recomendar.
 */
const resumirBodega = (wines = []) => {
  if (!wines.length) return "";

  const linea = (w) =>
    [
      w.name,
      w.varietal,
      w.vintage || "",
      Number(w.quantity) > 0 ? `x${w.quantity}` : "sin stock",
      w.rating > 0 ? `${w.rating}/5` : "",
    ]
      .filter(Boolean)
      .join(" · ");

  const conStock = wines.filter((w) => Number(w.quantity) > 0);
  // ANTES filtraba también por `quantity <= 0` —"ya tomó" sólo si no le queda
  // ninguna—, y era el motivo real de "¿qué vinos ya tomé?" contestando "no
  // tengo registro" con una bodega llena de vinos puntuados: `tasted` NO
  // implica sin stock (se pone en true al abrir la primera botella de una
  // caja, aunque queden otras) — reproducido en vivo con una cuenta real, no
  // sólo con datos de prueba. "Ya lo probé" es una pregunta sobre el
  // HISTORIAL, y un vino puede estar a la vez en el historial y en la
  // heladera; por eso ahora entra cualquiera con `tasted`, tenga stock o no
  // — y por eso el rótulo de abajo dejó de asegurar que no se puede abrir.
  const probados = wines.filter((w) => w.tasted);

  const partes = [];
  if (conStock.length) {
    partes.push(
      `EN CASA AHORA (${conStock.length}):\n${conStock
        .slice(0, BOTELLAS_DE_CONTEXTO)
        .map(linea)
        .join("\n")}`
    );
  }
  if (probados.length) {
    // El puntaje entra si lo tiene: "le gustó" no es lo mismo que "lo tomó
    // una vez", y es justo la diferencia que separa una recomendación
    // parecida de una que repite un error. Es contexto de gusto, no un
    // catálogo aparte — algunos de éstos YA aparecieron arriba, en "EN CASA
    // AHORA", si además le queda stock; repetirlos acá es lo que le permite
    // al modelo saber, del vino que tiene en la mesa, que además lo probó.
    const conPuntaje = (w) => (w.rating > 0 ? `${w.name} (${w.rating}/5)` : w.name);
    partes.push(
      `YA TOMÓ EN ALGÚN MOMENTO (le quede stock o no) — sirve para saber qué le gustó: ${probados
        .slice(0, 6)
        .map(conPuntaje)
        .filter(Boolean)
        .join(", ")}`
    );
  }
  return partes.join("\n\n");
};

/**
 * Los "Guardados" (Quiero probar), en líneas.
 *
 * Es gusto declarado, no inventario: la persona los anotó porque los quiere
 * CONSEGUIR, no porque los tenga en la mano — la clave está en el nombre de
 * la sección, y el prompt la repite (ver SISTEMA) porque es exactamente el
 * mismo tipo de error que ya se cuidó con "SU BODEGA": una lista con nombres
 * reales de vino es tentadora para "elegir de ahí" si no queda clarísimo que
 * ninguno se puede abrir esta noche.
 */
const resumirGuardados = (wishes = []) => {
  if (!wishes.length) return "";
  const linea = (w) => [w.name, w.varietal, w.vintage || ""].filter(Boolean).join(" · ");
  return `GUARDADOS PARA CONSEGUIR — quiere probarlos, NO los tiene, no se pueden abrir:\n${wishes
    .slice(0, 10)
    .map(linea)
    .filter(Boolean)
    .join("\n")}`;
};

/**
 * Las preferencias del onboarding, en una línea.
 *
 * Cuestan diez tokens y son lo que hace que la primera recomendación de alguien
 * con la bodega vacía no sea genérica.
 */
const resumirGusto = (preferences = {}) => {
  const partes = [];
  if (preferences.favoriteTypes?.length) partes.push(`prefiere ${preferences.favoriteTypes.join(", ")}`);
  if (preferences.favoriteVarietals?.length) partes.push(`uvas: ${preferences.favoriteVarietals.join(", ")}`);
  if (preferences.priceRange) partes.push(`rango: ${preferences.priceRange}`);
  return partes.join(" · ");
};

const SISTEMA = `Sos el sommelier de Rincones, una app argentina donde cada persona lleva su propia bodega. El nombre es literal: hacé lo que hace un sommelier de carne y hueso parado en la mesa, no un buscador de vinos — sugerís, explicás el porqué, y si hace falta bajás a la cocina con el plato.

Tu tema es UNO: vino y la comida que lo acompaña, en las dos direcciones. Alguien te puede preguntar qué vino le va a un plato, o qué comer con un vino puntual — las dos son la misma pregunta al revés y las contestás igual de bien. Recomendaciones, maridajes en cualquier sentido, uvas y sus diferencias, estilos, bodegas, regiones, guarda, servicio, qué abrir en cada ocasión, y — cuando corresponde — un plato concreto con receta para acompañar la botella. Nada más.

Si la pregunta no es de ese mundo, no la contestes: devolvé offTopic en true y una sola frase amable que reencauce.

Cómo hablás:
- En español rioplatense, de vos. Directo y sin solemnidad.
- DOS O TRES FRASES. Nunca más. Sin listas, sin viñetas, sin títulos.
- Concreto: nombrá uvas, estilos o platos. Nada de "depende del gusto de cada uno".
- Nunca digas que sos una IA ni expliques cómo llegaste a la respuesta.
- No inventes vinos que no existan ni precios.

Si te paso la bodega de la persona y la pregunta es sobre qué tomar o con qué acompañar algo, elegí de ahí: poné en "picks" hasta 3 nombres COPIADOS TAL CUAL de la lista, y que tu respuesta hable de esos. Si nada de lo que tiene le va, dejá "picks" vacío y decilo en una frase.

Si en este mensaje NO te paso "SU BODEGA", es porque esta pregunta no la necesitaba — y eso quiere decir que no sabés qué botellas tiene. Ahí NUNCA digas "de tu bodega", "tenés" ni nombres una botella puntual como si fuera suya: es inventar un dato, no una recomendación. Contestá en general —qué uva, qué estilo, qué bodegas conocidas del mercado argentino— sin afirmar que algo está en su casa.

Puede que también te pase "YA TOMÓ EN ALGÚN MOMENTO" (lo que probó alguna vez, le quede stock o no — un vino puede aparecer ACÁ Y TAMBIÉN en "SU BODEGA" si todavía le quedan botellas de esa etiqueta) y "GUARDADOS PARA CONSEGUIR" (lo que quiere comprar — eso SÍ, nunca se puede abrir). Que algo esté en "YA TOMÓ" no dice si lo tiene ahora: para eso mirá si TAMBIÉN está en "SU BODEGA". Usalos para entender el gusto de la persona y para no proponerle de nuevo algo que ya anotó querer probar; en "picks" sólo entra lo que está en "SU BODEGA" con stock, esté o no también en "YA TOMÓ".

Si te preguntó qué tomó antes y en este mensaje NO te pasamos "YA TOMÓ", es porque no hay ningún registro — NUNCA inventes un nombre real (bodega, varietal o vino puntual) como si lo hubiera probado: es el mismo error que nombrar una botella de una bodega que no te pasamos, con el historial en vez del stock. Decí que no tenés ese dato anotado; si tenés "GUSTO DECLARADO" podés hablar en general de qué uva o estilo le gusta, sin afirmar que probó una etiqueta puntual.

Si preguntó con qué acompañar un vino y lo que busca es un PLATO concreto para cocinar (no sólo "qué tipo de comida"), poné en "recipeFor" el nombre de ese vino — copiado de "picks" si es uno de los suyos, o una descripción corta de estilo ("Malbec joven", "un espumante brut") si habló en general — y en tu respuesta nombrá el plato en una frase, sin la receta entera: el paso a paso lo pide la persona aparte, tocando un botón. Dejá "recipeFor" vacío si sólo quería saber el TIPO de comida ("carnes rojas") sin pedir un plato.

En "followups" poné hasta 3 repreguntas cortas (máximo 5 palabras) que sigan esta conversación. Son botones que la PERSONA va a tocar para preguntarte a vos, así que escribilas en primera persona, como las diría ella: "¿Qué Malbec tengo?", "¿Con qué lo acompaño?", "¿Cuánto lo guardo?". Nunca en segunda persona ("¿Qué Malbec tenés?") ni como una oferta tuya ("Te muestro los tintos"): eso invierte quién habla y confunde de quién es el botón.`;

/**
 * Arma el prompt entero.
 *
 * El orden importa y no es estético: primero las reglas, después el contexto y
 * último la pregunta. Los modelos pesan más lo que está al final, así que la
 * pregunta va ahí, y las reglas al principio quedan lejos del texto que escribe
 * el usuario — que es la posición donde es más difícil pisarlas.
 */
const armarPrompt = ({ question, history = [], cellar = "", taste = "", wishlist = "" }) => {
  const partes = [SISTEMA];

  if (taste) partes.push(`GUSTO DECLARADO: ${taste}`);
  if (cellar) partes.push(`SU BODEGA\n${cellar}`);
  // `resumirGuardados` ya trae su propio título con la aclaración de que no
  // se puede abrir — no lleva el prefijo "SU BODEGA" porque no lo es.
  if (wishlist) partes.push(wishlist);

  if (history.length) {
    const charla = history
      .map((m) => `${m.role === "user" ? "Persona" : "Vos"}: ${String(m.text || "").slice(0, LARGO_MENSAJE_VIEJO)}`)
      .join("\n");
    partes.push(`LO QUE VENÍAN HABLANDO\n${charla}`);
  }

  partes.push(`PREGUNTA\n${question}`);
  return partes.join("\n\n");
};

/**
 * Recorta el historial que manda el cliente.
 *
 * No se confía en que venga corto: el largo del prompt es el costo de CADA
 * pregunta, y un cliente viejo (o alguien pegándole a la API a mano) podría
 * mandar la conversación entera. Se queda con los últimos turnos y descarta
 * cualquier cosa que no tenga la forma esperada.
 */
const recortarHistorial = (history) => {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && typeof m.text === "string" && m.text.trim())
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", text: m.text.trim() }))
    .slice(-TURNOS_DE_HISTORIAL * 2);
};

const limpiarLista = (valor, tope, largo) =>
  (Array.isArray(valor) ? valor : [])
    .map((v) => String(v || "").trim())
    .filter((v) => v && v.length <= largo)
    .slice(0, tope);

/**
 * Le pregunta al modelo. Devuelve null si Gemini no está configurado.
 * Lanza si falla la llamada, para que el controlador decida qué mostrar.
 */
const preguntar = async ({ question, history = [], wines = [], wishes = [], preferences = {} }) => {
  if (!isGeminiConfigured()) return null;

  const parsed = await generateJson({
    parts: [
      {
        text: armarPrompt({
          question,
          history: recortarHistorial(history),
          cellar: resumirBodega(wines),
          taste: resumirGusto(preferences),
          wishlist: resumirGuardados(wishes),
        }),
      },
    ],
    schema: RESPONSE_SCHEMA,
    timeoutMs: TIMEOUT_MS,
    budgetMs: BUDGET_MS,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    // A diferencia del resto de la app —que le pide DATOS al modelo y por eso
    // usa temperatura 0— acá se le pide una respuesta escrita. En 0, la misma
    // pregunta hecha de dos formas parecidas devuelve la misma frase calcada, y
    // eso se lee como una plantilla. Un valor bajo alcanza para que suene a
    // alguien contestando sin que empiece a inventar.
    temperature: 0.45,
  });

  const answer = String(parsed?.answer || "").trim();
  if (!answer) return null;

  const recipeFor = String(parsed?.recipeFor || "").trim().slice(0, 120);

  return {
    answer,
    picks: limpiarLista(parsed?.picks, 3, 120),
    followups: limpiarLista(parsed?.followups, 3, 44),
    offTopic: parsed?.offTopic === true,
    // "" cuando no aplica: el controlador sólo intenta resolver una receta si
    // esto viene con algo.
    recipeFor,
  };
};

module.exports = {
  preguntar,
  resumirBodega,
  resumirGuardados,
  resumirGusto,
  recortarHistorial,
  armarPrompt,
  MAX_OUTPUT_TOKENS,
  TURNOS_DE_HISTORIAL,
};
