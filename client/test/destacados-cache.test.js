import { describe, it, expect, vi, beforeEach } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../src/services/api", () => ({ default: { get } }));

const { getFeaturedWines, invalidarDestacados } = await import("../src/services/wineSearchApi");

const SET = [{ id: "a", name: "Vino a" }, { id: "b", name: "Vino b" }];
const respuesta = (lista) => Promise.resolve({ data: { data: lista } });

beforeEach(() => {
  get.mockReset();
  get.mockImplementation(() => respuesta(SET));
  localStorage.clear();
  sessionStorage.clear();
});

describe("destacados: el set sobrevive al cierre de la app", () => {
  it("el primer arranque pega a la red y el segundo lo lee guardado, sin esperar", async () => {
    expect(await getFeaturedWines("u1")).toEqual(SET);
    expect(get).toHaveBeenCalledTimes(1);
    // Otro arranque en frío: el storage persiste, el módulo en memoria no importa.
    expect(await getFeaturedWines("u1")).toEqual(SET);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("otra persona en el mismo navegador no recibe el set de la primera", async () => {
    await getFeaturedWines("u1");
    get.mockImplementation(() => respuesta([{ id: "z", name: "Vino z" }]));
    expect(await getFeaturedWines("u2")).toEqual([{ id: "z", name: "Vino z" }]);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("no guarda una lista vacía: un fallo puntual no deja la home sin recomendación todo el día", async () => {
    get.mockImplementation(() => respuesta([]));
    await getFeaturedWines("u1");
    get.mockImplementation(() => respuesta(SET));
    expect(await getFeaturedWines("u1")).toEqual(SET);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("invalidar tira el set de todas las personas y se vuelve a pedir", async () => {
    await getFeaturedWines("u1");
    invalidarDestacados();
    expect(Object.keys(localStorage).filter((k) => k.startsWith("rincones_featured"))).toEqual([]);
    await getFeaturedWines("u1");
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("al guardar limpia lo de días anteriores y de otras personas", async () => {
    localStorage.setItem("rincones_featured_u1_2020-01-01", JSON.stringify(SET));
    localStorage.setItem("rincones_featured_u9_2020-01-01", JSON.stringify(SET));
    await getFeaturedWines("u1");
    const claves = Object.keys(localStorage).filter((k) => k.startsWith("rincones_featured"));
    expect(claves).toHaveLength(1);
    expect(claves[0]).toMatch(/^rincones_featured_u1_/);
  });

  it("un valor corrupto en el storage no rompe: se pide por red", async () => {
    await getFeaturedWines("u1");
    const clave = Object.keys(localStorage).find((k) => k.startsWith("rincones_featured"));
    localStorage.setItem(clave, "{esto no es json");
    expect(await getFeaturedWines("u1")).toEqual(SET);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("el formato viejo de sessionStorage también se limpia al invalidar", () => {
    sessionStorage.setItem("rincones_featured_2020-01-01", JSON.stringify(SET));
    invalidarDestacados();
    expect(sessionStorage.getItem("rincones_featured_2020-01-01")).toBeNull();
  });

  it("vive en localStorage y no en sessionStorage: es lo que sobrevive a un arranque en frío", async () => {
    await getFeaturedWines("u1");
    expect(Object.keys(localStorage).some((k) => k.startsWith("rincones_featured"))).toBe(true);
    expect(Object.keys(sessionStorage).some((k) => k.startsWith("rincones_featured"))).toBe(false);
  });

  it("vence: lo guardado hace más de seis horas se vuelve a pedir", async () => {
    await getFeaturedWines("u1");
    const clave = Object.keys(localStorage).find((k) => k.startsWith("rincones_featured"));
    const guardado = JSON.parse(localStorage.getItem(clave));
    localStorage.setItem(clave, JSON.stringify({ ...guardado, t: Date.now() - 7 * 60 * 60 * 1000 }));
    await getFeaturedWines("u1");
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("sin saber de quién es el set no lee ni guarda nada", async () => {
    await getFeaturedWines("");
    await getFeaturedWines("");
    expect(get).toHaveBeenCalledTimes(2);
    expect(Object.keys(localStorage).filter((k) => k.startsWith("rincones_featured"))).toEqual([]);
  });

  it("guarda sin las fotos subidas desde el teléfono, que pesarían cientos de KB cada una", async () => {
    const pesada = "data:image/jpeg;base64," + "A".repeat(50000);
    get.mockImplementation(() =>
      respuesta([
        { id: "a", name: "Vino a", image: pesada },
        { id: "b", name: "Vino b", image: "https://res.cloudinary.com/x/image/upload/b.jpg" },
      ])
    );
    await getFeaturedWines("u1");
    const clave = Object.keys(localStorage).find((k) => k.startsWith("rincones_featured"));
    expect(localStorage.getItem(clave).length).toBeLessThan(2000);
    const guardado = await getFeaturedWines("u1");
    expect(guardado[0].image).toBe("");
    expect(guardado[1].image).toBe("https://res.cloudinary.com/x/image/upload/b.jpg");
  });

  it("si el storage está lleno, devuelve el set de la red sin romper", async () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException("cuota", "QuotaExceededError");
    };
    try {
      expect(await getFeaturedWines("u1")).toEqual(SET);
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
