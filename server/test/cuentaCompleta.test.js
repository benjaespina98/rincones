const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "secreto-solo-para-tests";

const User = require("../src/models/user.model");
const { authenticate, requireCuentaCompleta } = require("../src/middleware/auth.middleware");
const { signAccessToken } = require("../src/services/session.service");

const ADULTO = new Date("1990-01-01");

const correr = async (usuarioDelToken, enLaBase) => {
  const original = User.findById;
  let consultas = 0;
  User.findById = () => {
    consultas += 1;
    return { select: () => ({ lean: async () => enLaBase }) };
  };
  try {
    const req = { headers: { authorization: `Bearer ${signAccessToken(usuarioDelToken)}` }, cookies: {} };
    const res = {
      statusCode: 200,
      status(codigo) {
        this.statusCode = codigo;
        return this;
      },
      json(cuerpo) {
        this.cuerpo = cuerpo;
        return this;
      },
    };
    let paso = false;
    authenticate(req, res, () => {});
    await requireCuentaCompleta(req, res, () => {
      paso = true;
    });
    return { paso, consultas, status: res.statusCode, code: res.cuerpo?.code };
  } finally {
    User.findById = original;
  }
};

test("con los dos datos en el token pasa sin consultar la base", async () => {
  const r = await correr({ _id: "a", emailVerified: true, birthDate: ADULTO }, null);
  assert.deepEqual([r.paso, r.consultas], [true, 0]);
});

test("verificar el email vale al instante aunque el token sea viejo", async () => {
  const r = await correr({ _id: "a", emailVerified: false }, { emailVerified: true, birthDate: ADULTO });
  assert.deepEqual([r.paso, r.consultas], [true, 1]);
});

test("sin email confirmado, sin fecha o menor de edad: 403", async () => {
  const sinMail = await correr({ _id: "a" }, { emailVerified: false, birthDate: ADULTO });
  assert.deepEqual([sinMail.paso, sinMail.status, sinMail.code], [false, 403, "EMAIL_SIN_VERIFICAR"]);

  for (const birthDate of [undefined, new Date()]) {
    const r = await correr({ _id: "a" }, { emailVerified: true, birthDate });
    assert.deepEqual([r.paso, r.status, r.code], [false, 403, "FALTA_MAYORIA_DE_EDAD"]);
  }
});

test("una cuenta borrada no pasa", async () => {
  const r = await correr({ _id: "a" }, null);
  assert.deepEqual([r.paso, r.status], [false, 401]);
});

test("las rutas del producto exigen la cuenta completa", () => {
  const dir = path.join(__dirname, "..", "src", "routes");
  for (const archivo of ["wines", "wishes", "sommelier", "catalog", "labels"]) {
    const src = fs.readFileSync(path.join(dir, `${archivo}.routes.js`), "utf8");
    const rutas = src.matchAll(/router\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]([\s\S]*?)\);/g);
    const lista = [...rutas];
    assert.ok(lista.length > 0, `${archivo}: no se encontró ninguna ruta`);
    for (const [, verbo, ruta, resto] of lista) {
      if (ruta === "/photo") continue; // dada de baja: sólo contesta 410
      assert.match(resto, /\brequireCuentaCompleta\b/, `${archivo}: ${verbo} ${ruta}`);
    }
  }
  const users = fs.readFileSync(path.join(dir, "users.routes.js"), "utf8");
  assert.match(users, /"\/stats", authenticate, requireCuentaCompleta/);
  assert.match(users, /"\/:id\/wine-stats", authenticate, requireCuentaCompleta/);
});
