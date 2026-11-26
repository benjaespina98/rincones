const test = require("node:test");
const assert = require("node:assert/strict");
const {
  canonicalVarietal,
  checkCoherence,
  identificationVerdict,
} = require("../src/data/wineValidation");

/**
 * La coherencia entre campos y el veredicto de una lectura.
 *
 * Todo lo que se prueba acá viene de errores que llegaron a producción: un vino
 * guardado con la bodega de nombre, una uva a la que le faltaba una letra, y
 * lecturas flojas que igual entraban al catálogo público. Son las dos preguntas
 * de las que depende que la base compartida no se ensucie: ¿esto se contradice?
 * y ¿alcanza para publicarlo?
 */

// ── El vocabulario de uvas ──────────────────────────────────────────────────

test("una uva a la que le falta una letra se corrige sola", () => {
  // El caso real: "Blend" llegó como "Blen" y así quedó en la ficha y en la
  // tarjeta de búsqueda. Una letra de diferencia sobre una palabra larga no es
  // otra uva, es un carácter perdido entre el relieve de la etiqueta y el modelo.
  const blen = canonicalVarietal("Blen");
  assert.equal(blen.value, "Blend");
  assert.equal(blen.corrected, true);
  assert.equal(blen.known, true);

  const malbek = canonicalVarietal("Malbek");
  assert.equal(malbek.value, "Malbec");
  assert.equal(malbek.corrected, true);
});

test("una uva que reconocemos se devuelve intacta", () => {
  const uva = canonicalVarietal("Cabernet Sauvignon");
  assert.equal(uva.value, "Cabernet Sauvignon");
  assert.equal(uva.corrected, false);
  assert.equal(uva.known, true);
});

test("una uva que no reconocemos NO se borra: se marca", () => {
  // Perder el dato sería peor que no reconocerlo. Puede ser una uva real que no
  // tenemos listada; lo que hace la marca es frenar la publicación, no el alta.
  const uva = canonicalVarietal("Xinomavro");
  assert.equal(uva.value, "Xinomavro", "el dato de la persona no se toca");
  assert.equal(uva.known, false);
});

test("los cortes cuentan como uva válida, vengan de donde vengan", () => {
  // El vocabulario se arma de tres fuentes (ver `buildVocabulary`): las uvas de
  // referencia, los varietales del catálogo curado y las formas de nombrar un
  // corte declaradas en data/grapes.js. Un nombre de corte no está en ninguna
  // lista canónica de uvas y sin embargo es un dato correcto de una etiqueta.
  assert.equal(canonicalVarietal("Blend").known, true, "sinónimo genérico");
  assert.equal(canonicalVarietal("Blend de tintas").known, true, "otra forma del genérico");
  assert.equal(canonicalVarietal("Gran Blend").known, true, "corte con nombre propio, del catálogo");
  assert.equal(canonicalVarietal("Gran Corte").known, true, "corte con nombre propio, sin fila propia");
});

test("un corte con nombre propio NO se confunde con el genérico", () => {
  // Reconocerlo como uva válida es una cosa; tratarlo como si fuera "Blend" es
  // otra, y sería un error: son botellas distintas y compartirían foto y precio.
  const { canonicalGrape } = require("../src/data/grapes");

  assert.equal(canonicalGrape("Blend de tintas"), "Blend", "esto sí es el genérico");
  assert.equal(canonicalGrape("Gran Corte"), "Gran Corte", "esto no");
  assert.equal(canonicalGrape("Gran Blend"), "Gran Blend");
});

// ── Coherencia entre campos ─────────────────────────────────────────────────

test("un vino sin nombre ni línea no tiene nombre", () => {
  const issues = checkCoherence({ name: "", line: "", winery: "Mosquita Muerta" });
  assert.ok(issues.includes("sin-nombre"));
});

