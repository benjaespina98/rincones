import { describe, it, expect, beforeEach, afterEach } from "vitest";
import api from "../src/services/api";

/** La sesión vive en cookies: el cliente no guarda ni manda ningún token. */
describe("sesión sólo en cookies", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    api.defaults.adapter = undefined;
  });

  const responder = (data, visto) => async (config) => {
    visto?.push(config);
    return { status: 200, data, headers: {}, config };
  };

  it("cada pedido lleva la cabecera propia, las credenciales y ningún Authorization", async () => {
    const visto = [];
    api.defaults.adapter = responder({}, visto);
    await api.post("/wines", {});

    expect(visto[0].headers["X-Requested-With"]).toBe("rincones");
    expect(visto[0].headers.Authorization).toBeUndefined();
    expect(visto[0].withCredentials).toBe(true);
  });

  it("al abrir sesión guarda sólo cuándo vence, aunque el server mandara un token", async () => {
    api.defaults.adapter = responder({ data: { user: {}, duraMs: 900_000, token: "no-guardar" } });
    const antes = Date.now();
    await api.post("/auth/login", {});

    const expira = Number(localStorage.getItem("rincones_expira"));
    expect(expira).toBeGreaterThanOrEqual(antes + 900_000);
    expect(expira).toBeLessThanOrEqual(Date.now() + 900_000);
    expect(Object.values({ ...localStorage }).join()).not.toContain("no-guardar");
  });

  it("varios pedidos con la sesión vencida comparten una sola renovación", async () => {
    localStorage.setItem("rincones_expira", "1");
    const visto = [];
    api.defaults.adapter = responder({ data: { duraMs: 900_000 } }, visto);
    await Promise.all([api.get("/wines"), api.get("/wishes"), api.get("/users/stats")]);

    expect(visto.filter((c) => c.url === "/auth/refresh")).toHaveLength(1);
  });

  it("con la sesión vencida renueva antes de mandar el pedido", async () => {
    localStorage.setItem("rincones_expira", "1");
    const visto = [];
    api.defaults.adapter = responder({ data: { duraMs: 900_000 } }, visto);
    await api.get("/wines");

    expect(visto.map((c) => c.url)).toEqual(["/auth/refresh", "/wines"]);
  });
});
