import api from "./api";

/**
 * La guía de vino.
 *
 * ── QUÉ SE MANDA Y QUÉ NO ───────────────────────────────────────────────────
 * Sólo la pregunta y los últimos turnos. La bodega NO viaja desde acá: la lee
 * el server, que ya la tiene indexada por usuario y puede resumirla en unas
 * pocas líneas. Mandarla desde el navegador significaría bajar la colección
 * entera para volver a subirla en cada pregunta — el mismo dato, dos veces por
 * la red, en el dispositivo que paga los datos.
 *
 * El recorte del historial se hace en los DOS lados. Acá para no mandar de más;
 * allá porque el largo del prompt es el costo de cada consulta y eso no puede
 * depender de que el cliente se porte bien.
 */
const TURNOS = 3;

/**
 * ── POR QUÉ ESTE PEDIDO TIENE SU PROPIO TIMEOUT ─────────────────────────────
 *
 * El resto de la app usa el de `api.js` (12s), pero el propio `BUDGET_MS` del
 * server para esta pregunta subió a 20s (ver el comentario grande en
 * sommelier.service.js: "no pude pensar la respuesta ahora" salía seguido con
 * la red andando bien, porque el presupuesto viejo de 12s no dejaba margen
 * para el jitter normal). Con el mismo número de los dos lados, el cliente
 * corta la espera en la línea de llegada, justo cuando el server todavía está
 * terminando — reproducido en vivo con el número anterior: "Parece que te
 * quedaste sin conexión" varias veces seguidas con la red andando bien,
 * porque un timeout de axios no trae `error.response` y `mensajeDeError` lo
 * confunde con eso. 25s deja el mismo margen real (5s) sobre el peor caso del
 * server que tenía antes, ahora sobre el número nuevo.
 */
const TIMEOUT_MS = 25000;

/**
 * `opciones.regenerar` pide "otra opción" para una respuesta que ya se leyó:
 *   · `evitar`: el texto de esa respuesta, para que el modelo no la repita;
 *   · `reemplazaMensajeId`: el mensaje del historial que se reemplaza en su lugar.
 */
export const preguntarAlSommelier = async (
  question,
  history = [],
  conversationId = null,
  opciones = {}
) => {
  const { data } = await api.post(
    "/sommelier/ask",
    {
      question,
      history: history.slice(-TURNOS * 2).map((m) => ({ role: m.role, text: m.text })),
      /* El id de la charla, para que esta pregunta se agregue a la que ya venía
         en vez de abrir una nueva. Nulo en la primera: lo crea el server y lo
         devuelve acá abajo. */
      conversationId,
      ...(opciones.regenerar
        ? {
            regenerar: true,
            evitar: opciones.evitar || "",
            reemplazaMensajeId: opciones.reemplazaMensajeId || "",
          }
        : {}),
    },
    { timeout: TIMEOUT_MS }
  );
  // El id viaja al lado de la respuesta, no adentro: `data.data` es lo que la
  // guía contestó, y el id es de la conversación que lo contiene.
  return data?.data
    ? {
        ...data.data,
        conversationId: data.conversationId || conversationId,
        // El id del mensaje del asistente: el pulgar y "otra opción" apuntan a él.
        mensajeId: data.mensajeId || null,
      }
    : null;
};

/**
 * El historial de charlas.
 *
 * Tres funciones finitas y sin estado propio: la pantalla decide cuándo
 * pedirlas. No hay caché acá porque el historial cambia con cada pregunta que
 * se hace, y una lista de treinta títulos es barata de volver a traer.
 */
export const listarConversaciones = async () => {
  const { data } = await api.get("/sommelier/conversations");
  return data?.data || [];
};

export const traerConversacion = async (id) => {
  const { data } = await api.get(`/sommelier/conversations/${id}`);
  return data?.data || null;
};

/**
 * Una foto de la carta de un restaurante, de un plato o de una botella.
 *
 * Va como multipart (la imagen NO se codifica a texto: pesaría un tercio más) con el
 * texto opcional y el historial reciente. La respuesta tiene la misma forma que la de
 * `preguntarAlSommelier`. La imagen la reduce antes quien llama (ver `resizeImage`); el
 * servidor la descarta apenas la procesa.
 *
 * Más tiempo que una pregunta escrita: mirar una imagen tarda más que leer una frase.
 */
const FOTO_TIMEOUT_MS = 40000;

export const preguntarConFoto = async (
  blob,
  { question = "", history = [], conversationId = null } = {}
) => {
  const form = new FormData();
  form.append("file", blob, blob?.name || "foto.jpg");
  if (question) form.append("question", question);
  if (conversationId) form.append("conversationId", conversationId);
  form.append(
    "history",
    JSON.stringify(history.slice(-TURNOS * 2).map((m) => ({ role: m.role, text: m.text })))
  );

  const { data } = await api.post("/sommelier/photo", form, { timeout: FOTO_TIMEOUT_MS });
  return data?.data
    ? {
        ...data.data,
        conversationId: data.conversationId || conversationId,
        mensajeId: data.mensajeId || null,
      }
    : null;
};

/** El pulgar sobre una respuesta: "up", "down" o null para quitarlo. */
export const enviarFeedback = async (conversationId, mensajeId, valor) => {
  await api.patch(`/sommelier/conversations/${conversationId}/feedback`, { mensajeId, valor });
  return true;
};

export const borrarConversacion = async (id) => {
  await api.delete(`/sommelier/conversations/${id}`);
  return true;
};

/** Todo el historial de quien pide. Devuelve cuántas se borraron. */
export const borrarTodasLasConversaciones = async () => {
  const { data } = await api.delete("/sommelier/conversations");
  return data?.data?.borradas ?? 0;
};

/**
 * Traduce un error de la consulta a lo que hay que mostrar en la burbuja.
 *
 * Los tres casos son distintos para la persona y hasta ahora se veían iguales:
 * "llegaste al límite" no es lo mismo que "el modelo está caído" ni que "no hay
 * internet", y el único que puede hacer algo al respecto es quien lee. El texto
 * del server manda cuando lo hay — es el que sabe cuál de sus dos límites se
 * tocó.
 */
export const mensajeDeError = (error) => {
  const status = error?.response?.status;
  const delServer = error?.response?.data?.message;
  if (status === 429) return delServer || "Llegaste al límite de consultas de hoy. Se renueva mañana.";
  if (status === 503) return delServer || "El Sommelier no responde ahora. Probá de nuevo en unos minutos.";
  // Un timeout de axios (`ECONNABORTED`) tampoco trae `error.response`, igual
  // que una caída de red de verdad — pero para quien lee son dos cosas muy
  // distintas: una dice "revisá tu conexión" y la otra "esperá un toque más".
  // Sin distinguirlas, alguien con la red perfecta se queda buscando el wifi.
  if (error?.code === "ECONNABORTED") return "La respuesta tarda más de lo normal. Probá de nuevo.";
  if (!error?.response) return "Sin conexión. Probá de nuevo.";
  return delServer || "No se pudo responder. Probá de nuevo.";
};
