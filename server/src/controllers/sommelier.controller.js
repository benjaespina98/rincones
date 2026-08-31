const Wine = require("../models/wine.model");
const User = require("../models/user.model");
const SommelierAnswer = require("../models/sommelierAnswer.model");
const sommelier = require("../services/sommelier.service");
const { esDelDominio, usaTuBodega, normalizarPregunta } = require("../data/sommelierDomain");
const { fold } = require("../data/argentineWines");

/** Tope de lo que se acepta escribir. Más largo que esto no es una pregunta. */
const MAX_PREGUNTA = 300;
const MIN_PREGUNTA = 3;

/**
 * Lo que se contesta sin llamar a nadie cuando la pregunta no es del mundo del
 * vino.
 *
 * Es una sola frase y no un reto. La persona no hizo nada malo: probó los
 * límites de una cosa nueva, que es exactamente lo que uno hace con una app
 * que conversa. Lo único que tiene que quedar claro es de qué SÍ sabe, y eso se
 * dice enumerando, que además le da la próxima pregunta hecha.
 */
const FUERA_DE_TEMA = {
  answer:
    "De eso no sé nada. Preguntame de vinos: qué abrir con lo que vas a comer, en qué se diferencian dos uvas, qué bodega hace qué, o cuál de los tuyos te conviene tomar ahora.",
  wines: [],
  followups: ["¿Qué tomo con asado?", "¿Cuál abro hoy?", "Malbec vs Cabernet"],
  offTopic: true,
};

/**
 * Ata los nombres que eligió el modelo a los vinos REALES de la persona.
 *
 * Es la parte que separa a esto de un chat pegado adentro de la app. El modelo
 * devuelve texto —"abrí el Rutini Malbec"— y sin este paso el usuario lee un
 * nombre y tiene que ir a buscarlo a mano a Mi Bodega. Con este paso, abajo de
 * la respuesta aparecen las mismas tarjetas que dibuja la bodega, con su foto,
 * su stock y su enlace a la ficha.
 *
 * El match es tolerante a propósito: el modelo copia el nombre de la lista que
 * le dimos, pero a veces le recorta la cosecha o le agrega la bodega adelante.
 * Se prueba por igualdad normalizada y después por contención en cualquier
 * dirección, que cubre los dos casos sin abrir la puerta a falsos positivos —
 * los nombres de vino son largos y específicos.
 */
const atarPicks = (picks = [], wines = []) => {
  const elegidos = [];
  const usados = new Set();

  for (const pick of picks) {
    const buscado = fold(pick);
    if (!buscado) continue;

    const wine =
      wines.find((w) => !usados.has(String(w._id)) && fold(w.name) === buscado) ||
      wines.find(
        (w) =>
          !usados.has(String(w._id)) &&
          (fold(w.name).includes(buscado) || buscado.includes(fold(w.name)))
      );

    if (!wine) continue;
    usados.add(String(wine._id));
    elegidos.push({
      _id: String(wine._id),
      name: wine.name,
      winery: wine.winery || "",
      varietal: wine.varietal || "",
      vintage: wine.vintage || null,
      region: wine.region || "",
      type: wine.type || "unknown",
      image: wine.image || "",
      quantity: Number(wine.quantity) || 0,
      rating: Number(wine.rating) || 0,
    });
  }

  return elegidos;
};

