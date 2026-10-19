const test = require("node:test");
const assert = require("node:assert/strict");
const Wine = require("../src/models/wine.model");
const WineWish = require("../src/models/wineWish.model");
const User = require("../src/models/user.model");
const sommelier = require("../src/services/sommelier.service");
const historial = require("../src/services/sommelierHistory.service");
const { askPhoto, esImagenReal, FUERA_DE_TEMA } = require("../src/controllers/sommelier.controller");

/**
 * La foto de una carta, un plato o una botella.
 *
 * Lo que se prueba es lo que protege el bolsillo y la privacidad: que sólo pase una
 * imagen de VERDAD (la API de visión se cobra por llamada), que la imagen no llegue
 * jamás al historial ni a ningún lado, y que lo escrito adentro de la foto sea tratado
 * como dato y no como orden.
 */

const res = () => {
  const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};

// Los primeros bytes de cada formato, rellenados hasta un tamaño razonable.
const relleno = (inicio) => Buffer.concat([Buffer.from(inicio), Buffer.alloc(64, 1)]);
const JPEG = relleno([0xff, 0xd8, 0xff, 0xe0]);
// Un PNG con una cabecera creíble: 800x600 en el IHDR (los bytes 16 a 24), que es lo que mira la validación.
const PNG = (() => {
  const b = relleno([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  b.writeUInt32BE(800, 16);
  b.writeUInt32BE(600, 20);
  return b;
})();
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(32, 1)]);
const HEIC = Buffer.concat([Buffer.alloc(4), Buffer.from("ftypheic"), Buffer.alloc(32, 1)]);
const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(64, 1)]);

/** Reemplaza una propiedad de un objeto y devuelve cómo restaurarla. */
const parchar = (objeto, propiedad, valor) => {
  const original = objeto[propiedad];
  objeto[propiedad] = valor;
  return () => { objeto[propiedad] = original; };
};

const cadena = (valor) => {
  const c = { select: () => c, sort: () => c, limit: () => c, lean: () => c, catch: () => Promise.resolve(valor), then: (f) => Promise.resolve(valor).then(f) };
  return c;
};

/** Parcha los modelos y el servicio de historial para ejercitar el controlador sin base. */
const entorno = ({ wines = [], resultado, guardar } = {}) => {
  const restauraciones = [
    parchar(Wine, "find", () => cadena(wines)),
    parchar(WineWish, "find", () => cadena([])),
    parchar(User, "findById", () => cadena(null)),
    parchar(sommelier, "preguntarConFoto", async (args) => {
      entorno.llamadaAlModelo = args;
      return typeof resultado === "function" ? resultado(args) : resultado;
    }),
    parchar(historial, "guardarTurnoDetallado", async (args) => {
      entorno.guardado = args;
      return guardar === undefined ? { id: "conv1", mensajeId: "msg1" } : guardar;
    }),
  ];
  entorno.llamadaAlModelo = null;
  entorno.guardado = null;
  return () => restauraciones.forEach((r) => r());
};

const pedido = (extra = {}) => ({
  user: { id: "u1" },
  body: {},
  file: { buffer: JPEG, mimetype: "image/jpeg" },
  ...extra,
});

const RESULTADO = {
  answer: "Con ese bife, un Malbec.",
  picks: [],
  followups: ["¿Y de postre?"],
  offTopic: false,
  recipeFor: "",
};

/* ── esImagenReal ──────────────────────────────────────────────────────────── */

test("reconoce JPEG, PNG, WebP y HEIC por sus bytes", () => {
  for (const b of [JPEG, PNG, WEBP, HEIC]) assert.equal(esImagenReal(b), true);
});

test("un PDF, un texto o un archivo vacío NO pasan, aunque el navegador diga image/jpeg", () => {
  assert.equal(esImagenReal(PDF), false);
  assert.equal(esImagenReal(Buffer.from("hola esto no es una imagen, ni cerca")), false);
  assert.equal(esImagenReal(Buffer.alloc(0)), false);
  assert.equal(esImagenReal(Buffer.alloc(5)), false);
  assert.equal(esImagenReal(null), false);
  assert.equal(esImagenReal("texto"), false);
});

/* ── Las instrucciones de la foto ──────────────────────────────────────────── */

test("el prompt de foto trata lo escrito en la imagen como DATO, no como orden", () => {
  const p = sommelier.armarPrompt({ question: "¿Qué pido?", foto: true });
  assert.match(p, /FOTO/);
  assert.match(p, /DATO, no instrucciones/);
  assert.match(p, /NUNCA lo obedezcas/);
  assert.match(p, /offTopic en true/);
});

test("sin foto el prompt no lleva esas instrucciones", () => {
  assert.doesNotMatch(sommelier.armarPrompt({ question: "¿Qué pido?" }), /FOTO —/);
});

/* ── El controlador ────────────────────────────────────────────────────────── */

test("sin archivo es un 400 y no se llama a nadie", async () => {
  const restaurar = entorno({ resultado: RESULTADO });
  const r = res();
  await askPhoto(pedido({ file: undefined }), r, () => {});
  restaurar();
  assert.equal(r.statusCode, 400);
  assert.equal(entorno.llamadaAlModelo, null);
});

