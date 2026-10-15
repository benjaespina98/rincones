const test = require("node:test");
const assert = require("node:assert/strict");

const { esImagenAceptada } = require("../src/utils/imagenAceptada");

test("acepta una foto subida (data:image) y una URL https", () => {
  assert.equal(esImagenAceptada("data:image/jpeg;base64,/9j/4AAQ"), true);
  assert.equal(esImagenAceptada("https://res.cloudinary.com/x/image/upload/a.jpg"), true);
  assert.equal(esImagenAceptada("  https://images.openfoodfacts.org/a.jpg  "), true);
});

test("rechaza http plano: el navegador lo bloquea y delataría la IP a un tercero", () => {
  assert.equal(esImagenAceptada("http://ejemplo.com/a.jpg"), false);
});

test("rechaza esquemas peligrosos o ajenos", () => {
  for (const v of ["javascript:alert(1)", "data:text/html;base64,PHNjcmlwdD4=", "file:///etc/passwd", "ftp://x/a.jpg", "//x.com/a.jpg"]) {
    assert.equal(esImagenAceptada(v), false, v);
  }
});

test("rechaza vacíos, no-cadenas y https sin host", () => {
  for (const v of ["", "   ", null, undefined, 42, {}, "https://", "https:///a.jpg", "https://  "]) {
    assert.equal(esImagenAceptada(v), false, String(v));
  }
});

test("no distingue mayúsculas en el esquema", () => {
  assert.equal(esImagenAceptada("HTTPS://x.com/a.jpg"), true);
  assert.equal(esImagenAceptada("HTTP://x.com/a.jpg"), false);
});
