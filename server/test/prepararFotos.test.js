const test = require("node:test");
const assert = require("node:assert/strict");
const { archivoSugerido, vinosDelCatalogo, armarManifest, evaluarCarpeta } = require("../src/utils/prepararFotos");
const { poolKey } = require("../src/data/wineIdentity");

/**
 * Preparar un lote de fotos reales: el manifest con todo el catálogo y la revisión de la carpeta antes de
 * importarla. Lógica pura: nada de esto toca la base ni la red.
 */

/** Un PNG mínimo con el ancho y el alto que pidas: alcanza para que la cabecera se lea (no se decodifica). */
const png = (width, height, relleno = 0) => {
  const b = Buffer.alloc(40 + relleno);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "latin1");
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
};

const VINO = { archivo: "a.png", nombre: "Catena Malbec", bodega: "Catena Zapata", varietal: "Malbec" };

test("el nombre de archivo sugerido no lleva tildes, espacios ni mayúsculas", () => {
  assert.equal(archivoSugerido({ winery: "Viñas de Balbo", name: "Ñandú Reserva", varietal: "Cabernet Franc" }), "vinas-de-balbo_nandu-reserva_cabernet-franc.jpg");
  assert.equal(archivoSugerido({ winery: "Rutini", name: "Trumpeter", varietal: "" }), "rutini_trumpeter.jpg");
});

test("el catálogo sale una sola vez por vino y con claves distintas", () => {
  const vinos = vinosDelCatalogo();
  assert.ok(vinos.length > 100, `hay catálogo: ${vinos.length}`);
  assert.equal(new Set(vinos.map((v) => v.key)).size, vinos.length);
});

test("el manifest tiene la cabecera que espera el importador y una fila por vino, con nombres de archivo únicos", () => {
  const filas = armarManifest().trim().split("\n");
  assert.equal(filas[0], "archivo;nombre;bodega;varietal");
  assert.equal(filas.length - 1, vinosDelCatalogo().length);
  assert.ok(filas.slice(1).every((l) => l.split(";").length === 4), "ninguna fila rompe el separador");
  const archivos = filas.slice(1).map((l) => l.split(";")[0]);
  // Hay vinos que sólo difieren en la clave (no en el nombre del archivo): el sugerido puede repetirse, pero casi nunca.
  assert.ok(new Set(archivos).size > archivos.length * 0.97);
});

test("un punto y coma o un salto de línea en un nombre no parte la fila", () => {
  const m = armarManifest([{ name: "Gran; Reserva\nEspecial", winery: "Bodega X", varietal: "Malbec", key: "k" }]).trim().split("\n");
  assert.equal(m.length, 2);
  assert.equal(m[1].split(";").length, 4);
});

test("una foto buena, de un vino del catálogo, vertical y grande, queda ok y sin avisos", () => {
  const catalogo = [{ ...VINO, key: poolKey("Catena Malbec", "Catena Zapata", "Malbec") }];
  const r = evaluarCarpeta([{ fila: 2, ...VINO }], new Map([["a.png", png(900, 1400)]]), catalogo);
  assert.equal(r.ok.length, 1);
  assert.deepEqual(r.errores, []);
  assert.deepEqual(r.avisos, []);
});

test("lo que no es una foto, o es HEIC, es un error", () => {
  const catalogo = [{ ...VINO, key: poolKey(VINO.nombre, VINO.bodega, VINO.varietal) }];
  const falso = evaluarCarpeta([{ fila: 2, ...VINO }], new Map([["a.png", Buffer.from("esto no es una imagen, es texto")]]), catalogo);
  assert.match(falso.errores[0].motivo, /no es una imagen/);
  const heic = Buffer.alloc(40);
  heic.write("ftyp", 4, "latin1");
  heic.write("heic", 8, "latin1");
  const h = evaluarCarpeta([{ fila: 2, ...VINO }], new Map([["a.png", heic]]), catalogo);
  assert.match(h.errores[0].motivo, /HEIC/);
});

test("avisa (sin bloquear) de baja resolución, foto horizontal, peso y vinos fuera del catálogo", () => {
  const catalogo = [{ ...VINO, key: poolKey(VINO.nombre, VINO.bodega, VINO.varietal) }];
  const chica = evaluarCarpeta([{ fila: 2, ...VINO }], new Map([["a.png", png(300, 400)]]), catalogo);
  assert.equal(chica.ok.length, 1);
  assert.match(chica.avisos[0].motivo, /baja resolución/);

  const ancha = evaluarCarpeta([{ fila: 2, ...VINO }], new Map([["a.png", png(1400, 900)]]), catalogo);
  assert.match(ancha.avisos[0].motivo, /horizontal/);

  const pesada = evaluarCarpeta([{ fila: 2, ...VINO }], new Map([["a.png", png(900, 1400, 4 * 1024 * 1024)]]), catalogo);
  assert.match(pesada.avisos[0].motivo, /pesa/);

  const ajeno = evaluarCarpeta([{ fila: 2, archivo: "a.png", nombre: "Vino Inventado", bodega: "Bodega Fantasma", varietal: "Malbec" }], new Map([["a.png", png(900, 1400)]]), catalogo);
  assert.match(ajeno.avisos[0].motivo, /no coincide con ningún vino del catálogo/);
});

test("dos fotos para el mismo vino: la segunda es un error", () => {
  const catalogo = [{ ...VINO, key: poolKey(VINO.nombre, VINO.bodega, VINO.varietal) }];
  const filas = [
    { fila: 2, ...VINO },
    { fila: 3, ...VINO, archivo: "b.png" },
  ];
  const r = evaluarCarpeta(filas, new Map([["a.png", png(900, 1400)], ["b.png", png(900, 1400)]]), catalogo);
  assert.equal(r.ok.length, 1);
  assert.match(r.errores[0].motivo, /ya hay otra foto/);
  assert.equal(r.errores[0].fila, 3);
});

test("las filas sin archivo son lo que falta cargar (no un error) y los archivos sueltos se listan", () => {
  const catalogo = [{ ...VINO, key: poolKey(VINO.nombre, VINO.bodega, VINO.varietal) }];
  const r = evaluarCarpeta(
    [{ fila: 2, ...VINO }, { fila: 3, archivo: "falta.jpg", nombre: "Otro", bodega: "Otra", varietal: "" }],
    new Map([["a.png", png(900, 1400)], ["suelta.jpg", png(900, 1400)], ["notas.txt", Buffer.from("x")], ["manifest.csv", Buffer.from("x")]]),
    catalogo
  );
  assert.equal(r.sinFoto, 1);
  assert.deepEqual(r.errores, []);
  assert.deepEqual(r.sinFila, ["suelta.jpg"], "sólo imágenes, y sin el manifest");
});
