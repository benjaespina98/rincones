const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const User = require("../src/models/user.model");
const authController = require("../src/controllers/auth.controller");

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

  const req = { body: { email: "admin@example.com", password: "Secret123" } };
  const res = createRes();

  try {
    await authController.login(req, res, (err) => { if (err) throw err; });

    assert.equal(res.statusCode, 200);
    assert.equal(res.cookies.length, 1);
    assert.equal(res.cookies[0].name, "authToken");
    assert.ok(typeof res.body.data.token === "string" && res.body.data.token.length > 0);
    assert.deepEqual(res.body.data.user, {
      id: "user-1",
      email: "admin@example.com",
      role: "admin",
    });
  } finally {
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

  const req = { body: { email: "new@example.com", password: "Secret123", firstName: "Nuevo" } };
  const res = createRes();

  try {
    await authController.register(req, res, (err) => { if (err) throw err; });

    assert.equal(res.statusCode, 201);
    assert.equal(res.cookies.length, 1);
    assert.equal(res.cookies[0].name, "authToken");
    assert.ok(typeof res.body.data.token === "string" && res.body.data.token.length > 0);
    assert.deepEqual(res.body.data.user, {
      id: "user-2",
      email: "new@example.com",
      role: "user",
    });
  } finally {
    User.findOne = originalFindOne;
    User.create = originalCreate;
    bcrypt.hash = originalHash;
    process.env.JWT_SECRET = originalSecret;
  }
});

test("auth logout clears auth cookie", async () => {
  const req = {};
  const res = createRes();

  await authController.logout(req, res, (err) => { if (err) throw err; });

  assert.equal(res.statusCode, 200);
  assert.equal(res.clearedCookies.length, 1);
  assert.equal(res.clearedCookies[0].name, "authToken");
});