// POST /api/sommelier/ask { question, history? }
const ask = async (req, res, next) => {
  try {
    const question = String(req.body.question || "").trim().slice(0, MAX_PREGUNTA);
    if (question.length < MIN_PREGUNTA) {
      return res.status(400).json({ message: "Escribí tu consulta" });
    }

    const history = sommelier.recortarHistorial(req.body.history);

    /**
     * MEDIDA 1 — el portero local.
     *
     * Antes de cualquier otra cosa, y sin red de por medio. Una pregunta que no
     * es del dominio se contesta acá y cuesta cero: ni cuota de Gemini, ni
     * latencia, ni una consulta a la base. Ver data/sommelierDomain.js.
     */
    if (!esDelDominio(question, history.length > 0)) {
      return res.status(200).json({ data: FUERA_DE_TEMA, cached: false });
    }

    /**
     * ¿Esta pregunta habla de SU bodega?
     *
     * Decide dos cosas a la vez, y por eso se calcula tan temprano:
     *   · si vale la pena gastar tokens mandándole el inventario al modelo;
     *   · si la respuesta se puede compartir con el resto de los usuarios.
     *
     * Las dos salen de lo mismo: una respuesta que miró tu cava es tuya.
     */
    const personal = usaTuBodega(question);
    const key = normalizarPregunta(question);

    /**
     * MEDIDA 2 — la caché de preguntas genéricas.
     *
     * Sólo para las que no miran la bodega. Y sólo si es la primera pregunta de
     * la charla: adentro de una conversación, "¿y con pescado?" significa una
     * cosa distinta según lo anterior, así que su texto normalizado no alcanza
     * como clave.
     */
    const cacheable = !personal && history.length === 0;
    if (cacheable) {
      try {
        const guardada = await SommelierAnswer.findOne({ key }).lean();
        if (guardada?.answer) {
          return res.status(200).json({
            data: {
              answer: guardada.answer,
              wines: [],
              followups: guardada.followups || [],
              offTopic: false,
            },
            cached: true,
          });
        }
      } catch {
        // Sin caché: se genera. Nunca se cae la respuesta por esto.
      }
    }

    /**
     * MEDIDA 3 — el contexto viaja compacto, y sólo cuando hace falta.
     *
     * La bodega se pide únicamente si la pregunta la menciona. Las
     * preferencias del onboarding, en cambio, van siempre: son una línea de
     * texto y son lo que evita que la primera recomendación de alguien con la
     * bodega vacía sea genérica.
     *
     * Las dos consultas van en paralelo, proyectadas a los campos que de
     * verdad se usan, y si alguna falla se sigue sin ella: una respuesta menos
     * personal es infinitamente mejor que un error.
     */
    const [wines, user] = await Promise.all([
      personal
        ? Wine.find({ userId: req.user.id })
            .select("name winery varietal vintage region type image quantity rating tasted")
            .sort({ quantity: -1, updatedAt: -1 })
            .limit(60)
            .lean()
            .catch(() => [])
        : Promise.resolve([]),
      User.findById(req.user.id).select("preferences").lean().catch(() => null),
    ]);

    let resultado;
    try {
      resultado = await sommelier.preguntar({
        question,
        history,
        wines,
        preferences: user?.preferences || {},
      });
    } catch {
      // Gemini sin cuota, caído o lento. Se dice lo que pasó y qué hacer, en
      // vez de un "error" que no distingue esto de un problema del usuario.
      return res.status(503).json({
        message: "No pude pensar la respuesta ahora. Probá de nuevo en un minuto.",
      });
    }

    if (!resultado) {
      return res.status(503).json({
        message: "No pude pensar la respuesta ahora. Probá de nuevo en un minuto.",
      });
    }

    // MEDIDA 4 — la segunda red del filtro. El portero es una lista blanca y
    // deja pasar algún borde; si el modelo dice que es de otro tema, se
    // devuelve la misma frase que devolvería el portero, y no se cachea.
    if (resultado.offTopic) {
      return res.status(200).json({ data: { ...FUERA_DE_TEMA, answer: resultado.answer }, cached: false });
    }

    const data = {
      answer: resultado.answer,
      wines: atarPicks(resultado.picks, wines),
      followups: resultado.followups,
      offTopic: false,
    };

    if (cacheable) {
      try {
        await SommelierAnswer.updateOne(
          { key },
          { $set: { key, answer: data.answer, followups: data.followups }, $setOnInsert: { createdAt: new Date() } },
          { upsert: true }
        );
      } catch {
        // La caché es una optimización; la respuesta ya está lista.
      }
    }

    return res.status(200).json({ data, cached: false });
  } catch (error) {
    return next(error);
  }
};

module.exports = { ask, atarPicks, FUERA_DE_TEMA };
