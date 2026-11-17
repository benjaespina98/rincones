import { describe, it, expect } from "vitest";
import { mensajeDelServidor } from "../src/utils/mensajeDelServidor";

const err = (status, data) => ({ response: { status, data } });

describe("mensajeDelServidor", () => {
  it("un 4xx con mensaje lo muestra tal cual (error o message)", () => {
    expect(mensajeDelServidor(err(400, { error: "La cosecha tiene que ser un año entre 1900 y 2027" }), "x")).toMatch(/cosecha/);
    expect(mensajeDelServidor(err(403, { message: "La contraseña no es correcta" }), "x")).toBe("La contraseña no es correcta");
  });

  it("un 5xx, una caída de red o un cuerpo sin texto usan el respaldo", () => {
    expect(mensajeDelServidor(err(500, { error: "stack interno" }), "respaldo")).toBe("respaldo");
    expect(mensajeDelServidor({ message: "Network Error" }, "respaldo")).toBe("respaldo");
    expect(mensajeDelServidor(err(400, {}), "respaldo")).toBe("respaldo");
    expect(mensajeDelServidor(err(400, { error: "   " }), "respaldo")).toBe("respaldo");
    expect(mensajeDelServidor(null, "respaldo")).toBe("respaldo");
  });

  it("si vienen los dos textos gana message; si message no es texto, se usa error", () => {
    expect(mensajeDelServidor(err(400, { message: "A", error: "B" }), "x")).toBe("A");
    expect(mensajeDelServidor(err(400, { message: 5, error: "B" }), "x")).toBe("B");
    expect(mensajeDelServidor(err(400, { message: 5 }), "respaldo")).toBe("respaldo");
  });
});
