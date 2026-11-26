const test = require("node:test");
const assert = require("node:assert/strict");

const { AlmacenUpstash, almacenCompartido } = require("../src/middleware/almacenRateLimit");

/** Un Redis de mentira que entiende los comandos que usa el almacén. */
const redisFalso = () => {
  const datos = new Map();
  const pedidos = [];
  const pedir = async (url, { body, headers }) => {
    pedidos.push({ url, body, headers });
    const filas = JSON.parse(body).map(([comando, clave, valor]) => {
      if (comando === "SET") {
        if (!datos.has(clave)) datos.set(clave, Number(valor));
        return { result: "OK" };
      }
      if (comando === "INCR" || comando === "DECR") {
        datos.set(clave, datos.get(clave) + (comando === "INCR" ? 1 : -1));
        return { result: datos.get(clave) };
      }
      if (comando === "DEL") datos.delete(clave);
      return { result: 60000 };
    });
    return { ok: true, json: async () => filas };
  };
  return { datos, pedidos, pedir };
};

const crear = (pedir, nombre = "login") => {
  const almacen = new AlmacenUpstash({ url: "https://redis.test/", token: "t", nombre, pedir });
  almacen.init({ windowMs: 60000 });
  return almacen;
};

test("cuenta, descuenta y resetea en Redis, compartido entre instancias", async () => {
  const redis = redisFalso();
  const una = crear(redis.pedir);
  const otra = crear(redis.pedir);

  assert.equal((await una.increment("1.1.1.1")).totalHits, 1);
  const segunda = await otra.increment("1.1.1.1");
  assert.equal(segunda.totalHits, 2);
  assert.ok(segunda.resetTime > new Date());

  await una.decrement("1.1.1.1");
  assert.equal((await una.increment("1.1.1.1")).totalHits, 2);
  await una.resetKey("1.1.1.1");
  assert.equal((await una.increment("1.1.1.1")).totalHits, 1);
});

test("descontar sin haber contado no deja el contador en negativo", async () => {
  const almacen = crear(redisFalso().pedir);
  await almacen.decrement("k");
  assert.equal((await almacen.increment("k")).totalHits, 1);
});

test("montado en express-rate-limit, los aciertos no cuentan y los fallos sí", async () => {
  const express = require("express");
  const rateLimit = require("express-rate-limit");
  const redis = redisFalso();
  const store = new AlmacenUpstash({ url: "https://redis.test", token: "t", nombre: "login", pedir: redis.pedir });
  const app = express();
  app.use(rateLimit({ windowMs: 60000, max: 2, skipSuccessfulRequests: true, store }));
  app.get("/:status", (req, res) => res.sendStatus(Number(req.params.status)));

  const server = app.listen(0);
  try {
    const pedir = async (status) => {
      const r = await fetch(`http://127.0.0.1:${server.address().port}/${status}`);
      await new Promise((resolver) => setTimeout(resolver, 20));
      return r.status;
    };
    for (let i = 0; i < 4; i += 1) assert.equal(await pedir(200), 200);
    assert.equal(await pedir(401), 401);
    assert.equal(await pedir(401), 401);
    assert.equal(await pedir(401), 429);
  } finally {
    server.close();
  }
});

test("a Redis no viajan la IP ni el email, y cada límite tiene su espacio", async () => {
  const redis = redisFalso();
  await crear(redis.pedir, "login").increment("1.1.1.1|ana@example.com");
  await crear(redis.pedir, "registro").increment("1.1.1.1|ana@example.com");

  assert.doesNotMatch(redis.pedidos[0].body, /ana@example\.com|1\.1\.1\.1/);
  assert.equal(redis.datos.size, 2);
  assert.match(redis.pedidos[0].url, /^https:\/\/redis\.test\/multi-exec$/);
});

test("si Redis falla se sigue contando en memoria", async () => {
  const avisos = console.warn;
  console.warn = () => {};
  try {
    const almacen = crear(async () => {
      throw new Error("sin red");
    });
    assert.equal((await almacen.increment("k")).totalHits, 1);
    assert.equal((await almacen.increment("k")).totalHits, 2);
  } finally {
    console.warn = avisos;
  }
});

test("sin las variables de Upstash no hay almacén compartido", () => {
  const previo = { ...process.env };
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  try {
    assert.equal(almacenCompartido("login"), undefined);
  } finally {
    process.env = previo;
  }
});
