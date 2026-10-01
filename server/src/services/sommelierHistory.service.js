const SommelierConversation = require("../models/sommelierConversation.model");

/**
 * Guardar el ida y vuelta de una charla con la guía.
 *
 * ── POR QUÉ LO ESCRIBE EL SERVIDOR Y NO EL CLIENTE ──────────────────────────
 * Lo obvio sería un `PUT /conversations/:id` donde la app manda la charla
 * entera cada vez que cambia. Sería más simple y está mal: el cliente pasaría a
 * decidir qué dice que dijo el asistente. Cualquiera con las herramientas de
 * desarrollo abiertas podría guardar en su propio historial una respuesta que
 * la app nunca dio — y ese historial es lo que después se lee como "esto me
 * recomendó Rincones".
 *
 * Acá el servidor escribe lo que de verdad contestó, en el mismo momento en que
 * lo contesta. El cliente sólo aporta la pregunta, que es suya.
 *
 * ── NUNCA ROMPE LA RESPUESTA ────────────────────────────────────────────────
 * Todo esto es accesorio: la persona hizo una pregunta y quiere la respuesta.
 * Si la base está lenta o caída, la respuesta sale igual y el historial se
 * pierde. Por eso cada llamada va envuelta y devuelve `null` en vez de tirar.
 */

/** El título sale de la primera pregunta, recortada en una palabra entera. */
const tituloDe = (pregunta) => {
  const limpio = String(pregunta || "").trim().replace(/\s+/g, " ");
  if (limpio.length <= 60) return limpio || "Consulta";
  const corte = limpio.slice(0, 60);
  const ultimoEspacio = corte.lastIndexOf(" ");
  return `${ultimoEspacio > 30 ? corte.slice(0, ultimoEspacio) : corte}…`;
};

/**
 * De un vino completo, lo justo para volver a dibujar su tarjeta.
 *
 * Ver el comentario del modelo: guardar el documento entero lo congelaría, y el
 * stock y el puntaje de hace un mes mostrados como actuales son peor que no
 * mostrarlos.
 */
const resumir = (wine) => ({
  wineId: String(wine?._id || wine?.id || ""),
  name: wine?.name || "",
  winery: wine?.winery || "",
  type: wine?.type || "",
  image: wine?.image || "",
});

/**
 * Agrega la pregunta y su respuesta a una conversación, creándola si hace falta.
 *
 * @returns {Promise<string|null>} el id de la conversación, o null si no se pudo.
 */
const guardarTurno = async ({ userId, conversationId, question, data }) => {
  if (!userId || !question || !data?.answer) return null;

  const turno = [
    { role: "user", text: String(question), createdAt: new Date() },
    {
      role: "assistant",
      text: String(data.answer),
      deTuBodega: (data.wines || []).map(resumir),
      paraDescubrir: (data.descubrir || []).map(resumir),
      repreguntas: data.followups || [],
      createdAt: new Date(),
    },
  ];

  try {
    if (conversationId) {
      /**
       * El filtro lleva `userId` y no sólo el id: sin eso, mandar el id de la
       * conversación de otra persona le escribiría mensajes en su historial.
       * Con los dos campos, un id ajeno simplemente no matchea y se abre una
       * conversación nueva, que es lo que hace el bloque de abajo.
       */
      const actualizada = await SommelierConversation.findOneAndUpdate(
        { _id: conversationId, userId },
        { $push: { messages: { $each: turno } } },
        { new: true, projection: { _id: 1 } }
      );
      if (actualizada) return String(actualizada._id);
    }

    const creada = await SommelierConversation.create({
      userId,
      title: tituloDe(question),
      messages: turno,
    });
    return String(creada._id);
  } catch (error) {
    // Un id con forma inválida, la base lenta, lo que sea. La respuesta ya
    // está; el historial es lo accesorio.
    console.error("[sommelier:historial]", error?.message || error);
    return null;
  }
};

module.exports = { guardarTurno, tituloDe, resumir };
