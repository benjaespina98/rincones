const test = require("node:test");
const assert = require("node:assert/strict");
const User = require("../src/models/user.model");
const RefreshToken = require("../src/models/refreshToken.model");
const AnalyticsEvent = require("../src/models/analyticsEvent.model");
const SommelierConversation = require("../src/models/sommelierConversation.model");
const WineImage = require("../src/models/wineImage.model");
const winePrices = require("../src/services/winePrices.service");
const accountDeletion = require("../src/services/accountDeletion.service");
const imageStorage = require("../src/services/imageStorage.service");
const mailService = require("../src/services/mail.service");
const { claveIpEmail } = require("../src/utils/rateKey");
const auth = require("../src/controllers/auth.controller");

const stub = (obj, nombre, fn) => {
  const original = obj[nombre];
  obj[nombre] = fn;
  return () => { obj[nombre] = original; };
};

const responder = () => {
  const res = { statusCode: 0, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};

test("la clave del límite separa por email y normaliza mayúsculas y espacios", () => {
  const a = claveIpEmail({ ip: "1.2.3.4", body: { email: "Victima@X.com " } });
  const b = claveIpEmail({ ip: "1.2.3.4", body: { email: "victima@x.com" } });
  const otro = claveIpEmail({ ip: "1.2.3.4", body: { email: "otra@x.com" } });
  assert.equal(a, b, "mismo email, mismo bucket");
  assert.notEqual(a, otro, "otro email, otro bucket");
  assert.notEqual(a, claveIpEmail({ ip: "9.9.9.9", body: { email: "victima@x.com" } }));
});

test("la clave del límite no revienta con un body raro", () => {
  for (const body of [undefined, null, {}, { email: { $ne: "" } }, { email: ["a"] }, { email: 5 }]) {
    assert.equal(claveIpEmail({ ip: "1.2.3.4", body }), "1.2.3.4|");
  }
});

test("el borrado desde admin limpia sesiones, charlas, analytics, precios y atribución de fotos", async () => {
  const llamadas = [];
  const restores = [
    stub(RefreshToken, "deleteMany", async (f) => llamadas.push(["RefreshToken", f])),
    stub(AnalyticsEvent, "deleteMany", async (f) => llamadas.push(["AnalyticsEvent", f])),
    stub(SommelierConversation, "deleteMany", async (f) => llamadas.push(["SommelierConversation", f])),
    stub(winePrices, "retractAllFromUser", async (id) => llamadas.push(["WinePrice", id])),
    stub(WineImage, "updateMany", async (f, u) => llamadas.push(["WineImage", f, u])),
  ];
  try {
    await accountDeletion.purgeUserLeftovers("u7");
    assert.deepEqual(llamadas.map((c) => c[0]).sort(), [
      "AnalyticsEvent", "RefreshToken", "SommelierConversation", "WineImage", "WinePrice",
    ]);
    assert.deepEqual(llamadas.find((c) => c[0] === "WineImage").slice(1), [
      { contributedBy: "u7" },
      { $unset: { contributedBy: 1 } },
    ]);
  } finally {
    restores.forEach((r) => r());
  }
});

const pedirOlvido = async (entorno) => {
  const anterior = process.env.NODE_ENV;
  if (entorno === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = entorno;
  const usuario = { email: "p@x.com", save: async () => {} };
  const restores = [
    stub(User, "findOne", async () => usuario),
    stub(mailService, "isMailConfigured", () => false),
  ];
  const logs = [];
  const infoOriginal = console.info;
  console.info = (...a) => logs.push(a.join(" "));
  try {
    const res = responder();
    await auth.forgotPassword({ body: { email: "p@x.com" } }, res, (e) => { throw e; });
    return { res, logs };
  } finally {
    console.info = infoOriginal;
    restores.forEach((r) => r());
    if (anterior === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = anterior;
  }
};

test("el link de reset sólo se entrega y se imprime con NODE_ENV=development", async () => {
  for (const entorno of [undefined, "production", "staging", "test"]) {
    const { res, logs } = await pedirOlvido(entorno);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.resetUrl, undefined, `NODE_ENV=${entorno}: no puede devolver el link`);
    assert.equal(logs.some((l) => l.includes("reset-password")), false, `NODE_ENV=${entorno}: no puede loguear el token`);
  }
  const dev = await pedirOlvido("development");
  assert.match(dev.res.body.resetUrl, /reset-password/);
});

test("Google no entra a una cuenta ya vinculada a otra identidad de Google", async () => {
  const { OAuth2Client } = require("google-auth-library");
  const RefreshTokenModel = require("../src/models/refreshToken.model");
  const entorno = { id: process.env.GOOGLE_CLIENT_ID, jwt: process.env.JWT_SECRET };
  process.env.GOOGLE_CLIENT_ID = "cliente-de-prueba";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "secreto-de-prueba-para-tests";
  const usuario = { _id: "u8", email: "ws@x.com", googleId: "g-VIEJO", emailVerified: true, save: async () => { throw new Error("no debía guardar"); } };
  const restores = [
    stub(OAuth2Client.prototype, "verifyIdToken", async () => ({
      getPayload: () => ({ email: "ws@x.com", email_verified: true, sub: "g-NUEVO" }),
    })),
    stub(User, "findOne", () => ({ select: async () => usuario })),
    stub(RefreshTokenModel, "create", async () => { throw new Error("no debía abrir sesión"); }),
  ];
  try {
    const res = responder();
    res.cookie = () => res;
    await auth.googleAuth({ body: { credential: "x" }, get: () => "" }, res, (e) => { throw e; });
    assert.equal(res.statusCode, 409);
  } finally {
    restores.forEach((r) => r());
    if (entorno.id === undefined) delete process.env.GOOGLE_CLIENT_ID; else process.env.GOOGLE_CLIENT_ID = entorno.id;
    if (entorno.jwt === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = entorno.jwt;
  }
});

test("sólo cuenta como foto propia la de NUESTRO cloud de Cloudinary", () => {
  const anterior = process.env.CLOUDINARY_URL;
  process.env.CLOUDINARY_URL = "cloudinary://clave:secreto@mi-cloud";
  try {
    assert.equal(imageStorage.esUrlPropia("https://res.cloudinary.com/mi-cloud/image/upload/x.png"), true);
    assert.equal(imageStorage.esUrlPropia("https://res.cloudinary.com/otro-cloud/image/upload/x.png"), false);
    assert.equal(imageStorage.esUrlPropia("https://atacante.example/res.cloudinary.com/mi-cloud/x.png"), false);
    assert.equal(imageStorage.esUrlPropia("http://res.cloudinary.com/mi-cloud/x.png"), false);
  } finally {
    if (anterior === undefined) delete process.env.CLOUDINARY_URL; else process.env.CLOUDINARY_URL = anterior;
  }
});
