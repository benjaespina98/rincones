const test = require("node:test");
const assert = require("node:assert/strict");

const { esImagenAceptada } = require("../src/utils/imagenAceptada");

test("acepta una foto subida (data:image base64) y una URL https", () => {
  assert.equal(esImagenAceptada("data:image/jpeg;base64,/9j/4AAQ"), true);
  assert.equal(esImagenAceptada("data:image/png;base64,iVBORw0KGgo="), true);
  assert.equal(esImagenAceptada("https://res.cloudinary.com/x/image/upload/a.jpg"), true);
  assert.equal(esImagenAceptada("  https://images.openfoodfacts.org/a.jpg  "), true);
});

test("acepta el alfabeto base64url (guion y guion bajo) en una foto subida", () => {
  assert.equal(esImagenAceptada("data:image/png;base64,foto-a_b"), true);
});

test("acepta una URL https con query y fragmento", () => {
  assert.equal(esImagenAceptada("https://cdn.ejemplo.com/a.jpg?w=800&q=80#x"), true);
});

test("rechaza http plano: el navegador lo bloquea y delataría la IP a un tercero", () => {
  assert.equal(esImagenAceptada("http://ejemplo.com/a.jpg"), false);
});

test("rechaza esquemas peligrosos o ajenos", () => {
  for (const v of [
    "javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "data:image/svg+xml;utf8,<svg onload=alert(1)>",
    "file:///etc/passwd",
    "ftp://x/a.jpg",
    "//x.com/a.jpg",
  ]) {
    assert.equal(esImagenAceptada(v), false, v);
  }
});

test("rechaza vacíos, no-cadenas y https sin host", () => {
  for (const v of ["", "   ", null, undefined, 42, {}, "https://", "https:///a.jpg", "https://  "]) {
    assert.equal(esImagenAceptada(v), false, String(v));
  }
});

test("rechaza lo que rompe una URL de CSS o un atributo", () => {
  for (const v of [
    'https://x.com/a.jpg"); background: red; ("',
    "https://x.com/a.jpg')",
    "https://x.com/a(1).jpg",
    "https://x.com/a.jpg)",
    "https://x.com/a\\.jpg",
    "https://x.com/a.jpg<script>",
    "https://x.com/a b.jpg",
    "https://x.com/a.jpg\nbackground:red",
  ]) {
    assert.equal(esImagenAceptada(v), false, JSON.stringify(v));
  }
});

test("no distingue mayúsculas en el esquema", () => {
  assert.equal(esImagenAceptada("HTTPS://x.com/a.jpg"), true);
  assert.equal(esImagenAceptada("HTTP://x.com/a.jpg"), false);
});
