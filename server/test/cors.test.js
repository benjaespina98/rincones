const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Guarda contra un bug real: el CORS declaraba GET/POST/PUT/DELETE/OPTIONS pero
 * NO PATCH, así que el preflight rechazaba tres funciones (ajustar stock, pasar
 * un guardado a la bodega, marcar favorito) antes de que llegaran al server.
 * Como nunca llegaban, en el back no quedaba ni rastro del error: sólo fallaban
 * en el navegador.
 *
 * Este test lee los verbos que las rutas realmente registran y verifica que
 * todos estén permitidos, así agregar una ruta con un verbo nuevo sin tocar el
 * CORS rompe el test en vez de romper la app.
 */

const readAll = (dir) =>
  fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".js"))
    .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
    .join("\n");

test("el CORS permite todos los verbos HTTP que usan las rutas", () => {
  const routesSrc = readAll(path.join(__dirname, "..", "src", "routes"));
  const appSrc = fs.readFileSync(path.join(__dirname, "..", "src", "app.js"), "utf8");

  const usedVerbs = new Set(
    [...routesSrc.matchAll(/router\.(get|post|put|patch|delete)\s*\(/g)].map((m) =>
      m[1].toUpperCase()
    )
  );
  assert.ok(usedVerbs.size > 0, "no se detectó ninguna ruta; revisá el parser del test");

  const methodsLine = appSrc.match(/methods:\s*\[([^\]]+)\]/);
  assert.ok(methodsLine, "no se encontró la lista `methods` en la config de CORS");

  const allowed = new Set(
    methodsLine[1]
      .split(",")
      .map((s) => s.replace(/["'\s]/g, "").toUpperCase())
      .filter(Boolean)
  );

  for (const verb of usedVerbs) {
    assert.ok(
      allowed.has(verb),
      `Las rutas usan ${verb} pero el CORS no lo permite. Agregalo a \`methods\` en src/app.js, ` +
        `o el navegador va a rechazar esas llamadas en el preflight.`
    );
  }
});
