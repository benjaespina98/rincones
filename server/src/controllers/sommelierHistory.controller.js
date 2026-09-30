const SommelierConversation = require("../models/sommelierConversation.model");

/**
 * El historial de charlas con la guía de vino.
 *
 * ── LO ÚNICO QUE IMPORTA ACÁ ES DE QUIÉN ES CADA CHARLA ─────────────────────
 * Una conversación puede tener lo que alguien toma, con quién, qué se puede
 * pagar y qué no sabe de vino. Es de las cosas más personales que guarda la
 * app, más que la bodega misma.
 *
 * Por eso **ninguna consulta de este archivo busca sólo por `_id`**: todas
 * llevan `userId` en el filtro, incluso las de borrar. No es defensa en
 * profundidad por las dudas — es que con `findById(id)` alcanza con adivinar un
 * ObjectId para leer la charla de otra persona, y un ObjectId lleva el reloj
 * adentro: los de la misma hora se parecen mucho.
 *
 * Buscar con los dos campos hace que un id ajeno devuelva "no existe", que es
 * además la respuesta correcta: quien pregunta no tiene por qué enterarse de
 * que esa conversación existe.
 */

/** Cuántas charlas devuelve el listado. Más que esto ya no se recorre, se busca. */
const POR_PAGINA = 30;

/**
 * GET /api/sommelier/conversations
 *
 * Sólo títulos y fechas: el listado es para elegir cuál abrir, y mandar los
 * mensajes de treinta conversaciones para dibujar treinta renglones sería
 * mover cien veces lo que se va a mostrar.
 */
const list = async (req, res, next) => {
  try {
    const conversaciones = await SommelierConversation.find({ userId: req.user.id })
      .select("title updatedAt messages")
      .sort({ updatedAt: -1 })
      .limit(POR_PAGINA)
      .lean();

    return res.json({
      success: true,
      data: conversaciones.map((c) => ({
        id: String(c._id),
        title: c.title,
        updatedAt: c.updatedAt,
        // El conteo se calcula acá y no se guarda: un contador duplicado es un
        // dato que se puede desincronizar del array que cuenta.
        mensajes: c.messages?.length || 0,
      })),
    });
  } catch (error) {
    return next(error);
  }
};

/** GET /api/sommelier/conversations/:id — una charla con todos sus mensajes. */
const getOne = async (req, res, next) => {
  try {
    const conversacion = await SommelierConversation.findOne({
      _id: req.params.id,
      userId: req.user.id,
    }).lean();

    if (!conversacion) {
      return res.status(404).json({ success: false, message: "Esa conversación no existe" });
    }

    return res.json({
      success: true,
      data: {
        id: String(conversacion._id),
        title: conversacion.title,
        updatedAt: conversacion.updatedAt,
        messages: conversacion.messages || [],
      },
    });
  } catch (error) {
    // Un `_id` con forma inválida hace que Mongoose tire CastError. Para quien
    // pregunta es lo mismo que no existir, y decirle "id mal formado" sólo le
    // enseña cómo formarlo bien.
    if (error?.name === "CastError") {
      return res.status(404).json({ success: false, message: "Esa conversación no existe" });
    }
    return next(error);
  }
};

/**
 * DELETE /api/sommelier/conversations/:id
 *
 * Borra de verdad, no marca como borrada. Es lo que alguien espera cuando saca
 * una conversación de su historial, y guardar en secreto lo que te pidieron
 * borrar es exactamente lo que no hay que hacer con datos personales.
 */
const remove = async (req, res, next) => {
  try {
    const borrada = await SommelierConversation.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!borrada) {
      return res.status(404).json({ success: false, message: "Esa conversación no existe" });
    }

    return res.json({ success: true, data: { id: req.params.id } });
  } catch (error) {
    if (error?.name === "CastError") {
      return res.status(404).json({ success: false, message: "Esa conversación no existe" });
    }
    return next(error);
  }
};

module.exports = { list, getOne, remove, POR_PAGINA };
