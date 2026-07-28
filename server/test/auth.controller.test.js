const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const User = require("../src/models/user.model");
const authController = require("../src/controllers/auth.controller");
const RefreshToken = require("../src/models/refreshToken.model");

/**
 * Login y registro ahora abren una sesión revocable: además del token corto,
 * guardan un refresh en la base. Los tests corren sin Mongo, así que se
 * reemplazan esas dos operaciones y de paso se puede verificar QUÉ se guarda —
 * en particular, que nunca se guarde el token en claro.
 */
const stubSessions = () => {
  const guardados = [];
  const originalCreate = RefreshToken.create;
  const originalDeleteOne = RefreshToken.deleteOne;

  RefreshToken.create = async (doc) => {
    guardados.push(doc);
    return doc;
  };
  RefreshToken.deleteOne = async () => ({ deletedCount: 1 });

  return {
    guardados,
    restore() {
      RefreshToken.create = originalCreate;
      RefreshToken.deleteOne = originalDeleteOne;
    },
  };
};

const createRes = () => {
  const res = {
    statusCode: 200,
    cookies: [],
    clearedCookies: [],
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    cookie(name, value, options) {
      this.cookies.push({ name, value, options });
      return this;
    },
    clearCookie(name, options) {
      this.clearedCookies.push({ name, options });
      return this;
    },
  };

  return res;
};

test("auth login sets cookie and returns token", async () => {
  const originalFindOne = User.findOne;
  const originalCompare = bcrypt.compare;
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

  bcrypt.compare = async () => true;
  User.findOne = () => ({ select: () => ({ _id: "user-1", email: "admin@example.com", role: "admin", passwordHash: "hash" }) });

  const req = { body: { email: "admin@example.com", password: "Secret123" }, get: () => "test-agent" };
  const res = createRes();
  const sesiones = stubSessions();

  try {
    await authController.login(req, res, (err) => { if (err) throw err; });

    assert.equal(res.statusCode, 200);

    // Dos cookies: el token corto y el refresh de larga duración.
    const nombres = res.cookies.map((c) => c.name);
    assert.deepEqual(nombres, ["authToken", "refreshToken"]);

    // El refresh es httpOnly y sólo viaja a /api/auth: no se manda en cada
    // request ni queda al alcance de un script.
    const refreshCookie = res.cookies[1];
    assert.equal(refreshCookie.options.httpOnly, true);
    assert.equal(refreshCookie.options.path, "/api/auth");

    // Y NO se devuelve en el body: ahí sólo va el token corto.
    assert.equal(res.body.data.refreshToken, undefined);

    // En la base se guarda el hash, nunca el token.
    assert.equal(sesiones.guardados.length, 1);
    const guardado = sesiones.guardados[0];
    assert.match(guardado.tokenHash, /^[a-f0-9]{64}$/);
    assert.notEqual(guardado.tokenHash, refreshCookie.value);
    assert.ok(typeof res.body.data.token === "string" && res.body.data.token.length > 0);
    assert.deepEqual(res.body.data.user, {
      id: "user-1",
      email: "admin@example.com",
      role: "admin",
    });
  } finally {
    sesiones.restore();
    User.findOne = originalFindOne;
    bcrypt.compare = originalCompare;
    process.env.JWT_SECRET = originalSecret;
  }
});

test("auth register sets cookie and returns token", async () => {
  const originalFindOne = User.findOne;
  const originalCreate = User.create;
  const originalHash = bcrypt.hash;
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

  bcrypt.hash = async () => "hashed-password";
  User.findOne = async () => null;
  User.create = async (payload) => ({ _id: "user-2", email: payload.email, role: payload.role });

  const req = {
    body: {
      email: "new@example.com",
      password: "Secret123",
      firstName: "Nuevo",
      birthDate: "1990-06-15",
    },
    get: () => "test-agent",
  };
  const res = createRes();
  const sesiones = stubSessions();

  try {
    await authController.register(req, res, (err) => { if (err) throw err; });

    assert.equal(res.statusCode, 201);
    assert.deepEqual(res.cookies.map((c) => c.name), ["authToken", "refreshToken"]);
    assert.ok(typeof res.body.data.token === "string" && res.body.data.token.length > 0);
    assert.deepEqual(res.body.data.user, {
      id: "user-2",
      email: "new@example.com",
      role: "user",
    });
  } finally {
    sesiones.restore();
    User.findOne = originalFindOne;
    User.create = originalCreate;
    bcrypt.hash = originalHash;
    process.env.JWT_SECRET = originalSecret;
  }
});

test("auth register rejects users under 18", async () => {
  const originalFindOne = User.findOne;
  User.findOne = async () => null;

  const req = {
    body: {
      email: "kid@example.com",
      password: "Secret123",
      firstName: "Menor",
      birthDate: "2015-01-01",
    },
  };
  const res = createRes();

  try {
    await authController.register(req, res, (err) => { if (err) throw err; });
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /18/);
  } finally {
    User.findOne = originalFindOne;
  }
});

test("auth register rejects missing birthDate", async () => {
  const originalFindOne = User.findOne;
  User.findOne = async () => null;

  const req = {
    body: { email: "nobirth@example.com", password: "Secret123", firstName: "SinFecha" },
  };
  const res = createRes();

  try {
    await authController.register(req, res, (err) => { if (err) throw err; });
    assert.equal(res.statusCode, 400);
  } finally {
    User.findOne = originalFindOne;
  }
});

test("auth logout limpia las dos cookies y revoca la sesión", async () => {
  const req = { cookies: { refreshToken: "algo" } };
  const res = createRes();
  const sesiones = stubSessions();

  try {
    await authController.logout(req, res, (err) => { if (err) throw err; });

    assert.equal(res.statusCode, 200);
    // Las dos: si quedara el refresh, la sesión se podría reabrir sola.
    assert.deepEqual(res.clearedCookies.map((c) => c.name), ["authToken", "refreshToken"]);
  } finally {
    sesiones.restore();
  }
});
