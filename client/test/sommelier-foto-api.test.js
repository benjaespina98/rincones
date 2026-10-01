import { describe, it, expect, vi, beforeEach } from "vitest";

const api = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock("../src/services/api", () => ({ default: api }));

import { preguntarConFoto } from "../src/services/sommelierApi";

/**
 * La foto va como multipart: la imagen NO se codifica a texto (pesaría un tercio más)
 * y el servidor la descarta apenas la procesa. Lo que se prueba es el contrato: qué
 * campos viajan, con cuánto tiempo, y que la respuesta se normaliza como la de una
 * pregunta escrita.
 */
const FOTO = new File([new Uint8Array([1, 2, 3])], "carta.jpg", { type: "image/jpeg" });

beforeEach(() => {
  api.post.mockReset().mockResolvedValue({
    data: { data: { answer: "Un Malbec." }, conversationId: "c1", mensajeId: "m1" },
  });
});

const formEnviado = () => api.post.mock.calls[0][1];

describe("preguntarConFoto", () => {
  it("manda un multipart a /sommelier/photo con la imagen y con más tiempo que una pregunta", async () => {
    await preguntarConFoto(FOTO);
    const [url, form, opciones] = api.post.mock.calls[0];
    expect(url).toBe("/sommelier/photo");
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("file")).toBeInstanceOf(File);
    expect(form.get("file").name).toBe("carta.jpg");
    // Mirar una imagen tarda más que leer una frase.
    expect(opciones.timeout).toBeGreaterThanOrEqual(30000);
  });

  it("lleva el texto y la conversación sólo si existen", async () => {
    await preguntarConFoto(FOTO);
    expect(formEnviado().has("question")).toBe(false);
    expect(formEnviado().has("conversationId")).toBe(false);

    api.post.mockClear();
    await preguntarConFoto(FOTO, { question: "¿Qué pido con mi Malbec?", conversationId: "abc" });
    expect(formEnviado().get("question")).toBe("¿Qué pido con mi Malbec?");
    expect(formEnviado().get("conversationId")).toBe("abc");
  });

  it("el historial viaja recortado a los últimos turnos y sin campos de más", async () => {
    const largo = Array.from({ length: 12 }, (_, i) => ({
      role: i % 2 ? "assistant" : "user",
      text: `mensaje ${i}`,
      id: `m${i}`,
      wines: [{ name: "no tiene que viajar" }],
    }));
    await preguntarConFoto(FOTO, { history: largo });
    const historial = JSON.parse(formEnviado().get("history"));
    expect(historial).toHaveLength(6);
    expect(historial[0]).toEqual({ role: "user", text: "mensaje 6" });
    expect(Object.keys(historial[0]).sort()).toEqual(["role", "text"]);
  });

  it("un Blob sin nombre se manda como foto.jpg", async () => {
    await preguntarConFoto(new Blob([new Uint8Array([1])], { type: "image/jpeg" }));
    expect(formEnviado().get("file").name).toBe("foto.jpg");
  });

  it("normaliza la respuesta como una pregunta escrita: con la conversación y el id del mensaje", async () => {
    const r = await preguntarConFoto(FOTO, { conversationId: "vieja" });
    expect(r).toEqual({ answer: "Un Malbec.", conversationId: "c1", mensajeId: "m1" });
  });

  it("si el servidor no devuelve conversación, conserva la que ya había", async () => {
    api.post.mockResolvedValue({ data: { data: { answer: "Hola" } } });
    const r = await preguntarConFoto(FOTO, { conversationId: "vieja" });
    expect(r.conversationId).toBe("vieja");
    expect(r.mensajeId).toBeNull();
  });

  it("sin datos en la respuesta devuelve null, y un error de red se propaga", async () => {
    api.post.mockResolvedValue({ data: {} });
    expect(await preguntarConFoto(FOTO)).toBeNull();
    api.post.mockRejectedValue(new Error("red"));
    await expect(preguntarConFoto(FOTO)).rejects.toThrow("red");
  });
});
