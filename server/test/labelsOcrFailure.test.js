const test = require("node:test");
const assert = require("node:assert/strict");
const tesseract = require("tesseract.js");
const labelsService = require("../src/services/labels.service");

/**
 * El OCR local de etiquetas.
 *
 * Sin `errorHandler`, tesseract.js además de rechazar la promesa hace `throw`
 * dentro del handler de mensajes del worker: una uncaughtException que tira el
 * proceso entero. Se fija que el worker se crea con uno y que, si el OCR falla,
 * el worker igual se termina y el error llega como promesa rechazada.
 */

test("createWorker recibe un errorHandler, y un fallo rechaza la promesa y termina el worker", async () => {
  const original = tesseract.createWorker;
  let opciones;
  let terminado = false;
  tesseract.createWorker = async (o) => {
    opciones = o;
    return {
      loadLanguage: async () => {},
      initialize: async () => {},
      recognize: async () => { throw new Error("Leptonica no pudo decodificar"); },
      terminate: async () => { terminado = true; },
    };
  };
  try {
    await assert.rejects(() => labelsService.analyzeImageBuffer(Buffer.from("x")), /Leptonica/);
  } finally {
    tesseract.createWorker = original;
  }
  assert.equal(typeof opciones.errorHandler, "function", "sin errorHandler un fallo tira el proceso");
  assert.doesNotThrow(() => opciones.errorHandler(new Error("x")));
  assert.equal(terminado, true);
});
