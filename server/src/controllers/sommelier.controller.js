const Wine = require("../models/wine.model");
const WineWish = require("../models/wineWish.model");
const User = require("../models/user.model");
const SommelierAnswer = require("../models/sommelierAnswer.model");
const historial = require("../services/sommelierHistory.service");
const sommelier = require("../services/sommelier.service");
const {
  esDelDominio,
  usaTuBodega,
  esPreguntaDeInventario,
  filtroDeInventario,
  normalizarPregunta,
} = require("../data/sommelierDomain");
const { fold } = require("../data/argentineWines");
const { captureException } = require("../config/sentry");
const { recordError } = require("../services/errorLog.service");

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
 * Busca un vino por nombre entre candidatos, tolerante a propósito: el
 * modelo a veces copia el nombre recortando la cosecha o anteponiendo la
 * bodega. Se prueba por igualdad normalizada y después por contención en
 * cualquier dirección — cubre los dos casos sin abrir la puerta a falsos
 * positivos, porque los nombres de vino son largos y específicos.
 *
 * La usan `atarPicks` (contra la bodega) y la resolución de `recipeFor`
 * (contra bodega y guardados): es la misma pregunta —"¿a cuál de ESTOS se
 * refiere?"— hecha dos veces con listas distintas, y antes vivía duplicada.
 */
const encontrarVino = (nombre, candidatos = [], excluidos = new Set()) => {
  const buscado = fold(nombre);
  if (!buscado) return null;
  return (
    candidatos.find((w) => !excluidos.has(String(w._id)) && fold(w.name) === buscado) ||
    candidatos.find(
      (w) =>
        !excluidos.has(String(w._id)) &&
        (fold(w.name).includes(buscado) || buscado.includes(fold(w.name)))
    ) ||
    null
  );
};

