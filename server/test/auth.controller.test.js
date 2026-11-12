const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
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
      firstName: "",
      emailVerified: false,
      onboarded: false,
      hasBirthDate: false,
      // Vacío para una cuenta que no entró por Google. Va igual en la
      // respuesta: el header lo lee de acá, y si el campo faltara mostraría
      // las iniciales aunque la persona tenga foto (ver buildAuthResponse).
      avatarPhoto: "",
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
  let savedUser = null;
  User.create = async (payload) => {
    const user = {
      _id: "user-2",
      email: payload.email,
      role: payload.role,
      emailVerified: false,
      async save() { savedUser = this; },
    };
    return user;
  };

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
      firstName: "",
      emailVerified: false,
      onboarded: false,
      hasBirthDate: false,
      avatarPhoto: "",
    });

    // El registro deja emitido (y guardado, hasheado) un token de verificación:
    // la cuenta arranca no verificada, pero con el link ya armable.
    assert.ok(savedUser, "el usuario se guardó tras emitir el token");
    assert.match(savedUser.emailVerificationToken, /^[a-f0-9]{64}$/);
    assert.ok(savedUser.emailVerificationExpires > Date.now());
  } finally {
    sesiones.restore();
    User.findOne = originalFindOne;
    User.create = originalCreate;
    bcrypt.hash = originalHash;
    process.env.JWT_SECRET = originalSecret;
  }
});

