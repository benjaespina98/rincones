const test = require("node:test");
const assert = require("node:assert/strict");

/**
 * El almacenamiento de imágenes no puede depender del orden de los `require`.
 *
 * ── EL BUG QUE ESTO EVITA QUE VUELVA ────────────────────────────────────────
 * Este servicio leía `CLOUDINARY_URL` al IMPORTARSE. Y `server.js` requería la app
 * —y con ella este módulo— antes de cargar el .env, así que se configuraba con el
 * entorno vacío y quedaba apagado para siempre.
 *
 * No fallaba nada, y ahí está lo caro: el fallback devuelve la imagen tal cual (a
 * propósito, una foto no puede impedir cargar un vino), así que TODAS las imágenes
 * —vinos, momentos, etiquetas, logos de anunciantes— se guardaban en base64 dentro
 * de Mongo en vez de subirse al CDN. Documentos de cientos de KB, sin un solo error
 * en ningún log. El síntoma llega meses después como "la app está lenta".
 *
 * Se arregló el orden en `server.js`, pero un arreglo que depende de que nadie mueva
 * un `require` no es un arreglo. Por eso la configuración ahora se resuelve al
 * primer uso, y por eso este test: importa el módulo SIN entorno —el escenario
 * exacto del bug— y comprueba que igual se configura cuando llega el momento de
 * usarlo.
 */

// Se importa a propósito con el entorno vacío, como pasaba con el orden viejo.
const guardadas = {
  CLOUDINARY_URL: process.env.CLOUDINARY_URL,
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
};
for (const clave of Object.keys(guardadas)) delete process.env[clave];

const imageStorage = require("../src/services/imageStorage.service");

const restaurar = () => {
  for (const [clave, valor] of Object.entries(guardadas)) {
    if (valor === undefined) delete process.env[clave];
    else process.env[clave] = valor;
  }
};

/**
 * El orden de estos tests importa: la configuración se resuelve UNA vez y queda
 * cacheada, así que los casos sin credenciales van primero. Al revés, el caso
 * "sin credenciales" correría ya configurado con las credenciales falsas del test
 * de abajo y saldría a internet a intentar una subida que va a fallar.
 */

test("sin credenciales devuelve la imagen tal cual y no lanza", async () => {
  // El fallback es deliberado: una foto que no se puede subir no puede impedir que
  // se cargue un vino ni que se publique una campaña.
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
  assert.equal(imageStorage.isConfigured(), false);
  assert.equal(await imageStorage.store(png, { folder: "rincones/test" }), png);
});

test("una URL de Cloudinary no se vuelve a subir", async () => {
  const url = "https://res.cloudinary.com/demo/image/upload/v1/logo.png";
  assert.equal(await imageStorage.store(url), url);
});

test("una imagen vacía no intenta nada", async () => {
  assert.equal(await imageStorage.store(""), "");
  assert.equal(await imageStorage.store(null), "");
  assert.equal(await imageStorage.store(undefined), "");
});

test("se configura aunque el .env se haya cargado DESPUÉS de importar el módulo", () => {
  // El entorno llega tarde, que es justo lo que pasaba en desarrollo: `server.js`
  // requería la app —y con ella este módulo— antes de leer el .env.
  process.env.CLOUDINARY_CLOUD_NAME = "cuenta-de-prueba";
  process.env.CLOUDINARY_API_KEY = "1234567890";
  process.env.CLOUDINARY_API_SECRET = "secreto-de-prueba";
  // Se descarta lo resuelto antes para poder observar la resolución de nuevo; en la
  // app real esto pasa una sola vez y en el primer uso.
  imageStorage.__reiniciarConfiguracion();

  try {
    assert.equal(
      imageStorage.isConfigured(),
      true,
      "con credenciales presentes tiene que quedar configurado, sin importar cuándo llegaron"
    );
  } finally {
    restaurar();
    imageStorage.__reiniciarConfiguracion();
  }
});
