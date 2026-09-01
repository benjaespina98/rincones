import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";

/**
 * `utils/shareCard.js` dibuja en un <canvas> real del navegador, y jsdom (el
 * DOM que usan estos tests) no sabe renderizar canvas de verdad —
 * `getContext("2d")` devuelve `null` tal cual viene—. Así que acá se reemplaza
 * ese contexto por uno de mentira que sólo ANOTA qué se le pidió dibujar, sin
 * dibujar nada: alcanza para probar el PIPELINE (que no reviente sin foto, que
 * escriba el nombre y la bodega, que el archivo final tenga el tipo y el
 * nombre correctos) sin necesitar un canvas que sepa pintar píxeles.
 */
const crearContextoFalso = () => ({
  fillStyle: "",
  font: "",
  textAlign: "",
  textBaseline: "",
  textos: [],
  fillRect: vi.fn(),
  fillText: vi.fn(function fillText(texto) {
    this.textos.push(texto);
  }),
  measureText: vi.fn((texto) => ({ width: String(texto).length * 20 })),
  createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  drawImage: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  rect: vi.fn(),
  clip: vi.fn(),
});

let ctxFalso;

beforeEach(() => {
  ctxFalso = crearContextoFalso();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctxFalso);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function toBlob(cb, tipo) {
    cb(new Blob(["contenido-de-mentira"], { type: tipo || "image/png" }));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const { buildShareCardCanvas, buildShareCardFile, CARD_WIDTH, CARD_HEIGHT } = await import(
  "../src/utils/shareCard.js"
);

const vino = {
  name: "Saint Felicien",
  winery: "Catena Zapata",
  varietal: "Malbec",
  vintage: 2019,
  region: "Luján de Cuyo, Mendoza",
  type: "red",
  // Sin imagen: el camino que SIEMPRE tiene que andar, con o sin foto.
  image: "",
};

describe("buildShareCardCanvas", () => {
  test("mide 1080×1920 (formato historia) y no revienta sin foto de botella", async () => {
    const canvas = await buildShareCardCanvas(vino);
    expect(canvas.width).toBe(CARD_WIDTH);
    expect(canvas.height).toBe(CARD_HEIGHT);
    expect(CARD_WIDTH).toBe(1080);
    expect(CARD_HEIGHT).toBe(1920);
  });

  test("escribe la bodega y el nombre del vino", async () => {
    await buildShareCardCanvas(vino);
    expect(ctxFalso.textos).toContain("CATENA ZAPATA");
    expect(ctxFalso.textos.some((t) => t.includes("Saint Felicien"))).toBe(true);
  });

  test("el watermark de la app siempre se dibuja", async () => {
    await buildShareCardCanvas(vino);
    expect(ctxFalso.textos).toContain("Mi bodega en Rincones");
  });

  test("sin puntaje (ni de la cata ni del vino), no dibuja estrellas", async () => {
    await buildShareCardCanvas({ ...vino, rating: 0 }, null);
    // Las estrellas dibujan el mismo glifo dos veces (apagadas + doradas); sin
    // puntaje, ese texto no debería aparecer nunca.
    expect(ctxFalso.textos.some((t) => t.includes("★"))).toBe(false);
  });

  test("con puntaje del vino, dibuja las estrellas", async () => {
    await buildShareCardCanvas({ ...vino, rating: 4 });
    expect(ctxFalso.textos.some((t) => t.includes("★"))).toBe(true);
  });

  test("la cata (moment) manda sobre el puntaje del vino, y suma su reseña", async () => {
    await buildShareCardCanvas(
      { ...vino, rating: 2 },
      { rating: 5, notes: "Un lujo total" }
    );
    expect(ctxFalso.textos.some((t) => t.includes("★"))).toBe(true);
    expect(ctxFalso.textos.some((t) => t.includes("Un lujo total"))).toBe(true);
  });
});

// La otra mitad de "una imagen que no carga no frena el resto de la ficha"
// —con una URL real que responde con error— necesita que `<img>` dispare
// `onerror`, y jsdom no carga recursos por default: simularlo exigiría
// prender la carga de red en el entorno de test, que es peor que no probarlo.
// El camino "sin foto" (arriba, con `image: ""`) ejercita la MISMA rama del
// código —`cargarImagen` rechaza y el dibujo sigue sin ella— sin ese problema.

describe("buildShareCardFile", () => {
  test("arma un File de JPEG con el nombre del vino en el slug", async () => {
    const file = await buildShareCardFile(vino);
    expect(file).toBeInstanceOf(File);
    expect(file.type).toBe("image/jpeg");
    expect(file.name).toMatch(/^rincones-.*saint.*felicien.*\.jpg$/i);
  });

  test("sin nombre de vino, igual arma un archivo válido (no revienta)", async () => {
    const file = await buildShareCardFile({});
    expect(file).toBeInstanceOf(File);
    expect(file.name).toMatch(/^rincones-.*\.jpg$/i);
  });
});