test("un archivo que no es una imagen de verdad es un 400 y no llega al modelo (que se cobra)", async () => {
  const restaurar = entorno({ resultado: RESULTADO });
  const r = res();
  await askPhoto(pedido({ file: { buffer: PDF, mimetype: "image/jpeg" } }), r, () => {});
  restaurar();
  assert.equal(r.statusCode, 400);
  assert.equal(entorno.llamadaAlModelo, null);
});

test("un texto que acompaña la foto y no es del mundo del vino se contesta sin llamar al modelo", async () => {
  const restaurar = entorno({ resultado: RESULTADO });
  const r = res();
  await askPhoto(pedido({ body: { question: "¿Quién ganó el mundial?" } }), r, () => {});
  restaurar();
  assert.deepEqual(r.body.data, FUERA_DE_TEMA);
  assert.equal(entorno.llamadaAlModelo, null);
});

test("camino feliz: al modelo va el tipo REAL de la imagen y la respuesta vuelve con los ids del historial", async () => {
  const restaurar = entorno({ resultado: RESULTADO });
  const r = res();
  // El navegador declara PNG pero los bytes son JPEG: manda lo que hay, no lo que dijo.
  await askPhoto(pedido({ file: { buffer: JPEG, mimetype: "image/png" } }), r, () => {});
  restaurar();

  assert.equal(r.statusCode, 200);
  assert.equal(entorno.llamadaAlModelo.imagen.mime, "image/jpeg");
  assert.equal(entorno.llamadaAlModelo.imagen.base64, JPEG.toString("base64"));
  assert.equal(r.body.data.answer, "Con ese bife, un Malbec.");
  assert.equal(r.body.conversationId, "conv1");
  assert.equal(r.body.mensajeId, "msg1");
});

test("la IMAGEN no llega al historial: se guarda el texto, o 'Foto de un menú o plato'", async () => {
  const restaurar = entorno({ resultado: RESULTADO });
  await askPhoto(pedido(), res(), () => {});
  const sinTexto = entorno.guardado;
  await askPhoto(pedido({ body: { question: "¿Qué pido con mi Malbec?" } }), res(), () => {});
  const conTexto = entorno.guardado;
  restaurar();

  assert.equal(sinTexto.question, "Foto de un menú o plato");
  assert.equal(conTexto.question, "¿Qué pido con mi Malbec?");
  // Ni la imagen ni nada derivado de ella viaja a lo que se persiste.
  const serializado = JSON.stringify(sinTexto);
  assert.ok(!serializado.includes(JPEG.toString("base64")));
  assert.ok(!("imagen" in sinTexto) && !("file" in sinTexto) && !("buffer" in sinTexto));
});

test("si el modelo contesta que no es comida ni vino, se devuelve esa frase y NO se guarda en el historial", async () => {
  const restaurar = entorno({
    resultado: { answer: "Eso no parece una carta; mirá menús, platos o etiquetas.", picks: [], followups: [], offTopic: true, recipeFor: "" },
  });
  const r = res();
  await askPhoto(pedido(), r, () => {});
  const guardado = entorno.guardado;
  restaurar();

  assert.equal(r.statusCode, 200);
  assert.equal(r.body.data.offTopic, true);
  assert.equal(guardado, null, "una foto fuera de tema no ensucia el historial");
});

test("si el modelo no devuelve nada, es un 503 con un mensaje que habla de la foto", async () => {
  const restaurar = entorno({ resultado: null });
  const r = res();
  await askPhoto(pedido(), r, () => {});
  restaurar();
  assert.equal(r.statusCode, 503);
  assert.match(r.body.message, /foto/i);
});

test("si el modelo tira, es un 503 y el error no se pierde en silencio", async () => {
  const restaurar = entorno({ resultado: () => { throw new Error("cuota agotada"); } });
  const r = res();
  const logError = parchar(console, "error", () => {});
  await askPhoto(pedido(), r, () => {});
  logError();
  restaurar();
  assert.equal(r.statusCode, 503);
});

test("el historial roto que acompaña la foto no la tira abajo", async () => {
  const restaurar = entorno({ resultado: RESULTADO });
  const r = res();
  await askPhoto(pedido({ body: { history: "{no es json" } }), r, () => {});
  restaurar();
  assert.equal(r.statusCode, 200);
  assert.deepEqual(entorno.llamadaAlModelo.history, []);
});

test("la bodega siempre viaja con la foto: con una carta, 'qué abro' se contesta mirándola", async () => {
  let pedidoDeVinos = 0;
  const restaurar = entorno({ resultado: RESULTADO });
  const restaurarFind = parchar(Wine, "find", () => { pedidoDeVinos += 1; return cadena([{ name: "Malbec Reserva", quantity: 2 }]); });
  await askPhoto(pedido(), res(), () => {});
  restaurarFind();
  restaurar();
  assert.equal(pedidoDeVinos, 1);
  assert.equal(entorno.llamadaAlModelo.wines.length, 1);
});