test("auth register rejects duplicate email", async () => {
  const originalFindOne = User.findOne;
  User.findOne = async () => ({ _id: "existing", email: "dup@example.com" });

  const req = {
    body: {
      email: "dup@example.com",
      password: "Secret123",
      firstName: "Dup",
      birthDate: "1990-06-15",
    },
  };
  const res = createRes();

  try {
    await authController.register(req, res, (err) => { if (err) throw err; });
    assert.equal(res.statusCode, 409);
    assert.match(res.body.message, /registrado/i);
  } finally {
    User.findOne = originalFindOne;
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

// ── `onboarded` en las respuestas de auth ────────────────────────────────
//
// El bug real: `buildAuthResponse` (login/register/refresh) no mandaba
// `onboarded`, así que después de registrarse el cliente armaba `user` con
// ese campo en `undefined` — distinto de `false` — y el gate de onboarding no
// disparaba hasta la próxima vez que la app llamara a `/me`. Estos tests
// cubren las dos respuestas por separado: tienen que decir lo mismo.

test("auth login refleja onboardedAt en 'onboarded'", async () => {
  const originalFindOne = User.findOne;
  const originalCompare = bcrypt.compare;
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

  bcrypt.compare = async () => true;
  User.findOne = () => ({
    select: () => ({
      _id: "user-3", email: "onb@example.com", role: "user", passwordHash: "hash",
      onboardedAt: new Date("2024-01-01"), emailVerified: true,
    }),
  });

  const req = { body: { email: "onb@example.com", password: "Secret123" }, get: () => "test-agent" };
  const res = createRes();
  const sesiones = stubSessions();

  try {
    await authController.login(req, res, (err) => { if (err) throw err; });
    assert.equal(res.body.data.user.onboarded, true);
  } finally {
    sesiones.restore();
    User.findOne = originalFindOne;
    bcrypt.compare = originalCompare;
    process.env.JWT_SECRET = originalSecret;
  }
});

test("auth me refleja onboardedAt en 'onboarded', igual que login/register", async () => {
  const originalFindById = User.findById;
  User.findById = async () => ({
    _id: "user-3", email: "onb@example.com", role: "user",
    onboardedAt: null, firstName: "", emailVerified: true,
  });

  const req = { user: { id: "user-3" } };
  const res = createRes();

  try {
    await authController.me(req, res, (err) => { if (err) throw err; });
    assert.equal(res.body.data.onboarded, false);
  } finally {
    User.findById = originalFindById;
  }
});

// ── Verificación de email ────────────────────────────────────────────────

// Simula la fila de Mongo: el hash guardado es el único dato que importa para
// que el `findOne` "encuentre" al usuario, igual que en la base real.
const makeVerifiableUser = ({ token, expiresInMs = 60 * 60 * 1000, verified = false }) => ({
  _id: "u1",
  email: "user@example.com",
  emailVerified: verified,
  emailVerificationToken: crypto.createHash("sha256").update(token).digest("hex"),
  emailVerificationExpires: Date.now() + expiresInMs,
  saveCount: 0,
  async save() { this.saveCount += 1; },
});

const stubFindOneForVerify = (user) => {
  User.findOne = (filter) => ({
    select: () =>
      filter.email === user.email && filter.emailVerificationToken === user.emailVerificationToken
        ? user
        : null,
  });
};

test("auth verifyEmail confirma con un token válido", async () => {
  const originalFindOne = User.findOne;
  const token = "buen-token";
  const user = makeVerifiableUser({ token });
  stubFindOneForVerify(user);

  const req = { body: { token, email: user.email } };
  const res = createRes();

  try {
    await authController.verifyEmail(req, res, (err) => { if (err) throw err; });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.emailVerified, true);
    assert.equal(user.emailVerified, true);
    // Un solo uso: el token queda limpio, no reutilizable.
    assert.equal(user.emailVerificationToken, undefined);
    assert.equal(user.saveCount, 1);
  } finally {
    User.findOne = originalFindOne;
  }
});

test("auth verifyEmail rechaza un token inválido", async () => {
  const originalFindOne = User.findOne;
  const user = makeVerifiableUser({ token: "el-correcto" });
  stubFindOneForVerify(user);

  const req = { body: { token: "otro-cualquiera", email: user.email } };
  const res = createRes();

  try {
    await authController.verifyEmail(req, res, (err) => { if (err) throw err; });
    assert.equal(res.statusCode, 400);
    assert.equal(user.emailVerified, false);
  } finally {
    User.findOne = originalFindOne;
  }
});

test("auth verifyEmail rechaza un token vencido", async () => {
  const originalFindOne = User.findOne;
  const token = "token-viejo";
  const user = makeVerifiableUser({ token, expiresInMs: -1000 });
  stubFindOneForVerify(user);

  const req = { body: { token, email: user.email } };
  const res = createRes();

  try {
    await authController.verifyEmail(req, res, (err) => { if (err) throw err; });
    assert.equal(res.statusCode, 400);
    assert.equal(user.emailVerified, false);
  } finally {
    User.findOne = originalFindOne;
  }
});

test("auth verifyEmail no deja reusar el mismo token dos veces", async () => {
  const originalFindOne = User.findOne;
  const token = "token-de-un-solo-uso";
  const user = makeVerifiableUser({ token });
  stubFindOneForVerify(user);

  const req = { body: { token, email: user.email } };

  try {
    const res1 = createRes();
    await authController.verifyEmail(req, res1, (err) => { if (err) throw err; });
    assert.equal(res1.statusCode, 200);

    // Mismo request, segunda vez: el hash ya no está en el usuario, así que el
    // "findOne" (que lee el estado actual, como Mongo) no lo encuentra más.
    const res2 = createRes();
    await authController.verifyEmail(req, res2, (err) => { if (err) throw err; });
    assert.equal(res2.statusCode, 400);
    assert.equal(user.saveCount, 1, "la segunda vez no debe volver a guardar");
  } finally {
    User.findOne = originalFindOne;
  }
});

test("auth resendVerification emite un token nuevo para una cuenta no verificada", async () => {
  const originalFindById = User.findById;
  const user = { _id: "u1", email: "user@example.com", emailVerified: false, saveCount: 0, async save() { this.saveCount += 1; } };
  User.findById = async () => user;

  const req = { user: { id: "u1" } };
  const res = createRes();

  try {
    await authController.resendVerification(req, res, (err) => { if (err) throw err; });
    assert.equal(res.statusCode, 200);
    assert.match(user.emailVerificationToken, /^[a-f0-9]{64}$/);
    assert.ok(user.emailVerificationExpires > Date.now());
    assert.equal(user.saveCount, 1);
  } finally {
    User.findById = originalFindById;
  }
});

test("auth resendVerification no hace nada si el email ya está confirmado", async () => {
  const originalFindById = User.findById;
  const user = { _id: "u1", email: "user@example.com", emailVerified: true, saveCount: 0, async save() { this.saveCount += 1; } };
  User.findById = async () => user;

  const req = { user: { id: "u1" } };
  const res = createRes();

  try {
    await authController.resendVerification(req, res, (err) => { if (err) throw err; });
    assert.equal(res.statusCode, 200);
    assert.match(res.body.message, /ya está confirmado/);
    assert.equal(user.saveCount, 0, "una cuenta ya verificada no debe emitir token ni guardar");
  } finally {
    User.findById = originalFindById;
  }
});

test("login con un email que no existe gasta el mismo bcrypt que uno real (no se delata por tiempo)", async () => {
  const originalFindOne = User.findOne;
  const originalCompare = bcrypt.compare;
  let comparaciones = 0;
  User.findOne = () => ({ select: async () => null });
  bcrypt.compare = async () => { comparaciones += 1; return false; };
  const res = createRes();
  try {
    await authController.login({ body: { email: "nadie@example.com", password: "Abcdef12" }, headers: {} }, res, () => {});
  } finally {
    User.findOne = originalFindOne;
    bcrypt.compare = originalCompare;
  }
  assert.equal(res.statusCode, 401);
  assert.equal(comparaciones, 1);
});

test("login con una contraseña que no es texto se trata como faltante (400), no rompe", async () => {
  const res = createRes();
  await authController.login({ body: { email: "a@b.com", password: { $ne: "" } }, headers: {} }, res, () => {});
  assert.equal(res.statusCode, 400);
});

test("login con una cuenta sólo-Google también gasta bcrypt y nunca entra", async () => {
  const originalFindOne = User.findOne;
  const originalCompare = bcrypt.compare;
  let comparaciones = 0;
  User.findOne = () => ({ select: async () => ({ _id: "g1", email: "g@example.com", passwordHash: undefined }) });
  // Aunque bcrypt dijera «coincide» contra el hash falso, sin contraseña real no se entra.
  bcrypt.compare = async () => { comparaciones += 1; return true; };
  const res = createRes();
  try {
    await authController.login({ body: { email: "g@example.com", password: "Abcdef12" }, headers: {} }, res, () => {});
  } finally {
    User.findOne = originalFindOne;
    bcrypt.compare = originalCompare;
  }
  assert.equal(res.statusCode, 401);
  assert.equal(comparaciones, 1);
});
