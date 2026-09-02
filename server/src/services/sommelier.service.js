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
 * Tres números y los tres empujan para el mismo lado:
 *
 *   TIMEOUT_MS  6,5s por modelo. La cadena arranca por gemini-3.1-flash-lite,
 *               medido en 766 ms (ver gemini.service.js): si a los seis segundos
 *               y medio no contestó, no está lento, está colgado, y esperarlo
 *               nueve sólo retrasa el intento con el siguiente.
 *   BUDGET_MS   10s en total. Es el techo de lo que una persona espera mirando
 *               una pantalla sin creer que se rompió. Antes se podían encadenar
 *               dos timeouts y llegar a dieciocho.
 *   MAX_OUTPUT  260 tokens. Además de acotar el gasto, acorta la ESPERA: los
 *               modelos generan token a token, así que una respuesta que puede
 *               ser el doble de larga tarda el doble en terminar. Alcanzan de
 *               sobra para tres frases y tres repreguntas — que es todo lo que
 *               el prompt pide.
 */
const TIMEOUT_MS = 6500;
const BUDGET_MS = 10000;
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
  const probados = wines.filter((w) => Number(w.quantity) <= 0 && w.tasted);

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
    // Sólo cuatro y sólo el nombre: es contexto de gusto, no un catálogo.
    partes.push(
      `YA TOMÓ: ${probados
        .slice(0, 4)
        .map((w) => w.name)
        .filter(Boolean)
        .join(", ")}`
    );
  }
  return partes.join("\n\n");
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

const SISTEMA = `Sos la guía de vino de Rincones, una app argentina donde cada persona lleva su propia bodega.

Tu tema es UNO: vino y la comida que lo acompaña. Recomendaciones, maridajes, uvas y sus diferencias, estilos, bodegas, regiones, guarda, servicio, qué abrir en cada ocasión. Nada más.

Si la pregunta no es de ese mundo, no la contestes: devolvé offTopic en true y una sola frase amable que reencauce.

Cómo hablás:
- En español rioplatense, de vos. Directo y sin solemnidad.
- DOS O TRES FRASES. Nunca más. Sin listas, sin viñetas, sin títulos.
- Concreto: nombrá uvas, estilos o platos. Nada de "depende del gusto de cada uno".
- Nunca digas que sos una IA ni expliques cómo llegaste a la respuesta.
- No inventes vinos que no existan ni precios.

Si te paso la bodega de la persona y la pregunta es sobre qué tomar o con qué acompañar algo, elegí de ahí: poné en "picks" hasta 3 nombres COPIADOS TAL CUAL de la lista, y que tu respuesta hable de esos. Si nada de lo que tiene le va, dejá "picks" vacío y decilo en una frase.

Si en este mensaje NO te paso "SU BODEGA", es porque esta pregunta no la necesitaba — y eso quiere decir que no sabés qué botellas tiene. Ahí NUNCA digas "de tu bodega", "tenés" ni nombres una botella puntual como si fuera suya: es inventar un dato, no una recomendación. Contestá en general —qué uva, qué estilo, qué bodegas conocidas del mercado argentino— sin afirmar que algo está en su casa.

En "followups" poné hasta 3 repreguntas cortas (máximo 5 palabras) que sigan esta conversación. Son botones que la PERSONA va a tocar para preguntarte a vos, así que escribilas en primera persona, como las diría ella: "¿Qué Malbec tengo?", "¿Con qué lo acompaño?", "¿Cuánto lo guardo?". Nunca en segunda persona ("¿Qué Malbec tenés?") ni como una oferta tuya ("Te muestro los tintos"): eso invierte quién habla y confunde de quién es el botón.`;

/**
 * Arma el prompt entero.
 *
 * El orden importa y no es estético: primero las reglas, después el contexto y
 * último la pregunta. Los modelos pesan más lo que está al final, así que la
 * pregunta va ahí, y las reglas al principio quedan lejos del texto que escribe
 * el usuario — que es la posición donde es más difícil pisarlas.
 */
const armarPrompt = ({ question, history = [], cellar = "", taste = "" }) => {
  const partes = [SISTEMA];

  if (taste) partes.push(`GUSTO DECLARADO: ${taste}`);
  if (cellar) partes.push(`SU BODEGA\n${cellar}`);

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
const preguntar = async ({ question, history = [], wines = [], preferences = {} }) => {
  if (!isGeminiConfigured()) return null;

  const parsed = await generateJson({
    parts: [
      {
        text: armarPrompt({
          question,
          history: recortarHistorial(history),
          cellar: resumirBodega(wines),
          taste: resumirGusto(preferences),
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

  return {
    answer,
    picks: limpiarLista(parsed?.picks, 3, 120),
    followups: limpiarLista(parsed?.followups, 3, 44),
    offTopic: parsed?.offTopic === true,
  };
};

module.exports = {
  preguntar,
  resumirBodega,
  resumirGusto,
  recortarHistorial,
  armarPrompt,
  MAX_OUTPUT_TOKENS,
  TURNOS_DE_HISTORIAL,
};
