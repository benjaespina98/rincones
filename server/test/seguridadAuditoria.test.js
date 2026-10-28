const test = require("node:test");
const assert = require("node:assert/strict");
const User = require("../src/models/user.model");
const WineImage = require("../src/models/wineImage.model");
const WineReview = require("../src/models/wineReview.model");
const WinePrice = require("../src/models/winePrice.model");
const wineImages = require("../src/services/wineImages.service");
const wineReviews = require("../src/services/wineReviews.service");
const winePrices = require("../src/services/winePrices.service");
const imageStorage = require("../src/services/imageStorage.service");
const auth = require("../src/controllers/auth.controller");

const responder = () => {
  const res = { statusCode: 0, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};

/** Reemplaza una función y devuelve cómo dejarla como estaba. */
const stub = (obj, nombre, fn) => {
  const original = obj[nombre];
  obj[nombre] = fn;
  return () => { obj[nombre] = original; };
};

test("login de una cuenta sólo-Google responde 401, no un 500 que delata la cuenta", async () => {
  const restore = stub(User, "findOne", () => ({
    select: async () => ({ email: "g@x.com", passwordHash: undefined }),
  }));
  try {
    const res = responder();
    let error = null;
    await auth.login({ body: { email: "g@x.com", password: "Cualquiera1!" } }, res, (e) => { error = e; });
    assert.equal(error, null);
    assert.equal(res.statusCode, 401);
  } finally {
    restore();
  }
});

test("reset de contraseña ignora un email que no es texto (inyección de operadores)", async () => {
  let filtro = null;
  const restore = stub(User, "findOne", (f) => {
    filtro = f;
    return { select: async () => null };
  });
  try {
    const res = responder();
    await auth.resetPassword(
      { body: { token: "t", email: { $ne: "" }, newPassword: "Contrasena1!x" } },
      res,
      () => {}
    );
    assert.equal(res.statusCode, 400);
    assert.equal(filtro, null, "con un email que no es texto ni siquiera se consulta la base");
  } finally {
    restore();
  }
});

test("las reseñas ajenas no llevan userId ni el prefijo del email", async () => {
  const docs = [
    { userId: "u2", rating: 5, authorName: "", createdAt: new Date() },
    { userId: "u1", rating: 4, authorName: "Yo", createdAt: new Date() },
  ];
  let camposPedidos = null;
  const restores = [
    stub(WineReview, "find", () => ({ sort: () => ({ limit: () => ({ lean: async () => docs.map((d) => ({ ...d })) }) }) })),
    stub(WineReview, "aggregate", async () => [{ _id: 5, n: 1 }, { _id: 4, n: 1 }]),
    stub(User, "find", () => ({
      select: (campos) => {
        camposPedidos = campos;
        return { lean: async () => [{ _id: "u2", firstName: "", avatar: "" }] };
      },
    })),
  ];
  try {
    const { reviews, mine } = await wineReviews.listReviews("Malbec", "Bodega", "u1");
    assert.equal(mine.userId, "u1");
    assert.equal(reviews.length, 1);
    assert.equal("userId" in reviews[0], false);
    assert.equal(reviews[0].authorName, "Alguien");
    // Afuera del stub: un assert adentro lo podría tragar el try/catch del servicio.
    assert.ok(camposPedidos && !/email/.test(camposPedidos), "no se debe leer el email");
  } finally {
    restores.forEach((r) => r());
  }
});

test("al pool compartido de fotos no entran URLs de terceros", async () => {
  let escrituras = 0;
  const restores = [
    stub(WineImage, "findOne", () => ({ select: () => ({ lean: async () => null }) })),
    stub(WineImage, "updateOne", async () => { escrituras += 1; }),
  ];
  try {
    await wineImages.contribute({ name: "Malbec", winery: "Bodega", varietal: "Malbec", image: "https://atacante.example/pixel.png", userId: "u1" });
    assert.equal(escrituras, 0);
    await wineImages.contribute({ name: "Malbec", winery: "Bodega", varietal: "Malbec", image: "https://atacante.example/res.cloudinary.com/x.png", userId: "u1" });
    assert.equal(escrituras, 0);
    await wineImages.contribute({ name: "Malbec", winery: "Bodega", varietal: "Malbec", image: "https://res.cloudinary.com/demo/image/upload/x.png", userId: "u1" });
    assert.equal(escrituras, 1);
  } finally {
    restores.forEach((r) => r());
  }
});

test("store no confunde una URL ajena que nombra a Cloudinary con una propia", async () => {
  // Sin Cloudinary configurado devuelve el valor tal cual; lo que se prueba es
  // que la ruta "ya es nuestra" no se active por un texto dentro de otra URL.
  const ajena = "https://atacante.example/res.cloudinary.com/x.png";
  const propia = "https://res.cloudinary.com/demo/image/upload/x.png";
  assert.equal(await imageStorage.store(propia), propia);
  assert.equal(await imageStorage.store(ajena), ajena);
});

test("la baja saca a la persona de los precios por dentro de samples y recalcula", async () => {
  const guardados = [];
  const doc = {
    _id: "p1",
    samples: [
      { user: "u1", price: 100 },
      { user: "u2", price: 300 },
    ],
    save: async function () { guardados.push(this); },
  };
  const restores = [
    stub(WinePrice, "find", async (q) => {
      assert.deepEqual(q, { "samples.user": "u1" });
      return [doc];
    }),
    stub(WinePrice, "deleteOne", async () => { throw new Error("no debía borrarse"); }),
  ];
  try {
    await winePrices.retractAllFromUser("u1");
    assert.equal(guardados.length, 1);
    assert.deepEqual(doc.samples.map((s) => s.user), ["u2"]);
    assert.equal(doc.count, 1);
    assert.equal(doc.sum, 300);
  } finally {
    restores.forEach((r) => r());
  }
});

test("Google no hereda la contraseña ni las sesiones de quien registró el email sin verificarlo", async () => {
  const { OAuth2Client } = require("google-auth-library");
  const RefreshToken = require("../src/models/refreshToken.model");
  const entorno = { id: process.env.GOOGLE_CLIENT_ID, jwt: process.env.JWT_SECRET };
  process.env.GOOGLE_CLIENT_ID = "cliente-de-prueba";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "secreto-de-prueba-para-tests";

  const revocados = [];
  const usuario = {
    _id: "u9",
    email: "victima@x.com",
    passwordHash: "hash-del-atacante",
    emailVerified: false,
    save: async function () { this.guardado = true; },
  };
  const restores = [
    stub(OAuth2Client.prototype, "verifyIdToken", async () => ({
      getPayload: () => ({ email: "victima@x.com", email_verified: true, sub: "g-1" }),
    })),
    stub(User, "findOne", () => ({ select: async () => usuario })),
    stub(RefreshToken, "deleteMany", async (f) => { revocados.push(f); return {}; }),
    stub(RefreshToken, "create", async () => ({})),
  ];
  try {
    const res = responder();
    res.cookie = () => res;
    let error = null;
    await auth.googleAuth({ body: { credential: "x" }, get: () => "" }, res, (e) => { error = e; });
    assert.equal(error, null);
    assert.equal(res.statusCode, 200);
    assert.equal(usuario.passwordHash, undefined, "la contraseña del atacante tiene que desaparecer");
    assert.equal(usuario.emailVerified, true);
    assert.equal(usuario.googleId, "g-1");
    assert.ok(revocados.some((f) => String(f.userId) === "u9"), "se revocan las sesiones previas");
  } finally {
    restores.forEach((r) => r());
    if (entorno.id === undefined) delete process.env.GOOGLE_CLIENT_ID; else process.env.GOOGLE_CLIENT_ID = entorno.id;
    if (entorno.jwt === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = entorno.jwt;
  }
});

test("textoSeguro descarta lo que el modelo devuelve con links, mails, markdown o marcas", () => {
  const { textoSeguro } = require("../src/utils/promptSeguro");
  assert.equal(textoSeguro("Un Malbec fresco, con frutos rojos."), "Un Malbec fresco, con frutos rojos.");
  for (const malo of [
    "Visitá https://atacante.example para más",
    "entrá a www.atacante.example",
    "escribime a alguien@atacante.example",
    "[click aquí](https://x.example)",
    "<script>alert(1)</script>",
  ]) {
    assert.equal(textoSeguro(malo), "", malo);
  }
  assert.equal(textoSeguro("a".repeat(501), 500), "", "se pasa del largo");
  assert.equal(textoSeguro(undefined), "");
});

test("el gate de fotos falla cerrado: sin isWinePhoto explícito en true, no es foto de vino", async () => {
  const gemini = require("../src/services/gemini.service");
  // El servicio importa generateJson destructurado: hay que recargarlo con el stub ya puesto.
  const ruta = require.resolve("../src/services/wineImageQuality.service");
  delete require.cache[ruta];
  const restores = [
    stub(gemini, "isGeminiConfigured", () => true),
    stub(gemini, "generateJson", async () => ({ quality: 100 })),
  ];
  try {
    const quality = require("../src/services/wineImageQuality.service");
    const r = await quality.scorePhoto("data:image/png;base64,AAAA");
    // Sin el campo, antes se asumía "es un vino" y el puntaje 100 inyectado pisaba la foto pública.
    assert.deepEqual(r, { isWinePhoto: false, quality: 0 });
  } finally {
    restores.forEach((x) => x());
    delete require.cache[ruta];
  }
});
