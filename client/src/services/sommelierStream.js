import api, { getAuthToken } from "./api";

/**
 * La respuesta del Sommelier escribiéndose, como en los chats de IA.
 *
 * ── POR QUÉ `fetch` Y NO `axios` ────────────────────────────────────────────
 * En el navegador axios espera a tener el cuerpo ENTERO antes de entregarlo: no hay
 * forma de leerlo de a pedazos. `fetch` sí (`response.body.getReader()`).
 *
 * ── EL PROTOCOLO (ver `askStream` en el servidor) ───────────────────────────
 *   texto   { delta }               un pedazo más de la respuesta.
 *   final   { status, ...cuerpo }   el mismo cuerpo que devuelve la vía normal.
 *   error   { status, message }     falló DESPUÉS de empezar a escribir.
 *
 * ── CUÁNDO SE VUELVE A LA VÍA NORMAL ────────────────────────────────────────
 * El streaming es una mejora, no un requisito: si algo no lo permite (el navegador no
 * lo soporta, la red falla antes de empezar, la sesión venció y hay que renovarla, o
 * el stream se cortó sin traer el final), se lanza SinStreaming y quien llama repite
 * la consulta con preguntarAlSommelier, que sabe renovar la sesión y reintentar. Un error
 * del servidor que SÍ es una respuesta (el límite diario, un 503) se propaga como lo haría
 * axios, con error.response.status, para que el mensaje al usuario sea el mismo.
 */
export class SinStreaming extends Error {
  constructor(motivo = "sin-streaming") {
    super(motivo);
    this.name = "SinStreaming";
  }
}

const TURNOS = 3;

/** Un error con la forma que ya espera `mensajeDeError` (la de axios). */
const errorHttp = (status, cuerpo) => {
  const error = new Error(cuerpo?.message || `HTTP ${status}`);
  error.response = { status, data: cuerpo };
  return error;
};

/**
 * Lee un cuerpo SSE y llama a `alEvento(nombre, datos)` por cada evento completo.
 *
 * Los eventos vienen separados por una línea en blanco y pueden llegar partidos entre dos
 * trozos de red, así que se acumula hasta tener el separador. Acepta \n y \r\n. Una línea
 * `data:` que no es JSON se ignora: un evento roto no tira el resto.
 */
export const leerEventos = async (cuerpo, alEvento) => {
  const lector = cuerpo.getReader();
  const decodificador = new TextDecoder();
  let pendiente = "";

  const procesar = (bloque) => {
    let nombre = "message";
    const datos = [];
    for (const linea of bloque.split("\n")) {
      if (linea.startsWith("event:")) nombre = linea.slice(6).trim();
      else if (linea.startsWith("data:")) datos.push(linea.slice(5).trim());
    }
    if (datos.length === 0) return;
    try {
      alEvento(nombre, JSON.parse(datos.join("\n")));
    } catch {
      // Un evento que no es JSON no tira el resto.
    }
  };

  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    pendiente += decodificador.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    let corte;
    while ((corte = pendiente.indexOf("\n\n")) >= 0) {
      procesar(pendiente.slice(0, corte));
      pendiente = pendiente.slice(corte + 2);
    }
  }
  if (pendiente.trim()) procesar(pendiente);
};

const normalizar = (cuerpo, conversationId) =>
  cuerpo?.data
    ? {
        ...cuerpo.data,
        conversationId: cuerpo.conversationId || conversationId,
        mensajeId: cuerpo.mensajeId || null,
      }
    : null;

/**
 * Pregunta con la respuesta escribiéndose. `onTexto(delta)` recibe cada pedazo nuevo;
 * la promesa devuelve la misma forma que `preguntarAlSommelier`.
 */
export const preguntarEnVivo = async (
  question,
  history = [],
  conversationId = null,
  { onTexto, signal } = {}
) => {
  if (typeof fetch !== "function" || typeof ReadableStream === "undefined") {
    throw new SinStreaming("no-soportado");
  }

  const token = getAuthToken();
  let respuesta;
  try {
    respuesta = await fetch(`${api.defaults.baseURL}/sommelier/ask-stream`, {
      method: "POST",
      credentials: "include",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        question,
        history: history.slice(-TURNOS * 2).map((m) => ({ role: m.role, text: m.text })),
        conversationId,
      }),
    });
  } catch (error) {
    // Si la persona se fue, no hay nada que reintentar; si fue la red, la vía normal sabe qué hacer.
    if (error?.name === "AbortError") throw error;
    throw new SinStreaming("red");
  }

  // La sesión venció: axios sabe renovarla y reintentar, esto no.
  if (respuesta.status === 401) throw new SinStreaming("sesion");

  const tipo = respuesta.headers.get("content-type") || "";
  if (!respuesta.ok || !tipo.includes("text/event-stream")) {
    // Un JSON común: un error previo a empezar (el límite diario, un 400) o un intermediario
    // que no deja pasar streams y devolvió la respuesta entera.
    const cuerpo = await respuesta.json().catch(() => null);
    if (!respuesta.ok) throw errorHttp(respuesta.status, cuerpo);
    const normalizada = normalizar(cuerpo, conversationId);
    if (!normalizada) throw new SinStreaming("respuesta-vacia");
    return normalizada;
  }

  let final = null;
  let falla = null;
  try {
    await leerEventos(respuesta.body, (nombre, datos) => {
      if (nombre === "texto") onTexto?.(datos.delta || "");
      else if (nombre === "final") final = datos;
      else if (nombre === "error") falla = datos;
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    // Se cortó la red a mitad de camino: si no llegó el final, la vía normal lo repite.
    if (!final) throw new SinStreaming("cortado");
  }

  if (falla) throw errorHttp(falla.status || 503, falla);
  if (!final) throw new SinStreaming("sin-final");
  if (final.status && final.status !== 200) throw errorHttp(final.status, final);

  const normalizada = normalizar(final, conversationId);
  if (!normalizada) throw new SinStreaming("respuesta-vacia");
  return normalizada;
};