test("el nombre igual a la bodega se detecta (el bug Pispi)", () => {
  // Es exactamente lo que quedaba guardado cuando el nombre visible caía a la
  // bodega: dos campos distintos con el mismo contenido. Alguno de los dos está
  // mal y no sabemos cuál, así que hay que preguntar.
  const issues = checkCoherence({ name: "Pispi", line: "", winery: "Pispi" });
  assert.ok(issues.includes("nombre-es-bodega"));
});

test("un vino que de verdad se llama como su bodega no se marca", () => {
  // "Clos de los Siete" y "Cheval des Andes" existen y se llaman así. El catálogo
  // curado es el que lo sabe, así que esto no necesita una lista aparte.
  const issues = checkCoherence({
    name: "Clos de los Siete",
    winery: "Clos de los Siete",
    varietal: "Blend",
  });
  assert.ok(!issues.includes("nombre-es-bodega"));
});

test("una uva inválida se marca como incoherencia", () => {
  const issues = checkCoherence({ line: "Reserva", winery: "Trapiche", varietal: "Xyzzy" });
  assert.ok(issues.includes("varietal-desconocido"));
});

test("un tipo que contradice a la uva se marca", () => {
  // Un blanco de Malbec no existe.
  assert.ok(
    checkCoherence({ line: "Reserva", winery: "X", varietal: "Malbec", type: "white" })
      .includes("tipo-incoherente")
  );
  // Un tinto de Torrontés tampoco.
  assert.ok(
    checkCoherence({ line: "Reserva", winery: "X", varietal: "Torrontés", type: "red" })
      .includes("tipo-incoherente")
  );
});

test("un espumante o un rosado NUNCA contradicen a la uva", () => {
  // Son botellas normales: un espumante de Pinot Noir y un rosado de Malbec se
  // hacen todos los días. Marcarlos sería pedirle a la gente que "corrija" algo
  // que está bien, que es la forma más rápida de que dejen de leer los avisos.
  for (const type of ["sparkling", "rosé", "fortified"]) {
    const issues = checkCoherence({ line: "Extra Brut", winery: "X", varietal: "Pinot Noir", type });
    assert.ok(!issues.includes("tipo-incoherente"), `${type} no puede contradecir`);
  }
});

test("una cosecha imposible se marca", () => {
  assert.ok(checkCoherence({ line: "A", winery: "X", vintage: "1650" }).includes("cosecha-implausible"));
  assert.ok(checkCoherence({ line: "A", winery: "X", vintage: "3000" }).includes("cosecha-implausible"));
  assert.ok(!checkCoherence({ line: "A", winery: "X", vintage: "2019" }).includes("cosecha-implausible"));
  // Sin cosecha no es un problema: la mayoría de las etiquetas no la muestran.
  assert.ok(!checkCoherence({ line: "A", winery: "X", vintage: "" }).includes("cosecha-implausible"));
});

// ── El veredicto ────────────────────────────────────────────────────────────

const LECTURA_BUENA = {
  values: {
    name: "",
    line: "Saint Felicien",
    winery: "Catena Zapata",
    varietal: "Malbec",
    vintage: "2019",
    region: "Luján de Cuyo, Mendoza",
    type: "red",
  },
  confidence: { name: 0, line: 96, winery: 94, varietal: 92, vintage: 90, region: 85, type: 80 },
  source: "scan",
};

test("alta confianza y sin contradicciones: se puede publicar", () => {
  assert.equal(identificationVerdict(LECTURA_BUENA), "trusted");
});

test("baja confianza en el nombre: hay que revisar antes de guardar", () => {
  const verdict = identificationVerdict({
    ...LECTURA_BUENA,
    confidence: { ...LECTURA_BUENA.confidence, line: 30 },
  });
  assert.equal(verdict, "doubtful");
});

test("confianza intermedia: entra a la bodega pero NO publica", () => {
  const verdict = identificationVerdict({
    ...LECTURA_BUENA,
    confidence: { ...LECTURA_BUENA.confidence, line: 65, winery: 60 },
  });
  assert.equal(verdict, "unverified");
});

