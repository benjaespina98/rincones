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

export const preguntarAlSommelier = async (question, history = []) => {
  const { data } = await api.post("/sommelier/ask", {
    question,
    history: history.slice(-TURNOS * 2).map((m) => ({ role: m.role, text: m.text })),
  });
  return data?.data || null;
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
  if (status === 429) return delServer || "Por hoy llegaste al límite de consultas.";
  if (status === 503) return delServer || "No pude pensar la respuesta ahora. Probá de nuevo en un minuto.";
  if (!error?.response) return "Parece que te quedaste sin conexión. Probá de nuevo.";
  return delServer || "Algo falló al buscar la respuesta. Probá de nuevo.";
};
