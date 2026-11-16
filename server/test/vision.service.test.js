const test = require("node:test");
const assert = require("node:assert/strict");
const geminiService = require("../src/services/gemini.service");
const visionService = require("../src/services/vision.service");
const { descartarLetraSuelta, ubicarNombrePropio } = visionService;

/**
 * ── EL BUG REAL: "TOMERO" SE GUARDÓ COMO "T" ────────────────────────────────
 *
 * Reportado en vivo: se escaneó una etiqueta que dice "Tomero" (en cursiva) y
 * el vino quedó guardado con nombre "T" — una sola letra. Gemini entregó esa
 * letra como su mejor lectura del nombre propio, con la confianza que le
 * pareció, y nada en el camino (armar el nombre visible, calcular el
 * veredicto, guardar) desconfiaba de que una letra sola fuera un dato real.
 *
 * No se puede probar que Gemini "lea mejor" — es un modelo, no una regla—,
 * así que lo que fijan estos tests es la parte que sí es determinística: una
 * letra sola nunca puede sobrevivir como nombre, línea o bodega, tenga la
 * confianza que tenga.
 */
test("una letra sola nunca es un nombre, línea o bodega — se descarta, no se degrada nomás", () => {
  const resultado = descartarLetraSuelta({
    winery: "T",
    line: "Reserva",
    name: "M",
    varietal: "Malbec",
    vintage: "2020",
    region: "Mendoza",
    type: "red",
  });
  assert.equal(resultado.winery, "", "una bodega de una sola letra se descarta");
  assert.equal(resultado.name, "", "un nombre de una sola letra se descarta");
  assert.equal(resultado.line, "Reserva", "la línea de verdad no se toca");
});

test("un nombre corto de VERDAD (dos letras o más) no se toca", () => {
  // "V8", "DV" — nombres cortos reales, no lecturas cortadas. El corte es
  // justo en una letra sola: dos ya alcanzan para distinguir una botella.
  const resultado = descartarLetraSuelta({
    winery: "Bodega X",
    line: "",
    name: "V8",
    varietal: "Blend",
    vintage: "",
    region: "",
    type: "red",
  });
  assert.equal(resultado.name, "V8");
});

test("un campo vacío sigue vacío (no hay nada que descartar)", () => {
  const resultado = descartarLetraSuelta({
    winery: "",
    line: "",
    name: "",
    varietal: "",
    vintage: "",
    region: "",
    type: "unknown",
  });
  assert.equal(resultado.winery, "");
  assert.equal(resultado.name, "");
  assert.equal(resultado.line, "");
});

test("con tilde o eñe la letra sola también se reconoce", () => {
  const resultado = descartarLetraSuelta({
    winery: "", line: "", name: "Ñ", varietal: "", vintage: "", region: "", type: "unknown",
  });
  assert.equal(resultado.name, "");
});

/**
 * ── EL CASO EXACTO, DE PUNTA A PUNTA ─────────────────────────────────────────
 * Simula lo que devolvió Gemini de verdad (según el reporte): "Tomero" leído
 * como "T" en el nombre, sin línea. `analyzeWineLabel` entero —incluida la
 * salida que viaja al cliente— nunca puede mostrar esa letra en ningún lado.
 */
test("el caso reportado: 'Tomero' leído como 'T' no llega al cliente como 'T'", async () => {
  const original = geminiService.generateJson;
  geminiService.generateJson = async () => ({
    winery: "",
    line: "",
    name: "T",
    varietal: "Malbec",
    vintage: "",
    region: "",
    type: "red",
    isWineLabel: true,
    confidence: { winery: 0, line: 0, name: 72, varietal: 90, vintage: 0, region: 0, type: 60 },
  });

  try {
    const lectura = await visionService.analyzeWineLabel(Buffer.from("foto-falsa"));
    assert.equal(lectura.name, "", "el nombre de una letra no sobrevive");
    assert.equal(lectura.displayName, "", "el nombre visible tampoco puede ser 'T'");
    assert.equal(lectura.confidence.name, 0, "sin dato, la confianza es 0 — no 72");
    // Cae al mismo camino ya resuelto que una etiqueta sin nombre legible: la
    // revisión lo muestra como "sin identificar", no como un dato confiable.
    assert.ok(lectura.issues.includes("sin-nombre"));
  } finally {
    geminiService.generateJson = original;
  }
});

test("ubicarNombrePropio no toca un nombre propio de verdad", () => {
  const resultado = ubicarNombrePropio({
    winery: "Catena Zapata",
    line: "",
    name: "Nicasia Vineyards",
    varietal: "Malbec",
  });
  assert.equal(resultado.name, "Nicasia Vineyards");
});

test("la elaboración de la etiqueta (corte, crianza, alcohol) llega saneada", async () => {
  const original = geminiService.generateJson;
  const base = {
    winery: "Catena Zapata", line: "", name: "Nicasia", varietal: "Blend", vintage: "2019", region: "", type: "red",
    isWineLabel: true,
    confidence: { winery: 95, line: 0, name: 90, varietal: 90, vintage: 90, region: 0, type: 70 },
  };
  try {
    geminiService.generateJson = async () => ({
      ...base, composition: "60% Malbec, 40% Cabernet Franc", aging: "12 meses en roble francés", alcohol: 13.54,
    });
    const ok = await visionService.analyzeWineLabel(Buffer.from("foto-falsa"));
    assert.equal(ok.composition, "60% Malbec, 40% Cabernet Franc");
    assert.equal(ok.aging, "12 meses en roble francés");
    assert.equal(ok.alcohol, 13.5);

    // Una graduación imposible es un error de lectura (un lote, un volumen): se descarta.
    geminiService.generateJson = async () => ({ ...base, alcohol: 750 });
    const mala = await visionService.analyzeWineLabel(Buffer.from("foto-falsa"));
    assert.equal(mala.alcohol, 0);
    assert.equal(mala.composition, "");
    assert.equal(mala.aging, "");
  } finally {
    geminiService.generateJson = original;
  }
});
