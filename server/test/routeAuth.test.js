const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Toda ruta tiene que declarar `authenticate`, salvo las que son públicas por
 * definición (login, registro, recuperar contraseña).
 *
 * Existe porque POST /api/labels/analyze se publicó SIN autenticación: acepta
 * una subida y gasta cuota de Gemini Vision en cada llamada. No fallaba nada
 * —el cliente mandaba el token igual—, así que no había forma de enterarse
 * hasta ver la factura. Un endpoint nuevo que se olvide del middleware es un
 * error silencioso y caro; este test lo vuelve ruidoso.
 */

const PUBLICAS = new Set([
  "post /login",
  "post /register",
  "post /forgot-password",
  "post /reset-password",
]);

const routesDir = path.join(__dirname, "..", "src", "routes");

test("todas las rutas exigen autenticación salvo las públicas declaradas", () => {
  const sinProteger = [];

  for (const file of fs.readdirSync(routesDir).filter((f) => f.endsWith(".js"))) {
    const src = fs.readFileSync(path.join(routesDir, file), "utf8");
    const re = /router\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]([\s\S]*?)\);/g;

    let m;
    while ((m = re.exec(src)) !== null) {
      const [, verbo, ruta, resto] = m;
      const clave = `${verbo} ${ruta}`;
      if (PUBLICAS.has(clave)) continue;
      if (!/\bauthenticate\b/.test(resto)) {
        sinProteger.push(`${file}: ${verbo.toUpperCase()} ${ruta}`);
      }
    }
  }

  assert.deepEqual(
    sinProteger,
    [],
    `Estas rutas no exigen autenticación:\n  ${sinProteger.join("\n  ")}`
  );
});

test("las rutas de admin exigen además requireAdmin", () => {
  const src = fs.readFileSync(path.join(routesDir, "admin.routes.js"), "utf8");
  const re = /router\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]([\s\S]*?)\);/g;
  const sinAdmin = [];

  let m;
  while ((m = re.exec(src)) !== null) {
    const [, verbo, ruta, resto] = m;
    if (!/\brequireAdmin\b/.test(resto)) sinAdmin.push(`${verbo.toUpperCase()} ${ruta}`);
  }

  assert.deepEqual(sinAdmin, [], `Rutas de admin sin requireAdmin: ${sinAdmin.join(", ")}`);
});