test("una incoherencia baja el veredicto aunque la confianza sea alta", () => {
  // El modelo puede estar segurísimo de haber leído "Blen". Estar seguro de algo
  // que no existe no lo vuelve cierto.
  const verdict = identificationVerdict({
    ...LECTURA_BUENA,
    values: { ...LECTURA_BUENA.values, varietal: "Xyzzy" },
  });
  assert.equal(verdict, "unverified");
});

test("el nombre igual a la bodega bloquea, con cualquier confianza", () => {
  const verdict = identificationVerdict({
    values: { name: "Pispi", line: "", winery: "Pispi", varietal: "Blend", type: "red" },
    confidence: { name: 99, line: 0, winery: 99, varietal: 90, vintage: 0, region: 0, type: 80 },
    source: "scan",
  });
  assert.equal(verdict, "doubtful");
});

test("…salvo que la persona confirme que se llama igual que la bodega", () => {
  // Norton, El Enemigo, Achaval Ferrer, Durigutti: el catálogo curado tiene 25
  // filas donde el nombre coincide con la bodega, y los que todavía no están en
  // él necesitaban una salida. Sin esto el aviso no se iba escribiera lo que
  // escribiera la persona, y el vino no se podía guardar.
  const valores = {
    name: "Pispi",
    line: "",
    winery: "Pispi",
    varietal: "Blend",
    type: "red",
    sameNameConfirmed: true,
  };
  assert.deepEqual(checkCoherence(valores), [], "confirmado, no queda nada que marcar");
  const verdict = identificationVerdict({
    values: valores,
    confidence: { name: 99, line: 0, winery: 99, varietal: 90, vintage: 0, region: 0, type: 80 },
    source: "scan",
  });
  assert.equal(verdict, "trusted");
});

test("el que se llama igual y ESTÁ en el catálogo curado no necesita confirmación", () => {
  const issues = checkCoherence({
    name: "Norton",
    line: "",
    winery: "Norton",
    varietal: "Malbec",
    type: "red",
  });
  assert.deepEqual(issues, [], "a estos no hay nada que preguntarles");
});

test("un campo que editó la persona vale más que cualquier lectura", () => {
  // Nadie tipea el nombre de una bodega por accidente. Es la señal más fuerte
  // que tenemos y es lo que permite que corregir un escaneo flojo lo habilite.
  const verdict = identificationVerdict({
    ...LECTURA_BUENA,
    confidence: { ...LECTURA_BUENA.confidence, line: 10, winery: 10 },
    editedFields: ["line", "winery"],
  });
  assert.equal(verdict, "trusted");
});

test("la carga a mano cuenta como escrita por la persona", () => {
  const verdict = identificationVerdict({
    values: { name: "", line: "Privada", winery: "Norton", varietal: "Blend", type: "red" },
    confidence: {},
    source: "manual",
  });
  assert.equal(verdict, "trusted");
});

test("a mano y sin bodega: entra igual, pero no publica", () => {
  // Media identidad alcanza para tu bodega y no para un catálogo que después
  // consulta otra gente. Frenar el alta acá sería cobrarle a la persona un
  // requisito que sólo importa del lado público.
  const verdict = identificationVerdict({
    values: { name: "", line: "Privada", winery: "", varietal: "Blend", type: "red" },
    confidence: {},
    source: "manual",
  });
  assert.equal(verdict, "unverified");
});

test("sólo la uva sin bodega es un nombre de relleno; llamarse como la bodega es un nombre real", () => {
  const { esNombreProvisorio } = require("../src/data/wineValidation");
  assert.equal(esNombreProvisorio({ name: "Malbec", varietal: "Malbec" }), true);
  assert.equal(esNombreProvisorio({ name: "Salentein", winery: "Salentein" }), false);
  assert.equal(esNombreProvisorio({ name: "Numina", winery: "Salentein" }), false);
  assert.equal(esNombreProvisorio({ name: "Malbec", winery: "Salentein", varietal: "Malbec" }), false);
});
