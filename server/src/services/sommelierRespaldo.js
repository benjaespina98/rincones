/**
 * Lo que el Sommelier contesta cuando el modelo no puede: nunca un "error".
 *
 * Si Gemini no tiene cuota, está caído o tardó demasiado, la persona igual se lleva algo útil. No es una
 * respuesta a medida —no puede serlo sin el modelo— pero es honesta, corta y accionable: algo de lo que ya
 * tiene en casa, o una uva que casi nunca falla para lo que preguntó. Todo local: cero llamadas, cero costo.
 *
 * También sirve para "fuera de tema": una frase amable y distinta cada vez, en vez de la misma de siempre.
 */

/** Un número estable a partir de un texto, para elegir una variante sin azar (misma pregunta, misma respuesta). */
const hashDe = (texto) => {
  let h = 17;
  for (let i = 0; i < texto.length; i += 1) h = (h * 31 + texto.charCodeAt(i)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return h >>> 0;
};

const elegir = (opciones, texto) => opciones[hashDe(String(texto || "")) % opciones.length];

const sinTildes = (t) =>
  String(t || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Qué uva o estilo suele andar bien con lo que preguntó, según palabras clave. Sin nada reconocible: un Malbec. */
const SUGERENCIAS = [
  { claves: ["asado", "parrilla", "carne", "bife", "costilla", "cordero", "chorizo", "milanesa"], sugerencia: "un Malbec o un Cabernet Sauvignon" },
  { claves: ["pescado", "marisco", "ceviche", "sushi", "ensalada", "camaron", "langostino", "salmon"], sugerencia: "un Sauvignon Blanc o un Chardonnay bien fresco" },
  { claves: ["pizza", "pasta", "fideos", "ravioles", "lasagna", "empanada"], sugerencia: "un Bonarda o un Sangiovese" },
  { claves: ["queso", "picada", "fiambre", "tabla"], sugerencia: "un Malbec joven o un espumante brut" },
  { claves: ["postre", "dulce", "chocolate", "helado", "torta"], sugerencia: "un espumante dulce o un cosecha tardía" },
  { claves: ["regalo", "regalar", "cumple", "aniversario"], sugerencia: "un Malbec de buena bodega, que queda bien siempre" },
  { claves: ["aperitivo", "brindis", "festejo", "celebrar"], sugerencia: "un espumante brut nature" },
];

const sugerenciaPara = (pregunta) => {
  const texto = sinTildes(pregunta);
  const hallada = SUGERENCIAS.find(({ claves }) => claves.some((c) => texto.includes(c)));
  return hallada?.sugerencia || "un Malbec de Mendoza, que va bien con casi todo";
};

const REPREGUNTAS = ["¿Qué abro hoy?", "¿Con qué lo acompaño?", "Malbec vs Cabernet"];

/**
 * ¿Pregunta cómo servirlo? Temperatura, aireado, decantado. Con palabras enteras: «reserva», «Buenos
 * Aires» o «¿qué me servís con asado?» no son preguntas de servicio.
 */
const PREGUNTA_DE_SERVICIO =
  /\b(temperatura|airear\w*|aireal[oa]|aireado|aireacion|aire[oa]|decant\w*|respir\w*|enfri\w*|servirl[oa]|servil[oa]|se sirve|(lo|la) (sirvo|servis|sirve))\b|\bcomo\b.{0,30}\b(tomarl[oa]|se toma|(lo|la) tomo)\b/;

/** Cómo servir según el tipo (mismas temperaturas que la tarjeta: client/src/utils/servicio.js). */
const SERVICIO_POR_TIPO = {
  red: "a 16-18 °C. Si es joven, abrilo unos 30 minutos antes para que respire",
  white: "bien fresco, a 8-10 °C, sin airear",
  "rosé": "fresco, a 8-10 °C, sin airear",
  sparkling: "bien frío, a 6-8 °C, sin agitarlo ni airearlo",
  fortified: "apenas fresco, a 12-14 °C, en copa chica",
};

/** El tipo guardado manda; la uva sólo decide si falta. Sin pistas no se afirma nada (`null`). */
const tipoDeContexto = (vino) => {
  const tipo = sinTildes(vino?.type);
  if (tipo === "rose") return "rosé";
  if (Object.hasOwn(SERVICIO_POR_TIPO, tipo)) return tipo;
  const uva = sinTildes(vino?.varietal);
  if (/espumant|brut|champ/.test(uva)) return "sparkling";
  if (/rosad|rose/.test(uva)) return "rosé";
  if (/oporto|jerez|generoso/.test(uva)) return "fortified";
  if (/blanc|chardonnay|torrontes|semillon|viognier|riesling|chenin|pinot gri/.test(uva)) return "white";
  if (/malbec|cabernet|merlot|syrah|bonarda|tannat|pinot noir|tempranillo|sangiovese|petit verdot/.test(uva)) return "red";
  return null;
};

/** Uvas y estilos que, si aparecen en la pregunta, dicen de qué vino se está preguntando. */
const OTROS_VINOS = /\b(malbec|cabernet|merlot|syrah|bonarda|tannat|pinot|tempranillo|sangiovese|chardonnay|torrontes|sauvignon|semillon|viognier|riesling|chenin|tinto|blanco|rosado|espumante|champagne)\b/g;
const NOMBRE_DEL_TIPO = { red: "tinto", white: "blanco", "rosé": "rosado", sparkling: "espumante champagne" };

/** ¿La pregunta nombra una uva o estilo que no es el del vino de la charla? */
const nombraOtroVino = (pregunta, vino, tipo) => {
  const propio = sinTildes(`${vino.name} ${vino.varietal || ""} ${NOMBRE_DEL_TIPO[tipo] || ""}`);
  return (pregunta.match(OTROS_VINOS) || []).some((palabra) => !propio.includes(palabra));
};

/** Si se pregunta cómo servir un vino del que se venía hablando, se contesta sin el modelo. */
const respuestaDeServicio = (question, contexto) => {
  const vino = contexto?.[0];
  const pregunta = sinTildes(question);
  if (!vino?.name || !PREGUNTA_DE_SERVICIO.test(pregunta)) return null;
  const tipo = tipoDeContexto(vino);
  if (!tipo || nombraOtroVino(pregunta, vino, tipo)) return null;
  return {
    answer: `El ${vino.name} servilo ${SERVICIO_POR_TIPO[tipo]}.`,
    picks: [],
    followups: ["¿Con qué lo acompaño?", "¿Cuánto lo guardo?"],
  };
};

/**
 * @param {{question?: string, wines?: Array<{name?: string, quantity?: number, rating?: number}>}} entrada
 * @returns {{answer: string, picks: string[], followups: string[]}} la misma forma que devuelve el modelo.
 */
const respuestaDeRespaldo = ({ question = "", wines = [], contexto = [] } = {}) => {
  // Primero lo que venían hablando: a «¿a qué temperatura lo tomo?» no se le contesta con otra botella.
  const deServicio = respuestaDeServicio(question, contexto);
  if (deServicio) return deServicio;

  // Lo mejor de lo que tiene en casa: con stock, y lo mejor puntuado primero.
  const enCasa = [...wines]
    .filter((w) => w?.name && Number(w.quantity) > 0)
    .sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0))
    .slice(0, 2);

  if (enCasa.length > 0) {
    const nombres = enCasa.map((w) => w.name);
    const lista = nombres.length === 2 ? `${nombres[0]} o ${nombres[1]}` : nombres[0];
    const answer = elegir(
      [
        `Se me complicó pensar algo a medida, pero no te dejo con las manos vacías: de lo que tenés en casa, lo que mejor puntuaste es ${lista}. Si te copa, probalo y contame cómo te fue.`,
        `Ahora estoy un poco lento, así que voy sobre seguro: de tu bodega, lo que más te gustó es ${lista}. Preguntame de nuevo en un ratito y lo afinamos con lo que querés comer.`,
        `No llegué a darte una respuesta fina, pero de lo que tenés, ${lista} es lo que más disfrutaste. Después lo seguimos conversando.`,
      ],
      question
    );
    return { answer, picks: nombres, followups: REPREGUNTAS };
  }

  const sugerencia = sugerenciaPara(question);
  const answer = elegir(
    [
      `Se me complicó pensar algo a medida, pero te tiro una que casi nunca falla: ${sugerencia}. Preguntame de nuevo en un ratito y lo afinamos.`,
      `Ahora estoy un poco lento, así que voy sobre seguro: te recomiendo ${sugerencia}. Después lo seguimos conversando.`,
      `No llegué a darte una respuesta fina, pero con eso que contás te sugiero ${sugerencia}. Probá y contame qué tal.`,
    ],
    question
  );
  return { answer, picks: [], followups: REPREGUNTAS };
};

const FUERA_DE_TEMA_FRASES = [
  "Eso se me escapa: yo soy tu sommelier y de vino sí que sé. Preguntame qué abrir con lo que vas a comer, en qué se diferencian dos uvas o cuál de los tuyos te conviene tomar hoy.",
  "De eso no te puedo ayudar, mi lado fuerte es el vino. Si querés, contame qué vas a comer y te recomiendo qué descorchar.",
  "Ahí me quedo corto: lo mío es el vino y la comida que lo acompaña. Probá preguntándome por una uva, una bodega o qué abrir hoy.",
  "Eso queda fuera de mi copa, pero con el vino te doy una mano: qué tomar con tu plato, qué guardar, qué comprar. Tirame lo que quieras.",
];

/** La respuesta a algo que no es del mundo del vino: amable, distinta según la pregunta, y con por dónde seguir. */
const fueraDeTemaPara = (question = "") => ({
  answer: elegir(FUERA_DE_TEMA_FRASES, question),
  wines: [],
  followups: ["¿Qué tomo con asado?", "¿Cuál abro hoy?", "Malbec vs Cabernet"],
  offTopic: true,
});

module.exports = { respuestaDeRespaldo, fueraDeTemaPara, FUERA_DE_TEMA_FRASES };
