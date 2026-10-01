import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const api = vi.hoisted(() => ({ defaults: { baseURL: "/api" } }));
const token = vi.hoisted(() => ({ valor: "tok123" }));
vi.mock("../src/services/api", () => ({ default: api, getAuthToken: () => token.valor }));

import { preguntarEnVivo, leerEventos, SinStreaming } from "../src/services/sommelierStream";

/**
 * La respuesta escribiéndose. Lo que se prueba es lo que decide si funciona o se cae a
 * la vía normal: eventos partidos entre trozos de red, qué fallas son una respuesta del
 * servidor (el límite diario) y cuáles son "esto no se pudo transmitir, probá por la vía
 * de siempre", y que cancelar no se confunda con un fallo.
 */
const codificador = new TextEncoder();

const flujo = (trozos, { fallaAlFinal = null } = {}) => {
  let i = 0;
  return {
    getReader: () => ({
      read: async () => {
        if (i < trozos.length) return { done: false, value: codificador.encode(trozos[i++]) };
        if (fallaAlFinal) throw fallaAlFinal;
        return { done: true };
      },
    }),
  };
};

const ev = (nombre, datos) => `event: ${nombre}\ndata: ${JSON.stringify(datos)}\n\n`;

const respuestaSSE = (trozos, opciones) => ({
  ok: true,
  status: 200,
  headers: { get: () => "text/event-stream; charset=utf-8" },
  body: flujo(trozos, opciones),
});

const respuestaJson = (cuerpo, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => "application/json; charset=utf-8" },
  json: async () => cuerpo,
});

const FINAL = { status: 200, data: { answer: "Un Malbec." }, conversationId: "c1", mensajeId: "m1" };

