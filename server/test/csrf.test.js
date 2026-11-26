const test = require("node:test");
const assert = require("node:assert/strict");

const { protegerCsrf } = require("../src/middleware/csrf");
const { corsOptions } = require("../src/config/cors");

const correr = ({ method = "POST", path = "/api/wines", cookies = { authToken: "x" }, headers = {} } = {}) => {
  const res = {
    statusCode: 200,
    status(codigo) {
      this.statusCode = codigo;
      return this;
    },
    json() {
      return this;
    },
  };
  let paso = false;
  protegerCsrf({ method, path, cookies, headers }, res, () => {
    paso = true;
  });
  return paso ? "pasa" : res.statusCode;
};

test("escribir con la sesión en cookies exige la cabecera propia", () => {
  assert.equal(correr(), 403);
  assert.equal(correr({ method: "DELETE", cookies: { refreshToken: "r" } }), 403);
  assert.equal(correr({ headers: { "x-requested-with": "XMLHttpRequest" } }), 403);
  assert.equal(correr({ headers: { "x-requested-with": "rincones" } }), "pasa");
});

test("no se exige para leer, sin cookies, con Bearer ni en las métricas de sendBeacon", () => {
  assert.equal(correr({ method: "GET" }), "pasa");
  assert.equal(correr({ cookies: {} }), "pasa");
  assert.equal(correr({ headers: { authorization: "Bearer abc" } }), "pasa");
  assert.equal(correr({ path: "/api/analytics/collect" }), "pasa");
  assert.equal(correr({ path: "/api/promotions/events" }), "pasa");
});

test("la app tiene el chequeo conectado", async () => {
  const app = require("../src/app");
  const server = app.listen(0);
  try {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/logout`, {
      method: "POST",
      headers: { cookie: "refreshToken=abc" },
    });
    assert.equal(r.status, 403);
    assert.equal((await r.json()).code, "CSRF");
  } finally {
    server.close();
  }
});

test("CORS deja mandar la cabecera desde los orígenes permitidos", () => {
  assert.ok(corsOptions.allowedHeaders.includes("X-Requested-With"));
});
