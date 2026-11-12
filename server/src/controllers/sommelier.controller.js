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
const { limpiarDato } = require("../utils/promptSeguro");
const { validarImagen } = require("../utils/imagenCabecera");
const { respuestaDeRespaldo, fueraDeTemaPara } = require("../services/sommelierRespaldo");
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
  // El modelo copia el nombre tal como se lo mostramos en el prompt, o sea YA limpiado (ver
  // `limpiarDato`): un nombre con "---" o "<>" no sería subcadena del original. Se compara contra
  // las dos formas.
  const formas = (w) => [fold(w.name), fold(limpiarDato(w.name))];
  const libre = (w) => !excluidos.has(String(w._id));
  return (
    candidatos.find((w) => libre(w) && formas(w).includes(buscado)) ||
    candidatos.find((w) => libre(w) && formas(w).some((f) => f && (f.includes(buscado) || buscado.includes(f)))) ||
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

/**
 * Lo que se le cuenta al modelo de la persona: su bodega, lo que quiere conseguir y su
 * gusto declarado. Las tres consultas van en paralelo, proyectadas a los campos que de
 * verdad se usan, y si alguna falla se sigue sin ella: una respuesta menos personal es
 * infinitamente mejor que un error. Sin `personal` no se piden la bodega ni los
 * guardados (ver MEDIDA 3 en `ask`); el gusto declarado va siempre, es una línea.
 */
const cargarContexto = async ({ userId, personal }) => {
  const [wines, wishes, user] = await Promise.all([
    personal
      ? Wine.find({ userId })
          .select("name winery varietal vintage region type image quantity rating tasted")
          .sort({ quantity: -1, updatedAt: -1 })
          .limit(60)
          .lean()
          .catch(() => [])
      : Promise.resolve([]),
    personal
      ? WineWish.find({ userId })
          .select("name winery varietal vintage type region")
          .sort({ addedAt: -1 })
          .limit(20)
          .lean()
          .catch(() => [])
      : Promise.resolve([]),
    User.findById(userId).select("preferences").lean().catch(() => null),
  ]);
  return { wines, wishes, user };
};

/**
 * Del resultado crudo del modelo a la respuesta que sale al cliente. La comparten la
 * pregunta escrita y la foto.
 *
 * MEDIDA 4 — la segunda red del filtro: el portero es una lista blanca y deja pasar
 * algún borde; si el modelo dice que es de otro tema, se devuelve la misma frase que
 * devolvería el portero, y no se cachea ni se guarda.
 *
 * La receta NO se genera acá (sería una segunda llamada a Gemini adentro de ésta, y acá
 * la velocidad es la funcionalidad): sólo se resuelve a qué vino se refiere. El cliente
 * la pide aparte, y sólo si se toca el botón.
 *
 * El historial se escribe ACÁ, con la respuesta que de verdad salió, antes de responder:
 * el id de la conversación viaja en la respuesta y el cliente lo necesita para que la
 * siguiente pregunta se agregue a la misma charla. Nunca tira: `guardarTurno` devuelve
 * null si algo falla, y sin historial la app funciona igual — al revés no.
 *
 * @param {string|null} cacheKey  la clave de la caché de genéricas, o null para no cachear.
 * @returns {Promise<object>} el cuerpo de la respuesta.
 */
const armarRespuesta = async ({
  req,
  resultado,
  wines,
  wishes,
  question,
  cacheKey = null,
  reemplazaMensajeId = "",
}) => {
  if (resultado.offTopic) {
    return { data: { ...FUERA_DE_TEMA, answer: resultado.answer || fueraDeTemaPara(question).answer }, cached: false };
  }

  const data = {
    answer: resultado.answer,
    wines: atarPicks(resultado.picks, wines),
    followups: resultado.followups,
    offTopic: false,
  };

  const recipeWine = recipeWineDe(resultado.recipeFor, wines, wishes);
  if (recipeWine) data.recipeWine = recipeWine;

  if (cacheKey) {
    try {
      await SommelierAnswer.updateOne(
        { key: cacheKey },
        {
          $set: { key: cacheKey, answer: data.answer, followups: data.followups },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true }
      );
    } catch {
      // La caché es una optimización; la respuesta ya está lista.
    }
  }

  const guardado = await historial.guardarTurnoDetallado({
    userId: req.user?.id,
    conversationId: req.body.conversationId,
    question,
    data,
    reemplazaMensajeId,
  });

  return {
    data,
    cached: false,
    conversationId: guardado?.id ?? null,
    // El id del mensaje del asistente: el pulgar y "otra opción" apuntan a él.
    mensajeId: guardado?.mensajeId ?? null,
  };
};

// POST /api/sommelier/ask { question, history? }
const resolverPregunta = async (req, { enviar, llamarModelo, next, cancelada }) => {
  try {
    const question = String(req.body.question || "").trim().slice(0, MAX_PREGUNTA);
    if (question.length < MIN_PREGUNTA) {
      return enviar(400, { message: "Escribí tu consulta" });
    }

    const history = sommelier.recortarHistorial(req.body.history);

    /**
     * "OTRA OPCIÓN": la persona pidió una alternativa a una respuesta que ya leyó.
     *
     *   · `evitar` es esa respuesta, para que el modelo no la repita.
     *   · `reemplazaMensajeId` es el mensaje del historial que se reemplaza, en su
     *     mismo lugar, en vez de agregar un turno (la pregunta no se repite).
     *   · No se lee ni se escribe la caché: la caché devuelve LA respuesta de
     *     esa pregunta, que es justo la que se está descartando.
     */
    const regenerar = req.body.regenerar === true;
    const evitar = regenerar ? String(req.body.evitar || "").trim().slice(0, 500) : "";
    const reemplazaMensajeId = regenerar ? String(req.body.reemplazaMensajeId || "") : "";

    /**
     * MEDIDA 1 — el portero local.
     *
     * Antes de cualquier otra cosa, y sin red de por medio. Una pregunta que no
     * es del dominio se contesta acá y cuesta cero: ni cuota de Gemini, ni
     * latencia, ni una consulta a la base. Ver data/sommelierDomain.js.
     */
    if (!esDelDominio(question, history.length > 0)) {
      return enviar(200, { data: fueraDeTemaPara(question), cached: false });
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
    const cacheable = !personal && history.length === 0 && !regenerar;
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
          const detCache = await historial.guardarTurnoDetallado({
            userId: req.user?.id,
            conversationId: req.body.conversationId,
            question,
            data: deCache,
          });
          return enviar(200, {
            data: deCache,
            cached: true,
            conversationId: detCache?.id ?? null,
            mensajeId: detCache?.mensajeId ?? null,
          });
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
    const { wines, wishes, user } = await cargarContexto({ userId: req.user.id, personal });

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
      const detInv = await historial.guardarTurnoDetallado({
        userId: req.user?.id,
        conversationId: req.body.conversationId,
        question,
        data: inventario,
        reemplazaMensajeId,
      });
      return enviar(200, {
        data: inventario,
        cached: false,
        conversationId: detInv?.id ?? null,
        mensajeId: detInv?.mensajeId ?? null,
      });
    }

    let resultado;
    try {
      resultado = await llamarModelo({
        question,
        history,
        wines,
        wishes,
        // Una respuesta que se cachea para todos no puede salir del gusto de quien
        // preguntó primero (se filtraba en primera persona: «como tomás Malbec…»).
        preferences: cacheable ? {} : user?.preferences || {},
        evitar,
      });
    } catch (error) {
      // Gemini sin cuota, caído o lento. Se dice lo que pasó y qué hacer, en
      // vez de un "error" que no distingue esto de un problema del usuario —
      // pero de este lado SÍ queda registrado: antes este catch se comía la
      // excepción entera y en silencio, así que una falla de verdad (una API
      // key vencida, una cuota agotada) era indistinguible de un timeout
      // normal, y ni loggeaba ni llegaba a Sentry. `next(error)` no se usa
      // porque cambiaría el status y el mensaje que ya elegimos para esto.
      // Salvo que quien preguntó ya se haya ido (salió de la pantalla o mandó otra
      // pregunta): eso no es una falla del modelo. No se registra como error, no
      // se contesta con el respaldo y, sobre todo, no se guarda en el historial
      // una respuesta enlatada para una pregunta que se estaba contestando bien.
      if (cancelada?.()) return undefined;
      console.error("[sommelier]", error?.message || error);
      recordError({ error, req, statusCode: 503 });
      captureException(error, { route: "POST /api/sommelier/ask" });
      resultado = null;
    }

    /**
     * SIEMPRE HAY ALGO PARA RESPONDER. Si el modelo falló, no contestó o devolvió un texto vacío, no se le muestra un
     * "error" a quien sólo preguntó algo de vino: se contesta con lo que se puede sin él (algo de su bodega o una
     * uva que casi nunca falla). Eso no se guarda en la caché de genéricas, o se serviría a todos como si fuera lo real.
     */
    // Con "otra opción" NO: la respuesta anterior, que era buena, no se pisa con una genérica. Ahí falla como siempre (503) y queda
    // lo que ya estaba. Y un fuera de tema legítimo sin texto se contesta como fuera de tema (ver `armarRespuesta`).
    if (!resultado && regenerar) {
      return enviar(503, { message: "No pude pensar otra opción ahora. Probá de nuevo en un ratito." });
    }
    if (!resultado || (!resultado.offTopic && !String(resultado.answer || "").trim())) {
      return enviar(200, {
        ...(await armarRespuesta({
          req,
          resultado: respuestaDeRespaldo({ question, wines }),
          wines,
          wishes,
          question,
          cacheKey: null,
          reemplazaMensajeId,
        })),
        respaldo: true,
      });
    }

    return enviar(
      200,
      await armarRespuesta({
        req,
        resultado,
        wines,
        wishes,
        question,
        cacheKey: cacheable ? key : null,
        reemplazaMensajeId,
      })
    );
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /api/sommelier/ask — la respuesta de una sola vez (JSON).
 *
 * La lógica vive en `resolverPregunta`, que no sabe cómo se ENTREGA la respuesta: recibe
 * `enviar(status, cuerpo)` y `llamarModelo(args)`. Esta es la versión de siempre; la que
 * va escribiéndose es `askStream`.
 */
const ask = (req, res, next) =>
  resolverPregunta(req, {
    next,
    enviar: (status, cuerpo) => res.status(status).json(cuerpo),
    llamarModelo: (args) => sommelier.preguntar(args),
  });

/**
 * POST /api/sommelier/ask-stream — la misma pregunta, con la respuesta escribiéndose.
 *
 * Server-Sent Events: tres tipos de evento.
 *   texto   { delta }          un pedazo más de la respuesta (sólo el texto, no el JSON).
 *   final   { status, ...cuerpo }   el mismo cuerpo que devuelve `ask`, con los vinos,
 *                              las repreguntas y los ids del historial. Cierra el stream.
 *   error   { status, message }     algo falló DESPUÉS de haber empezado a escribir.
 *
 * Todo lo que se decide antes de llamar al modelo (el portero, la caché, el inventario, los
 * límites) es EXACTAMENTE lo mismo que en `ask`: esas respuestas salen como un único evento
 * `final`. Un error previo a empezar (un 400, un 503) sale como JSON normal, no como evento:
 * el cliente ya sabe leerlo.
 *
 * Si la persona se va a mitad de la respuesta, se corta la llamada a Gemini.
 */
const askStream = async (req, res, next) => {
  let abierto = false;
  let terminado = false;

  const abrir = () => {
    if (abierto) return;
    abierto = true;
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      // `no-transform`: que ningún intermediario recomprima o junte los trozos.
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders?.();
  };

  const evento = (nombre, datos) => {
    if (terminado) return;
    abrir();
    res.write(`event: ${nombre}\ndata: ${JSON.stringify(datos)}\n\n`);
    res.flush?.();
  };

  const cerrar = () => {
    terminado = true;
    res.end();
  };

  const cancelacion = new AbortController();
  res.on("close", () => cancelacion.abort());

  let enviado = 0;

  await resolverPregunta(req, {
    next: (error) => {
      if (!abierto) return next(error);
      evento("error", { status: 500, message: "No pude terminar la respuesta. Probá de nuevo." });
      return cerrar();
    },
    enviar: (status, cuerpo) => {
      // Un error ANTES de empezar sale como JSON normal.
      if (status !== 200 && !abierto) return res.status(status).json(cuerpo);
      evento(status === 200 ? "final" : "error", { status, ...cuerpo });
      return cerrar();
    },
    cancelada: () => cancelacion.signal.aborted,
    llamarModelo: (args) =>
      sommelier.preguntarEnVivo({
        ...args,
        signal: cancelacion.signal,
        onTexto: (texto) => {
          if (texto.length <= enviado) return;
          evento("texto", { delta: texto.slice(enviado) });
          enviado = texto.length;
        },
      }),
  });
};

/**
 * ¿Los primeros bytes son los de una imagen de verdad?
 *
 * `multer` sólo mira el tipo que DECLARA el navegador, que no prueba nada: cualquiera
 * puede subir un PDF con `Content-Type: image/jpeg`. Se miran las firmas de los
 * formatos que acepta Gemini, para no mandarle a la API de visión —que se cobra por
 * llamada— cualquier cosa. JPEG, PNG, WebP y HEIC/HEIF (el de los iPhone).
 */
const esImagenReal = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  const b = buffer;
  const jpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const webp = b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP";
  const heic = b.toString("ascii", 4, 8) === "ftyp" && /^(heic|heix|hevc|heim|heis|mif1|msf1)/.test(b.toString("ascii", 8, 12));
  return jpeg || png || webp || heic;
};


/**
 * POST /api/sommelier/photo — multipart { file, question?, conversationId?, history? }
 *
 * Una foto de la carta de un restaurante, de un plato o de una botella. Misma respuesta
 * que `ask`. Cuenta contra los mismos límites (40 por día, 60 por hora) y la imagen NO se
 * guarda: viaja a Gemini y se descarta. En el historial queda el texto que la persona
 * escribió, o "Foto de un menú o plato".
 */
const askPhoto = async (req, res, next) => {
  try {
    const archivo = req.file;
    if (!archivo?.buffer?.length) {
      return res.status(400).json({ message: "Mandá una foto" });
    }
    // Misma validación que el escáner de etiquetas (tipo real y tamaño, por la cabecera), con una
    // diferencia: acá no se exige poder medir la foto, porque las que entran suelen ser cartas y
    // platos. Los topes de tamaño máximo sí valen.
    const imagen = validarImagen(archivo.buffer, undefined, { exigirMedidas: false });
    if (!imagen.ok) {
      return res.status(400).json({ message: imagen.mensaje });
    }

    const texto = String(req.body.question || "").trim().slice(0, MAX_PREGUNTA);
    // Si escribió algo con la foto, tiene que ser del mundo del vino (el portero de
    // siempre). La foto en sí la juzga el modelo: ver offTopic en las instrucciones.
    if (texto && !esDelDominio(texto, false)) {
      return res.status(200).json({ data: FUERA_DE_TEMA, cached: false });
    }

    let history = [];
    try {
      history = sommelier.recortarHistorial(JSON.parse(req.body.history || "[]"));
    } catch {
      // Un historial roto no tira la consulta: se sigue sin él.
    }

    // La bodega va siempre: con una carta o un plato, "qué abro" se contesta mirándola.
    const { wines, wishes, user } = await cargarContexto({ userId: req.user.id, personal: true });

    let resultado;
    try {
      resultado = await sommelier.preguntarConFoto({
        imagen: { mime: imagen.info.mime, base64: archivo.buffer.toString("base64") },
        question: texto,
        history,
        wines,
        wishes,
        preferences: user?.preferences || {},
      });
    } catch (error) {
      console.error("[sommelier:foto]", error?.message || error);
      recordError({ error, req, statusCode: 503 });
      captureException(error, { route: "POST /api/sommelier/photo" });
      return res.status(503).json({
        message: "No pude mirar la foto ahora. Probá de nuevo en un minuto.",
      });
    }

    if (!resultado) {
      return res.status(503).json({
        message: "No pude mirar la foto ahora. Probá de nuevo en un minuto.",
      });
    }

    return res.status(200).json(
      await armarRespuesta({
        req,
        resultado,
        wines,
        wishes,
        question: texto || "Foto de un menú o plato",
      })
    );
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  ask,
  askStream,
  askPhoto,
  atarPicks,
  encontrarVino,
  recipeWineDe,
  armarInventario,
  esImagenReal,
  FUERA_DE_TEMA,
};