let fetchMock;
beforeEach(() => {
  token.valor = "tok123";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("leerEventos", () => {
  it("entrega cada evento completo con su nombre y sus datos", async () => {
    const vistos = [];
    await leerEventos(flujo([ev("texto", { delta: "Un " }), ev("final", { ok: 1 })]), (n, d) => vistos.push([n, d]));
    expect(vistos).toEqual([["texto", { delta: "Un " }], ["final", { ok: 1 }]]);
  });

  it("reconstruye un evento partido entre dos trozos de red, incluso en medio de una palabra", async () => {
    const completo = ev("texto", { delta: "Hola mundo" });
    const vistos = [];
    await leerEventos(flujo([completo.slice(0, 20), completo.slice(20)]), (n, d) => vistos.push(d.delta));
    expect(vistos).toEqual(["Hola mundo"]);
  });

  it("acepta \\r\\n y deja pasar un trozo de un solo carácter", async () => {
    const crlf = ev("texto", { delta: "ñ" }).replace(/\n/g, "\r\n");
    const vistos = [];
    await leerEventos(flujo([...crlf]), (n, d) => vistos.push(d.delta));
    expect(vistos).toEqual(["ñ"]);
  });

  it("un evento que no es JSON no tira el resto", async () => {
    const vistos = [];
    await leerEventos(flujo(["event: texto\ndata: {roto\n\n", ev("texto", { delta: "ok" })]), (n, d) => vistos.push(d.delta));
    expect(vistos).toEqual(["ok"]);
  });

  it("procesa un evento final sin la línea en blanco de cierre", async () => {
    const vistos = [];
    await leerEventos(flujo(['event: final\ndata: {"x":1}']), (n, d) => vistos.push([n, d]));
    expect(vistos).toEqual([["final", { x: 1 }]]);
  });
});

describe("preguntarEnVivo", () => {
  it("pide el endpoint de streaming con el token, la pregunta y el historial recortado", async () => {
    fetchMock.mockResolvedValue(respuestaSSE([ev("final", FINAL)]));
    const largo = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", text: `m${i}`, id: i }));
    await preguntarEnVivo("¿Qué tomo?", largo, "conv9");

    const [url, opciones] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/sommelier/ask-stream");
    expect(opciones.method).toBe("POST");
    expect(opciones.headers.Authorization).toBe("Bearer tok123");
    const cuerpo = JSON.parse(opciones.body);
    expect(cuerpo.question).toBe("¿Qué tomo?");
    expect(cuerpo.conversationId).toBe("conv9");
    expect(cuerpo.history).toHaveLength(6);
    expect(Object.keys(cuerpo.history[0]).sort()).toEqual(["role", "text"]);
  });

  it("sin token no manda Authorization", async () => {
    token.valor = null;
    fetchMock.mockResolvedValue(respuestaSSE([ev("final", FINAL)]));
    await preguntarEnVivo("¿Qué tomo?");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it("entrega los pedazos por onTexto y devuelve la respuesta completa normalizada", async () => {
    fetchMock.mockResolvedValue(
      respuestaSSE([ev("texto", { delta: "Un " }), ev("texto", { delta: "Malbec." }), ev("final", FINAL)])
    );
    const deltas = [];
    const r = await preguntarEnVivo("¿Qué tomo?", [], null, { onTexto: (d) => deltas.push(d) });
    expect(deltas).toEqual(["Un ", "Malbec."]);
    expect(r).toEqual({ answer: "Un Malbec.", conversationId: "c1", mensajeId: "m1" });
  });

  it("si el final no trae conversación, conserva la que ya había", async () => {
    fetchMock.mockResolvedValue(respuestaSSE([ev("final", { status: 200, data: { answer: "x" } })]));
    const r = await preguntarEnVivo("¿Qué tomo?", [], "vieja");
    expect(r.conversationId).toBe("vieja");
    expect(r.mensajeId).toBeNull();
  });

  it("si el navegador no soporta streams, avisa que hay que usar la vía normal", async () => {
    vi.stubGlobal("ReadableStream", undefined);
    await expect(preguntarEnVivo("¿Qué tomo?")).rejects.toBeInstanceOf(SinStreaming);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("si la red falla antes de empezar, es SinStreaming (la vía normal sabe reintentar)", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(preguntarEnVivo("¿Qué tomo?")).rejects.toBeInstanceOf(SinStreaming);
  });

  it("si la sesión venció (401), es SinStreaming: axios sabe renovarla", async () => {
    fetchMock.mockResolvedValue(respuestaJson({ message: "Sesión expirada" }, 401));
    await expect(preguntarEnVivo("¿Qué tomo?")).rejects.toBeInstanceOf(SinStreaming);
  });

  it("si el servidor todavía no tiene el endpoint (404, 405, 501: un despliegue a medias), vuelve a la vía normal", async () => {
    for (const status of [404, 405, 501]) {
      fetchMock.mockResolvedValue(respuestaJson({ message: "no existe" }, status));
      await expect(preguntarEnVivo("¿Qué tomo?")).rejects.toBeInstanceOf(SinStreaming);
    }
  });

  it("el límite diario (429) NO es SinStreaming: es una respuesta, con la forma de un error de axios", async () => {
    fetchMock.mockResolvedValue(respuestaJson({ message: "Llegaste al límite" }, 429));
    const error = await preguntarEnVivo("¿Qué tomo?").catch((e) => e);
    expect(error).not.toBeInstanceOf(SinStreaming);
    expect(error.response.status).toBe(429);
    expect(error.response.data.message).toBe("Llegaste al límite");
  });

  it("un 503 previo a empezar también se propaga como respuesta", async () => {
    fetchMock.mockResolvedValue(respuestaJson({ message: "No pude pensar la respuesta" }, 503));
    const error = await preguntarEnVivo("¿Qué tomo?").catch((e) => e);
    expect(error.response.status).toBe(503);
  });

  it("si un intermediario no deja pasar streams y devuelve el JSON entero, igual funciona", async () => {
    fetchMock.mockResolvedValue(respuestaJson({ data: { answer: "Entera" }, conversationId: "c2", mensajeId: "m2" }));
    const r = await preguntarEnVivo("¿Qué tomo?");
    expect(r).toEqual({ answer: "Entera", conversationId: "c2", mensajeId: "m2" });
  });

  it("un evento `error` se propaga como respuesta con su estado", async () => {
    fetchMock.mockResolvedValue(
      respuestaSSE([ev("texto", { delta: "Con un " }), ev("error", { status: 503, message: "No pude terminar" })])
    );
    const error = await preguntarEnVivo("¿Qué tomo?").catch((e) => e);
    expect(error.response.status).toBe(503);
  });

  it("si el stream termina sin `final`, es SinStreaming: se repite por la vía normal", async () => {
    fetchMock.mockResolvedValue(respuestaSSE([ev("texto", { delta: "Con un " })]));
    await expect(preguntarEnVivo("¿Qué tomo?")).rejects.toBeInstanceOf(SinStreaming);
  });

  it("si la red se corta a mitad de camino sin final, es SinStreaming", async () => {
    fetchMock.mockResolvedValue(
      respuestaSSE([ev("texto", { delta: "Con un " })], { fallaAlFinal: new TypeError("network error") })
    );
    await expect(preguntarEnVivo("¿Qué tomo?")).rejects.toBeInstanceOf(SinStreaming);
  });

  it("si la red se corta DESPUÉS de haber recibido el final, no importa: la respuesta está", async () => {
    fetchMock.mockResolvedValue(
      respuestaSSE([ev("final", FINAL)], { fallaAlFinal: new TypeError("network error") })
    );
    const r = await preguntarEnVivo("¿Qué tomo?");
    expect(r.answer).toBe("Un Malbec.");
  });

  it("cancelar (AbortError) NO se confunde con un fallo de red: se propaga tal cual", async () => {
    const abortada = Object.assign(new Error("abortado"), { name: "AbortError" });
    fetchMock.mockRejectedValue(abortada);
    await expect(preguntarEnVivo("¿Qué tomo?")).rejects.toMatchObject({ name: "AbortError" });
  });

  it("pasa la señal de cancelación a fetch", async () => {
    fetchMock.mockResolvedValue(respuestaSSE([ev("final", FINAL)]));
    const control = new AbortController();
    await preguntarEnVivo("¿Qué tomo?", [], null, { signal: control.signal });
    expect(fetchMock.mock.calls[0][1].signal).toBe(control.signal);
  });

  it("un `final` con estado distinto de 200 es una respuesta de error", async () => {
    fetchMock.mockResolvedValue(respuestaSSE([ev("final", { status: 400, message: "Escribí tu consulta" })]));
    const error = await preguntarEnVivo("¿Qué tomo?").catch((e) => e);
    expect(error.response.status).toBe(400);
  });
});
