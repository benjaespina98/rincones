const test = require("node:test");
const assert = require("node:assert/strict");
const { armarManifest, parsearManifest, vinosDelCatalogo, evaluarCarpeta } = require("../src/utils/prepararFotos");

const BOM = "﻿";

test("el manifest que arma el script se vuelve a leer completo (ida y vuelta)", () => {
  const filas = parsearManifest(armarManifest());
  const vinos = vinosDelCatalogo();
  assert.equal(filas.length, vinos.length);
  assert.ok(filas.every((f) => f.archivo && f.nombre && f.bodega));
  assert.equal(filas[0].fila, 2, "la primera fila de datos es la 2 (la 1 es la cabecera)");
});

test("un CSV guardado desde Excel (BOM + CRLF) se lee igual que el original", () => {
  const original = parsearManifest(armarManifest());
  const deExcel = parsearManifest(BOM + armarManifest().replace(/\n/g, "\r\n"));
  assert.deepEqual(deExcel, original);
});

test("sin sacar el BOM las filas salían sin archivo y el script daba verde con 0 fotos", () => {
  const [primera] = parsearManifest(`${BOM}archivo;nombre;bodega;varietal\nuna.jpg;Vino;Bodega;Malbec\n`);
  assert.equal(primera.archivo, "una.jpg");
});

test("las líneas en blanco del final no cuentan y las columnas pueden venir en otro orden", () => {
  const filas = parsearManifest("varietal;bodega;nombre;archivo\nMalbec;Catena;Alta;a.jpg\n\n\n");
  assert.deepEqual(filas, [{ fila: 2, archivo: "a.jpg", nombre: "Alta", bodega: "Catena", varietal: "Malbec" }]);
});

test("un manifest vacío o sin una columna falla con un mensaje que dice qué pasa", () => {
  assert.throws(() => parsearManifest(""), /vacío/);
  assert.throws(() => parsearManifest(BOM + "\r\n\r\n"), /vacío/);
  assert.throws(() => parsearManifest("archivo;nombre;bodega\nx.jpg;V;B\n"), /varietal/);
});

test("una fila sin nombre ni bodega se informa como error y no se importa", () => {
  const filas = [{ fila: 2, archivo: "x.jpg", nombre: "", bodega: "", varietal: "" }];
  const archivos = new Map([["x.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])]]);
  const r = evaluarCarpeta(filas, archivos);
  assert.equal(r.ok.length, 0);
  assert.equal(r.errores.length, 1);
});

test("una carpeta vacía da todo en cero y el manifest sin vinos es sólo la cabecera", () => {
  const r = evaluarCarpeta([], new Map());
  assert.deepEqual([r.ok, r.errores, r.avisos, r.sinFila, r.sinFoto], [[], [], [], [], 0]);
  assert.equal(armarManifest([]), "archivo;nombre;bodega;varietal\n");
});
