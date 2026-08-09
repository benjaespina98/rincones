const test = require("node:test");
const assert = require("node:assert/strict");
const {
  composeDisplayName,
  composeSearchName,
  identityKey,
  poolKey,
} = require("../src/data/wineIdentity");

/**
 * El nombre visible dejó de incluir la uva ("Saint Felicien", no "Saint Felicien
 * Malbec"). Es un cambio chico en la superficie y delicado por debajo, porque de
 * estos strings salen tres cosas distintas:
 *
 *   - lo que se MUESTRA           → composeDisplayName  (sin uva)
 *   - lo que se BUSCA             → composeSearchName   (con uva)
 *   - las CLAVES compartidas      → poolKey             (con uva, y compatible
 *                                                        con los nombres viejos)
 *
 * Confundir dos de las tres es lo que haría que dos vinos distintos compartan
 * foto o que una búsqueda obvia no devuelva nada.
 */

const SAINT_FELICIEN = {
  winery: "Catena Zapata",
  line: "Saint Felicien",
  varietal: "Malbec",
  name: "",
};

test("el nombre visible no lleva la uva", () => {
  assert.equal(composeDisplayName(SAINT_FELICIEN), "Saint Felicien");

  // El nombre propio le gana a la línea cuando existe.
  assert.equal(
    composeDisplayName({ name: "Angélica Zapata", line: "", varietal: "Malbec" }),
    "Angélica Zapata"
  );

  /**
   * Sin línea ni nombre propio, el nombre queda VACÍO. No cae a la bodega.
   *
   * El fallback existía y parecía inofensivo ("mejor la bodega que nada"), y era
   * el bug de identidad más caro que tuvimos. Cuando la visión leía el nombre de
   * fantasía como si fuera la bodega —pasa seguido: en la etiqueta el nombre es
   * lo más grande y la bodega va chica abajo— este fallback lo copiaba también
   * al nombre. El vino quedaba `{ name: "Pispi", winery: "Pispi" }` y desde ahí
   * entraba al catálogo público, donde ya no era el error de una sola persona.
   *
   * Vacío es lo único cierto: un vino del que sólo sabemos la bodega no tiene
   * nombre, y quien decide qué hacer con eso es la pantalla de revisión.
   */
  assert.equal(composeDisplayName({ winery: "Bodega X" }), "");
  assert.equal(composeDisplayName({ winery: "Mosquita Muerta", name: "", line: "" }), "");
});

test("la BÚSQUEDA sí puede caer a la bodega, y no es una contradicción", () => {
  // Buscar "Salentein" trae lo que esa bodega hace y no le miente a nadie.
  // Llamar "Salentein" a una botella cuyo nombre no leímos, sí. Son dos usos
  // distintos del mismo dato y por eso son dos funciones.
  assert.equal(composeSearchName({ winery: "Bodegas Salentein" }), "Bodegas Salentein");
  assert.equal(
    composeSearchName({ winery: "Bodegas Salentein", varietal: "Malbec" }),
    "Bodegas Salentein Malbec"
  );
});

test("el nombre de búsqueda SÍ lleva la uva", () => {
  // Nadie busca "Saint Felicien" a secas cuando quiere el Malbec.
  assert.equal(composeSearchName(SAINT_FELICIEN), "Saint Felicien Malbec");

  // Y no la repite si el nombre ya la trae (datos viejos).
  assert.equal(
    composeSearchName({ name: "Saint Felicien Malbec", varietal: "Malbec" }),
    "Saint Felicien Malbec"
  );

  // Sin uva cargada, es el nombre visible.
  assert.equal(composeSearchName({ line: "Privada" }), "Privada");
});

test("dos uvas de la misma línea NO comparten la clave de los pools", () => {
  // Es el riesgo concreto de sacar la uva del nombre: sin ella en la clave, el
  // Malbec y el Cabernet de Saint Felicien compartirían foto y precio.
  const malbec = poolKey("Saint Felicien", "Catena Zapata", "Malbec");
  const cabernet = poolKey("Saint Felicien", "Catena Zapata", "Cabernet Sauvignon");

  assert.notEqual(malbec, cabernet);
  assert.ok(malbec.includes("malbec"));
});

test("la clave de los pools es la MISMA que generaban los nombres viejos", () => {
  // Los nombres viejos ya incluían la uva. Si la clave cambiara, todo lo que la
  // comunidad aportó hasta hoy (fotos, precios) quedaría huérfano.
  const nueva = poolKey("Saint Felicien", "Catena Zapata", "Malbec");
  const vieja = poolKey("Saint Felicien Malbec", "Catena Zapata", "Malbec");

  assert.equal(nueva, vieja, "sacar la uva del nombre no puede partir los pools en dos");
});

test("la deduplicación sigue reconociendo el mismo vino con nombre viejo o nuevo", () => {
  // Volver a escanear una etiqueta tiene que sumar botellas, no crear una fila
  // nueva — también para los vinos guardados antes de este cambio.
  const guardadoViejo = identityKey({
    name: "Saint Felicien Malbec",
    line: "",
    varietal: "Malbec",
    winery: "Catena Zapata",
  });
  const escaneadoHoy = identityKey({
    name: "Saint Felicien",
    line: "Saint Felicien",
    varietal: "Malbec",
    winery: "Catena Zapata",
  });

  assert.deepEqual(guardadoViejo, escaneadoHoy);
});

test("el catálogo curado muestra la línea y busca con la uva", () => {
  const { CATALOG } = require("../src/data/argentineWines");
  const fila = CATALOG.find((w) => w.line === "Saint Felicien" && w.varietal === "Malbec");

  assert.ok(fila, "el catálogo tiene que tener este vino");
  assert.equal(fila.name, "Saint Felicien", "el nombre visible es la línea");
  assert.equal(fila.varietal, "Malbec", "la uva sigue siendo campo propio");
  // Y el índice de búsqueda las tiene a las dos: buscar la frase completa anda.
  assert.match(fila.haystack, /saint felicien/);
  assert.match(fila.haystack, /malbec/);
});
