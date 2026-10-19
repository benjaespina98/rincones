const test = require("node:test");
const assert = require("node:assert/strict");
const { detectarImagen, validarImagen } = require("../src/utils/imagenCabecera");
const { analyzeLabel } = require("../src/controllers/labels.controller");

/** Cabeceras mínimas, armadas a mano: alcanzan para lo que mira el validador. */
const png = (w, h) => {
  const b = Buffer.alloc(40);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.write("IHDR", 12, "latin1");
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
};

const jpeg = (w, h, { conExif = true } = {}) => {
  const partes = [Buffer.from([0xff, 0xd8])];
  if (conExif) {
    const app1 = Buffer.alloc(2 + 2 + 10);
    app1[0] = 0xff;
    app1[1] = 0xe1;
    app1.writeUInt16BE(12, 2);
    partes.push(app1);
  }
  const sof = Buffer.alloc(2 + 2 + 6 + 3);
  sof[0] = 0xff;
  sof[1] = 0xc0;
  sof.writeUInt16BE(11, 2);
  sof[4] = 8;
  sof.writeUInt16BE(h, 5);
  sof.writeUInt16BE(w, 7);
  partes.push(sof, Buffer.alloc(16));
  return Buffer.concat(partes);
};

const webpVp8x = (w, h) => {
  const b = Buffer.alloc(40);
  b.write("RIFF", 0, "latin1");
  b.write("WEBP", 8, "latin1");
  b.write("VP8X", 12, "latin1");
  b.writeUIntLE(w - 1, 24, 3);
  b.writeUIntLE(h - 1, 27, 3);
  return b;
};

const heic = (w, h) => {
  const b = Buffer.alloc(64);
  b.writeUInt32BE(24, 0);
  b.write("ftyp", 4, "latin1");
  b.write("heic", 8, "latin1");
  b.write("ispe", 32, "latin1");
  b.writeUInt32BE(w, 40);
  b.writeUInt32BE(h, 44);
  return b;
};

test("reconoce JPEG, PNG, WebP y HEIC por su contenido y lee las dimensiones", () => {
  assert.deepEqual(detectarImagen(jpeg(2000, 1500)), { type: "jpeg", mime: "image/jpeg", width: 2000, height: 1500 });
  assert.deepEqual(detectarImagen(jpeg(640, 480, { conExif: false })), { type: "jpeg", mime: "image/jpeg", width: 640, height: 480 });
  assert.deepEqual(detectarImagen(png(1200, 1600)), { type: "png", mime: "image/png", width: 1200, height: 1600 });
  assert.deepEqual(detectarImagen(webpVp8x(1000, 800)), { type: "webp", mime: "image/webp", width: 1000, height: 800 });
  assert.deepEqual(detectarImagen(heic(3024, 4032)), { type: "heic", mime: "image/heic", width: 3024, height: 4032 });
});

test("un archivo que no es imagen no pasa, diga lo que diga su mimetype", () => {
  assert.equal(detectarImagen(Buffer.from("<html><script>alert(1)</script></html>")), null);
  assert.equal(detectarImagen(Buffer.from("%PDF-1.7 ".repeat(10))), null);
  assert.equal(detectarImagen(Buffer.alloc(0)), null);
  assert.equal(detectarImagen(null), null);
  assert.equal(validarImagen(Buffer.from("MZ".repeat(40))).motivo, "formato");
});

test("una cabecera truncada no rompe: es 'sin dimensiones' o no es imagen, nunca una excepción", () => {
  assert.doesNotThrow(() => detectarImagen(png(10, 10).subarray(0, 20)));
  assert.doesNotThrow(() => detectarImagen(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])));
  const corto = detectarImagen(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0, 0, 0, 0]));
  assert.equal(corto.width, null);
});

test("rechaza lo demasiado chico, lo desmedido y lo de dimensión cero", () => {
  assert.equal(validarImagen(png(100, 100)).motivo, "chica");
  assert.equal(validarImagen(png(5000, 150)).motivo, "chica");
  assert.equal(validarImagen(png(20000, 400)).motivo, "grande");
  assert.equal(validarImagen(png(9000, 9000)).motivo, "grande");
  assert.equal(validarImagen(png(0, 800)).motivo, "corrupta");
});

test("acepta una foto normal de celular y no rechaza lo que no se puede medir", () => {
  assert.equal(validarImagen(jpeg(3024, 4032)).ok, true);
  assert.equal(validarImagen(heic(3024, 4032)).ok, true);
  const sinMedida = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0]), Buffer.alloc(12)]);
  assert.equal(validarImagen(sinMedida).ok, true);
});

test("el endpoint responde 400 con un mensaje claro y NO llama al modelo", async () => {
  const llamadas = [];
  const vision = require("../src/services/vision.service");
  const original = vision.analyzeWineLabel;
  vision.analyzeWineLabel = async (...a) => llamadas.push(a);
  try {
    for (const [buffer, code] of [
      [Buffer.from("no soy una imagen, soy texto largo"), "imagen_formato"],
      [png(80, 80), "imagen_chica"],
      [png(30000, 30000), "imagen_grande"],
    ]) {
      let status = 0;
      let body = null;
      const res = { status: (s) => ((status = s), res), json: (b) => ((body = b), res) };
      await analyzeLabel({ file: { buffer, mimetype: "image/jpeg" }, user: { id: "u1" } }, res, (e) => assert.fail(e));
      assert.equal(status, 400);
      assert.equal(body.code, code);
      assert.match(body.message, /foto/i);
    }
    assert.equal(llamadas.length, 0);
  } finally {
    vision.analyzeWineLabel = original;
  }
});
