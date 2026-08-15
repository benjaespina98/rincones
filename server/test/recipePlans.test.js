const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Los planes de la ficha viven en dos lados y tienen que decir lo mismo.
 *
 * El cliente pinta los chips desde `NIGHT_PLANS` y manda el valor elegido; el
 * controlador de la receta valida ese valor contra `PLANS` y, si no lo conoce,
 * cae en "cena". Ese fallback es correcto para basura que llegue de afuera, pero
 * esconde el error de verdad: agregar un plan sólo del lado del cliente hace que
 * el chip diga "En familia" y llegue la receta de una cena de a dos. Sin error,
 * sin log, sin nada — sólo una receta que no tiene que ver con lo que tocaste.
 *
 * Como son workspaces separados no hay un import que los ate, así que el archivo
 * del cliente se lee como texto. Es feo y es a propósito: es la única forma de
 * que la desincronización se note acá y no en producción.
 */
const PLANES_DEL_CLIENTE = path.join(
  __dirname,
  "..",
  "..",
  "client",
  "src",
  "data",
  "playlists.js"
);

const planesDelCliente = () => {
  const fuente = fs.readFileSync(PLANES_DEL_CLIENTE, "utf8");
  const bloque = fuente.match(/export const NIGHT_PLANS = \[([\s\S]*?)\];/);
  assert.ok(bloque, "no se encontró NIGHT_PLANS en el archivo del cliente");
  return [...bloque[1].matchAll(/value:\s*"([^"]+)"/g)].map((m) => m[1]);
};

test("todo plan que ofrece la app tiene su receta en el server", () => {
  const delCliente = planesDelCliente();
  assert.ok(delCliente.length > 0, "NIGHT_PLANS no puede quedar vacío");

  // Se lee del prompt para no exportar `PLANS` sólo para el test: es un detalle
  // interno del armado de la receta y no tiene otros consumidores.
  const fuenteServer = fs.readFileSync(
    path.join(__dirname, "..", "src", "services", "wineAi.service.js"),
    "utf8"
  );
  const bloque = fuenteServer.match(/const PLANS = \{([\s\S]*?)\n\};/);
  assert.ok(bloque, "no se encontró PLANS en wineAi.service.js");
  const delServer = [...bloque[1].matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);

  for (const plan of delCliente) {
    assert.ok(
      delServer.includes(plan),
      `el plan "${plan}" existe en la app pero no en el server: su receta caería en "cena"`
    );
  }
});
