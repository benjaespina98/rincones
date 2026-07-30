const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { METODOS } = require("../src/config/cors");

/**
 * Guarda contra un bug que ya pasó DOS VECES, y la segunda con este test ya
 * escrito.
 *
 * La primera: el CORS declaraba GET/POST/PUT/DELETE/OPTIONS pero NO PATCH, así que
 * el preflight rechazaba tres funciones (ajustar stock, pasar un guardado a la
 * bodega, marcar favorito) antes de que llegaran al server. Como nunca llegaban, en
 * el back no quedaba ni rastro: sólo fallaban en el navegador.
 *
 * La segunda: se arregló `src/app.js` y quedó sin arreglar la copia de la política
 * que vivía en `api/index.js`, el entrypoint de Vercel —que además contestaba el
 * preflight por su cuenta—. Este test miraba SÓLO `app.js`, así que pasó en verde
 * mientras producción seguía rota. Un test que verifica una de las dos copias de
 * una regla no protege: da confianza falsa, que es peor que no tener test.
 *
 * Por eso ahora hace las dos cosas:
 *  1. Verifica que todos los verbos que registran las rutas estén permitidos.
 *  2. Verifica que la política NO esté duplicada en ningún otro archivo. Una sola
 *     definición no se puede desincronizar de sí misma.
 */

const SERVER = path.join(__dirname, "..");

const readAll = (dir) =>
  fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".js"))
    .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
    .join("\n");

test("el CORS permite todos los verbos HTTP que usan las rutas", () => {
  const routesSrc = readAll(path.join(SERVER, "src", "routes"));

  const usedVerbs = new Set(
    [...routesSrc.matchAll(/router\.(get|post|put|patch|delete)\s*\(/g)].map((m) =>
      m[1].toUpperCase()
    )
  );
  assert.ok(usedVerbs.size > 0, "no se detectó ninguna ruta; revisá el parser del test");

  const allowed = new Set(METODOS.map((m) => m.toUpperCase()));

  for (const verb of usedVerbs) {
    assert.ok(
      allowed.has(verb),
      `Las rutas usan ${verb} pero el CORS no lo permite. Agregalo a \`METODOS\` en ` +
        `src/config/cors.js, o el navegador va a rechazar esas llamadas en el preflight.`
    );
  }
});

test("la lista de métodos permitidos existe UNA sola vez en el server", () => {
  /**
   * Cualquier archivo que declare métodos de CORS por su cuenta es una copia que
   * algún día va a quedar vieja. El único autorizado es config/cors.js.
   *
   * Se buscan las dos formas en que se puede escribir: la opción `methods` del
   * middleware y la cabecera puesta a mano. Es exactamente el par que se
   * desincronizó la última vez.
   */
  const sospechosos = [];
  const patron = /methods:\s*\[|Access-Control-Allow-Methods/;

  const recorrer = (dir) => {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entrada.name === "node_modules") continue;
      const completo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) {
        recorrer(completo);
        continue;
      }
      if (!entrada.name.endsWith(".js")) continue;

      const relativo = path.relative(SERVER, completo).replace(/\\/g, "/");
      // El único lugar donde la política puede estar escrita, y el test que la
      // controla.
      if (relativo === "src/config/cors.js" || relativo === "test/cors.test.js") continue;

      if (patron.test(fs.readFileSync(completo, "utf8"))) sospechosos.push(relativo);
    }
  };

  recorrer(path.join(SERVER, "src"));
  recorrer(path.join(SERVER, "api"));

  assert.deepEqual(
    sospechosos,
    [],
    `Estos archivos declaran métodos de CORS por su cuenta:\n  ${sospechosos.join("\n  ")}\n` +
      `Usá la política de src/config/cors.js. Dos copias de esta regla ya rompieron ` +
      `producción una vez, y el síntoma (botones que no hacen nada, sin errores en el log) ` +
      `manda a buscar el problema al lugar equivocado.`
  );
});