/** La forma de tarjeta que espera el cliente. La usan `atarPicks` y `armarInventario`. */
const mapWineCard = (wine) => ({
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

/**
 * Ata los nombres que eligió el modelo a los vinos REALES de la persona.
 *
 * Es la parte que separa a esto de un chat pegado adentro de la app. El modelo
 * devuelve texto —"abrí el Rutini Malbec"— y sin este paso el usuario lee un
 * nombre y tiene que ir a buscarlo a mano a Mi Bodega. Con este paso, abajo de
 * la respuesta aparecen las mismas tarjetas que dibuja la bodega, con su foto,
 * su stock y su enlace a la ficha.
 *
 * ── POR QUÉ SÓLO CONTRA LO QUE TIENE STOCK ──────────────────────────────────
 * `wines` (lo que le pasa `ask()`) trae TODA la bodega, con stock o sin él —
 * "YA TOMÓ" necesita verlos a todos. El prompt le dice al modelo que "picks"
 * sólo puede salir de ahí, pero eso es una instrucción, no una garantía: un
 * modelo de lenguaje la puede pisar, y cuando la pisa, antes de esto no había
 * nada que lo parara — el nombre matcheaba igual contra un vino con
 * `quantity: 0`, la tarjeta se dibujaba igual (sin el "×N" porque ese chip
 * sólo aparece con stock > 0, así que ni siquiera se notaba que faltaba) y la
 * persona veía "de tu bodega" una botella que ya no tiene. Reportado así:
 * "le pregunto qué vinos tengo y me responde con vinos que ya probé pero no
 * tengo actualmente". Este filtro es la red de verdad, en código y no en
 * prompt: pase lo que pase en la respuesta, un pick sin stock nunca se dibuja
 * como si estuviera disponible.
 */
const atarPicks = (picks = [], wines = []) => {
  const conStock = wines.filter((w) => Number(w.quantity) > 0);
  const elegidos = [];
  const usados = new Set();

  for (const pick of picks) {
    const wine = encontrarVino(pick, conStock, usados);
    if (!wine) continue;

    usados.add(String(wine._id));
    elegidos.push(mapWineCard(wine));
  }

  return elegidos;
};

/** Cuántos nombres se listan antes de resumir el resto como "y N más". */
const MAX_NOMBRADOS_INVENTARIO = 4;

const listarConY = (nombres) =>
  nombres.length === 1
    ? nombres[0]
    : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;

/**
 * Arma la respuesta a una pregunta de inventario ("¿qué vinos tengo?", "¿qué
 * Malbec tengo?", "¿cuántas botellas me quedan?") SIN llamar a Gemini.
 *
 * ── POR QUÉ ESTO NO LE PREGUNTA AL MODELO ───────────────────────────────────
 * `atarPicks` ya evita que una tarjeta se dibuje sin stock real, pero eso
 * sólo protege las TARJETAS — el TEXTO lo seguía escribiendo Gemini, y un
 * modelo que ve "YA TOMÓ" y "GUARDADOS" en el mismo prompt puede nombrarlos
 * en la respuesta igual, aunque el prompt se lo prohíba explícitamente: es
 * una instrucción, no una garantía (mismo principio que en `atarPicks`).
 * Reportado en vivo, con el stock en cero: la respuesta decía "Tenés una
 * selección muy interesante, destacándose el Nicasia Vineyards..." nombrando
 * vinos de "YA TOMÓ" como si estuvieran en la heladera — sin ninguna tarjeta
 * abajo (esas sí estaban bien filtradas), pero mintiendo en el texto igual.
 *
 * Para esta pregunta puntual no hace falta redactar nada: es una consulta a
 * una lista, y una lista no se equivoca. Se arma acá, en código, contra
 * `wines` (el stock real) y nunca toca el modelo — ni gasta cuota, ni tarda
 * los segundos de una llamada, ni puede llegar a decir algo que no es
 * cierto. Ver `esPreguntaDeInventario` en data/sommelierDomain.js para el
 * criterio que decide cuándo entrar por acá en vez de por Gemini.
 */
const armarInventario = (wines, question) => {
  const conStock = wines.filter((w) => Number(w.quantity) > 0);
  const filtro = filtroDeInventario(question);
  const filtrados = !filtro
    ? conStock
    : conStock.filter((w) =>
        filtro.campo === "varietal"
          ? fold(w.varietal || "").includes(filtro.valor)
          : w.type === filtro.valor
      );

  if (!filtrados.length) {
    return {
      answer: filtro ? "De eso no tenés nada en stock ahora." : "No tenés nada en stock ahora.",
      wines: [],
      followups: ["¿Qué me recomendás comprar?", "¿Qué tomé antes?", "¿Con qué acompaño un asado?"],
      offTopic: false,
    };
  }

  const nombres = filtrados.slice(0, MAX_NOMBRADOS_INVENTARIO).map((w) => w.name);
  const resto = filtrados.length - nombres.length;
  const answer =
    resto > 0
      ? `Tenés ${filtrados.length} en stock: ${listarConY(nombres)}, y ${resto} más.`
      : `Tenés ${listarConY(nombres)}.`;

  return {
    answer,
    wines: filtrados.slice(0, 3).map(mapWineCard),
    followups: ["¿Cuál abro hoy?", "¿Qué me recomendás con el asado?", "¿Qué tomé antes?"],
    offTopic: false,
  };
};

/**
 * Lo que el cliente necesita para pedir la receta de `recipeFor` — el mismo
 * shape que espera `/api/catalog/recipe` (ver wineSearchApi.js,
 * getWineRecipe). Busca primero en la bodega (mejor prompt: llega con uva y
 * región reales), después en los guardados, y si no encuentra nada arma un
 * objeto mínimo con sólo el nombre — sirve igual para un estilo general
 * ("Malbec joven") que no es ningún vino puntual de la persona.
 */
const recipeWineDe = (recipeFor, wines, wishes) => {
  if (!recipeFor) return null;
  const wine = encontrarVino(recipeFor, wines) || encontrarVino(recipeFor, wishes);
  return {
    name: wine?.name || recipeFor,
    winery: wine?.winery || "",
    varietal: wine?.varietal || "",
    type: wine?.type || "unknown",
    region: wine?.region || "",
  };
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
          const deCache = {
            answer: guardada.answer,
            wines: [],
            followups: guardada.followups || [],
            offTopic: false,
          };
          /**
           * Al historial también.
           *
           * Que la respuesta venga de la caché es un detalle de implementación
           * nuestro: para quien preguntó es una respuesta igual que cualquier
           * otra, y tiene que poder volver a leerla. Y es justamente el camino
           * más frecuente —las preguntas genéricas son las que más se repiten—
           * así que dejarlo afuera habría vaciado el historial de casi todo.
           */
          const idCache = await historial.guardarTurno({
            userId: req.user?.id,
            conversationId: req.body.conversationId,
            question,
            data: deCache,
          });
          return res.status(200).json({ data: deCache, cached: true, conversationId: idCache });
        }
      } catch {
        // Sin caché: se genera. Nunca se cae la respuesta por esto.
      }
    }

    /**
     * MEDIDA 3 — el contexto viaja compacto, y sólo cuando hace falta.
     *
     * La bodega y los guardados se piden únicamente si la pregunta los
     * menciona (las dos gatilladas por la misma señal, `personal`: la
     * pregunta "¿qué tengo?" es tan sobre el stock como sobre lo que anotó
     * para conseguir — la persona hace la misma pregunta sin distinguir la
     * fuente). Las preferencias del onboarding, en cambio, van siempre: son
     * una línea de texto y son lo que evita que la primera recomendación de
     * alguien con la bodega vacía sea genérica.
     *
     * Las tres consultas van en paralelo, proyectadas a los campos que de
     * verdad se usan, y si alguna falla se sigue sin ella: una respuesta menos
     * personal es infinitamente mejor que un error.
     */
    const [wines, wishes, user] = await Promise.all([
      personal
        ? Wine.find({ userId: req.user.id })
            .select("name winery varietal vintage region type image quantity rating tasted")
            .sort({ quantity: -1, updatedAt: -1 })
            .limit(60)
            .lean()
            .catch(() => [])
        : Promise.resolve([]),
      personal
        ? WineWish.find({ userId: req.user.id })
            .select("name winery varietal vintage type region")
            .sort({ addedAt: -1 })
            .limit(20)
            .lean()
            .catch(() => [])
        : Promise.resolve([]),
      User.findById(req.user.id).select("preferences").lean().catch(() => null),
    ]);

    /**
     * MEDIDA 3.5 — el inventario ni pasa por el modelo.
     *
     * Se chequea con `wines` ya en mano (por eso va después del Promise.all
     * y no antes) y corta acá, sin llamar a Gemini: ver el comentario grande
     * en `armarInventario`. `personal` de guarda extra — si la pregunta no
     * pidió su bodega, `wines` viene vacío y no hay nada que listar.
     */
    if (personal && esPreguntaDeInventario(question)) {
      const inventario = armarInventario(wines, question);
      // También va al historial: "¿qué Malbec tengo?" es una consulta como
      // cualquier otra, y que la haya contestado la base en vez del modelo no
      // cambia nada para quien preguntó.
      const idInv = await historial.guardarTurno({
        userId: req.user?.id,
        conversationId: req.body.conversationId,
        question,
        data: inventario,
      });
      return res.status(200).json({ data: inventario, cached: false, conversationId: idInv });
    }

    let resultado;
    try {
      resultado = await sommelier.preguntar({
        question,
        history,
        wines,
        wishes,
        preferences: user?.preferences || {},
      });
    } catch (error) {
      // Gemini sin cuota, caído o lento. Se dice lo que pasó y qué hacer, en
      // vez de un "error" que no distingue esto de un problema del usuario —
      // pero de este lado SÍ queda registrado: antes este catch se comía la
      // excepción entera y en silencio, así que una falla de verdad (una API
      // key vencida, una cuota agotada) era indistinguible de un timeout
      // normal, y ni loggeaba ni llegaba a Sentry. `next(error)` no se usa
      // porque cambiaría el status y el mensaje que ya elegimos para esto.
      console.error("[sommelier]", error?.message || error);
      recordError({ error, req, statusCode: 503 });
      captureException(error, { route: "POST /api/sommelier/ask" });
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

    // La receta NO se genera acá (sería una segunda llamada a Gemini adentro
    // de ésta, y acá la velocidad es la funcionalidad): sólo se resuelve a qué
    // vino se refiere. El cliente pide la receta aparte, con el mismo
    // endpoint que ya usa la ficha, y sólo si toca el botón.
    const recipeWine = recipeWineDe(resultado.recipeFor, wines, wishes);
    if (recipeWine) data.recipeWine = recipeWine;

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

    /**
     * El historial se escribe ACÁ, con la respuesta que de verdad salió.
     *
     * Va antes de responder y no después porque el id de la conversación viaja
     * en la respuesta: el cliente lo necesita para que la siguiente pregunta se
     * agregue a la misma charla en vez de abrir una nueva. Es una escritura de
     * milisegundos contra una llamada a Gemini que tarda segundos, así que no
     * cambia lo que la persona percibe.
     *
     * Y nunca tira: `guardarTurno` devuelve null si algo falla. Sin historial
     * la app funciona igual — al revés no.
     */
    const conversationId = await historial.guardarTurno({
      userId: req.user?.id,
      conversationId: req.body.conversationId,
      question,
      data,
    });

    return res.status(200).json({ data, cached: false, conversationId });
  } catch (error) {
    return next(error);
  }
};

module.exports = { ask, atarPicks, encontrarVino, recipeWineDe, armarInventario, FUERA_DE_TEMA };
