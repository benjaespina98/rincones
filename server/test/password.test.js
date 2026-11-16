const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const User = require("../src/models/user.model");
const { validatePasswordStrength } = require("../src/utils/password");

test("las reglas de fortaleza rechazan lo que tienen que rechazar", () => {
  const malas = [
    ["corta", "menos de 8"],
    ["sinmayuscula1", "sin mayúscula"],
    ["SinNumeros", "sin número"],
    ["12345678", "sólo números"],
    ["", "vacía"],
  ];
  for (const [valor, motivo] of malas) {
    assert.equal(validatePasswordStrength(valor).valid, false, `debería rechazar: ${motivo}`);
  }
  assert.equal(validatePasswordStrength("Secreto123").valid, true);
});

test("passwordHash no se devuelve por defecto", () => {
  // Es lo que protege el hash de filtrarse en cualquier respuesta que serialice
  // un usuario. La contracara está en el test de abajo.
  assert.equal(User.schema.path("passwordHash").options.select, false);
});

/**
 * Como `passwordHash` tiene select:false, TODA consulta que vaya a comparar la
 * contraseña tiene que pedirlo explícitamente. Si no, llega `undefined` a
 * bcrypt.compare y el endpoint tira 500.
 *
 * Existe porque el cambio de contraseña desde el perfil hacía exactamente eso:
 * nunca funcionó, y el 500 genérico tapaba la causa.
 */
test("toda consulta que compara contraseñas pide +passwordHash", () => {
  const dirs = [
    path.join(__dirname, "..", "src", "routes"),
    path.join(__dirname, "..", "src", "controllers"),
  ];

  const fallas = [];

  for (const dir of dirs) {
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".js"))) {
      const src = fs.readFileSync(path.join(dir, file), "utf8");
      if (!/comparePassword|bcrypt\.compare/.test(src)) continue;
      if (!/\+passwordHash/.test(src)) {
        fallas.push(file);
      }
    }
  }

  assert.deepEqual(
    fallas,
    [],
    `Estos archivos comparan contraseñas sin pedir +passwordHash: ${fallas.join(", ")}`
  );
});

test("limpiarPassword: un solo criterio (string + trim); lo que no es texto cuenta como faltante", () => {
  const { limpiarPassword } = require("../src/utils/password");
  assert.equal(limpiarPassword("  Abcdef12  "), "Abcdef12");
  assert.equal(limpiarPassword({ $ne: "" }), "");
  assert.equal(limpiarPassword(["a"]), "");
  assert.equal(limpiarPassword(undefined), "");
  assert.equal(limpiarPassword(12345678), "");
});
