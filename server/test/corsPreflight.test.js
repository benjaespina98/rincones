const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

/**
 * El preflight de verdad, contra el server levantado.
 *
 * ── POR QUÉ NO ALCANZA CON EL TEST QUE LEE EL CÓDIGO ────────────────────────
 * `cors.test.js` verifica que la lista de métodos incluya los verbos que usan las
 * rutas, leyendo los archivos. Eso ya existía cuando producción estaba rota: la
 * lista de `app.js` estaba bien y la petición nunca la usaba, porque el preflight
 * lo contestaba otra copia en el entrypoint de Vercel.
 *
 * Un test que lee el código comprueba lo que dice el código. Este comprueba lo que
 * el navegador RECIBE, que es lo único que decide si el botón funciona. Es la
 * diferencia entre las dos formas de estar en verde: una es correcta y la otra es
 * confianza falsa.
 *
 * PATCH es el verbo que importa acá: lo usan ajustar el stock con "+"/"−", pasar un
 * guardado a la bodega, marcar favorito en Guardados y —desde el gestor de
 * campañas— mostrar/ocultar y reordenar una campaña. Si el preflight no lo permite,
 * las seis cosas fallan en el navegador sin dejar rastro en ningún log del server.
 */

// El CORS corre antes que cualquier ruta, así que esto no necesita base de datos.
const app = require("../src/app");

const ORIGEN = "http://localhost:5173";

/** Un preflight como el que manda el navegador antes de un PATCH. */
const preflight = (path, metodo) =>
  new Promise((resolve, reject) => {
    const server = http.createServer(app).listen(0, () => {
      const req = http.request(
        {
          port: server.address().port,
          path,
          method: "OPTIONS",
          headers: {
            Origin: ORIGEN,
            "Access-Control-Request-Method": metodo,
            "Access-Control-Request-Headers": "content-type,authorization",
          },
        },
        (res) => {
          res.resume();
          res.on("end", () => {
            server.close();
            resolve({ status: res.statusCode, headers: res.headers });
          });
        }
      );
      req.on("error", (e) => {
        server.close();
        reject(e);
      });
      req.end();
    });
  });

test("el preflight de un PATCH devuelve PATCH entre los métodos permitidos", async () => {
  const { status, headers } = await preflight("/api/wines/123/stock", "PATCH");

  assert.ok(status < 400, `el preflight respondió ${status}`);

  const permitidos = String(headers["access-control-allow-methods"] || "")
    .split(",")
    .map((m) => m.trim().toUpperCase());

  assert.ok(
    permitidos.includes("PATCH"),
    `El navegador recibió "${headers["access-control-allow-methods"]}". Sin PATCH ahí, el ` +
      `"+"/"−" del stock y el interruptor de las campañas no funcionan y no queda ningún ` +
      `error en el server, porque la petición nunca sale.`
  );

  assert.equal(headers["access-control-allow-origin"], ORIGEN);
  assert.equal(headers["access-control-allow-credentials"], "true");
});

test("un origen desconocido no recibe permiso", async () => {
  const server = http.createServer(app).listen(0);
  await new Promise((r) => server.once("listening", r));

  const respuesta = await new Promise((resolve, reject) => {
    const req = http.request(
      {
        port: server.address().port,
        path: "/api/health",
        method: "GET",
        headers: { Origin: "https://sitio-que-no-es-mio.com" },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers }));
      }
    );
    req.on("error", reject);
    req.end();
  });
  server.close();

  // Que la lista de métodos sea generosa no significa que cualquier sitio pueda
  // usar la API: el control es el origen, y sigue en pie.
  assert.equal(respuesta.headers["access-control-allow-origin"], undefined);
});
