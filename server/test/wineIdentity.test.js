const test = require("node:test");
const assert = require("node:assert/strict");
const {
  canonicalGrape,
  canonicalWinery,
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

/**
 * ── EL PISPI DUPLICADO ──────────────────────────────────────────────────────
 * El mismo vino, escaneado dos veces, salió como dos tarjetas en la búsqueda.
 * Las dos lecturas eran correctas: la etiqueta admite las dos transcripciones.
 * Lo que estaba mal era que la clave usaba los strings crudos.
 */
test("la misma botella escrita de dos maneras es UNA sola clave", () => {
  const escaneo1 = poolKey("Pispi", "Mosquita Muerta Wines", "Blend");
  const escaneo2 = poolKey("PISPI", "Mosquita Muerta", "Blend de tintas");

  assert.equal(escaneo1, escaneo2, "el mismo vino no puede ocupar dos filas del catálogo");
});

test("y también deduplica en la búsqueda, contra el catálogo curado", () => {
  // La fila del catálogo curado ("Mosquita Muerta Wines / Pispi / Blend") y la
  // lectura suelta tienen que colapsar: si no, la comunitaria aparece al lado de
  // la curada y el usuario ve el vino dos veces.
  const curado = identityKey({
    winery: "Mosquita Muerta Wines",
    line: "Pispi",
    varietal: "Blend",
    name: "Pispi",
  });
  const leido = identityKey({
    winery: "Mosquita Muerta",
    name: "PISPI",
    varietal: "Blend de tintas",
  });

  assert.deepEqual(curado, leido);
});

test("los cortes CON APELLIDO no colapsan en el genérico", () => {
  // Es el riesgo de normalizar uvas: "Gran Blend" es el corte alto de Rutini
  // Apartado y "Blend de Blancs" es un corte de blancos. Fundirlos con el
  // "Blend" de entrada haría que compartan foto, precio y reseñas.
  assert.equal(canonicalGrape("Gran Blend"), "Gran Blend");
  assert.equal(canonicalGrape("Blend de Blancs"), "Blend de Blancs");
  assert.equal(canonicalGrape("Barrel Blend"), "Barrel Blend");

  assert.notEqual(
    poolKey("Apartado", "Rutini Wines", "Gran Blend"),
    poolKey("Apartado", "Rutini Wines", "Blend")
  );

  // Un corte de tintas y uno de blancos tampoco son la misma botella.
  assert.notEqual(canonicalGrape("Blend de tintas"), canonicalGrape("Blend blanco"));
});

test("la uva que no está en la tabla vuelve intacta", () => {
  // Unificar sinónimos conocidos no es adivinar: una uva que no listamos se
  // respeta tal cual, que es lo único cierto sobre ella.
  assert.equal(canonicalGrape("Malbec"), "Malbec");
  assert.equal(canonicalGrape("Petit Verdot"), "Petit Verdot");
  assert.equal(canonicalGrape(""), "");
});

test("la bodega pierde lo societario y conserva el nombre propio", () => {
  assert.equal(canonicalWinery("Mosquita Muerta Wines"), "mosquita muerta");
  assert.equal(canonicalWinery("Mosquita Muerta"), "mosquita muerta");
  assert.equal(canonicalWinery("Bodega Norton"), "norton");
  assert.equal(canonicalWinery("Bodegas Salentein"), "salentein");
  assert.equal(canonicalWinery("Pulenta Estate"), "pulenta");

  // "Finca" y "Familia" NO son ruido: son parte del nombre. "Las Moras" a secas
  // no es como se llama esa bodega para nadie.
  assert.equal(canonicalWinery("Finca Las Moras"), "finca las moras");

  // Y limpiar no puede dejarla en la nada.
  assert.equal(canonicalWinery("Bodegas"), "bodegas");
});

test("dos bodegas distintas siguen siendo distintas", () => {
  // La normalización agrupa variantes de la MISMA bodega. Si además fundiera
  // bodegas diferentes, el arreglo sería peor que el problema.
  assert.notEqual(canonicalWinery("Susana Balbo Wines"), canonicalWinery("Bodegas Balbo"));
  assert.notEqual(canonicalWinery("Bodega Callia"), canonicalWinery("Bodega Chacra"));
});

test("normalizar la bodega no parte lo que ya estaba bien", () => {
  // Los pools viejos se guardaron con la bodega tal cual. Las que no tienen
  // ruido societario —la mayoría— tienen que producir exactamente la misma
  // clave que antes, o el cambio dejaría huérfanas sus fotos y sus precios.
  assert.equal(
    poolKey("Saint Felicien", "Catena Zapata", "Malbec"),
    "saint felicien malbec|catena zapata"
  );
});

/**
 * La red de seguridad de toda la normalización: NINGÚN par de vinos del catálogo
 * curado puede compartir clave.
 *
 * Normalizar bodega y uva es agrupar variantes de la misma botella, y el riesgo
 * simétrico es agrupar botellas distintas. Este test lo verifica sobre los 410
 * vinos reales en vez de sobre ejemplos elegidos a mano, así que cubre casos que
 * nadie pensó — como que Luigi Bosca De Sangre existe en "Corte" y en "White
 * Blend" a la vez, o que el catálogo escribe el corte de blancos de dos maneras
 * ("Blend Blanco" y "White Blend").
 *
 * Si alguien agrega un sinónimo de más a la tabla, esto se pone rojo acá y no en
 * la app con dos vinos compartiendo foto.
 */
test("ningún par de vinos del catálogo curado colapsa en la misma clave", () => {
  const { CATALOG } = require("../src/data/argentineWines");

  const agrupar = (clave) => {
    const mapa = new Map();
    for (const w of CATALOG) {
      const k = clave(w);
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k).push(`${w.winery} / ${w.line} / ${w.varietal}`);
    }
    return [...mapa].filter(([, vinos]) => vinos.length > 1);
  };

  const porIdentidad = agrupar((w) => {
    const { core, varietal, wineryToken } = identityKey(w);
    return `${core}|${varietal}|${wineryToken}`;
  });
  assert.deepEqual(porIdentidad, [], "dos vinos distintos se deduplicarían entre sí");

  const porPool = agrupar((w) => poolKey(w.name, w.winery, w.varietal));
  assert.deepEqual(porPool, [], "dos vinos distintos compartirían foto y precio");
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
