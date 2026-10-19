const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "secreto-de-test";

const app = require("../src/app");
const User = require("../src/models/user.model");
const Wine = require("../src/models/wine.model");
const { fail } = require("../src/utils/apiError");
const communityWines = require("../src/services/communityWines.service");
const CommunityWine = require("../src/models/communityWine.model");

/**
 * Lo que cambió con la pasada de QA, probado por la ruta de verdad (con un token firmado) y no
 * sólo por las funciones sueltas: una regresión a 401 en "contraseña incorrecta" sería invisible,
 * y es la que desloguea a quien se equivoca de contraseña al eliminar su cuenta.
 */
const ID = "000000000000000000000001";
const token = () => jwt.sign({ sub: ID, email: "qa@example.com", role: "user" }, process.env.JWT_SECRET, { expiresIn: "5m" });

const pedir = (metodo, path, body) =>
  new Promise((resolve, reject) => {
    const server = http.createServer(app).listen(0, () => {
      const datos = body === undefined ? null : JSON.stringify(body);
      const req = http.request(
        {
          port: server.address().port,
          path,
          method: metodo,
          headers: {
            Authorization: `Bearer ${token()}`,
            ...(datos ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(datos) } : {}),
          },
        },
        (res) => {
          let cuerpo = "";
          res.on("data", (c) => (cuerpo += c));
          res.on("end", () => {
            server.close();
            let json = null;
            try {
              json = JSON.parse(cuerpo);
            } catch {
              json = cuerpo;
            }
            resolve({ status: res.statusCode, body: json });
          });
        }
      );
      req.on("error", (e) => {
        server.close();
        reject(e);
      });
      if (datos) req.write(datos);
      req.end();
    });
  });

/** Un `User.findById` que devuelve un usuario con contraseña "buena" (y sirve `.select`). */
const conUsuario = async (fn) => {
  const original = User.findById;
  const usuario = {
    _id: ID,
    email: "qa@example.com",
    passwordHash: "hash",
    comparePassword: async (p) => p === "correcta",
    preferences: {},
    save: async function () {
      return this;
    },
  };
  User.findById = () => {
    const q = Promise.resolve(usuario);
    q.select = () => q;
    return q;
  };
  try {
    return await fn(usuario);
  } finally {
    User.findById = original;
  }
};

test("DELETE /users/me con contraseña incorrecta es 403 (no 401, que desloguea) y no borra nada", async () => {
  await conUsuario(async () => {
    const r = await pedir("DELETE", "/api/users/me", { confirmEmail: "qa@example.com", password: "mala" });
    assert.equal(r.status, 403);
    assert.match(r.body.message, /contraseña no es correcta/i);
  });
});

test("PUT /users/password con la contraseña actual incorrecta es 403", async () => {
  await conUsuario(async () => {
    const r = await pedir("PUT", "/api/users/password", { currentPassword: "mala", newPassword: "Nueva12345!" });
    assert.equal(r.status, 403);
  });
});

test("PUT /users/profile: los largos máximos devuelven 400 con un mensaje que concuerda", async () => {
  await conUsuario(async () => {
    const bio = await pedir("PUT", "/api/users/profile", { bio: "x".repeat(501) });
    assert.equal(bio.status, 400);
    assert.match(bio.body.error, /La bio es demasiado larga \(máximo 500/);
    const nombre = await pedir("PUT", "/api/users/profile", { firstName: "n".repeat(41) });
    assert.equal(nombre.status, 400);
    assert.match(nombre.body.error, /El nombre es demasiado largo/);
    // Con espacios alrededor cuenta lo recortado.
    const justo = await pedir("PUT", "/api/users/profile", { firstName: `  ${"n".repeat(40)}  ` });
    assert.equal(justo.status, 200);
  });
});

test("POST /wines y PUT /wines/:id devuelven 400 con el motivo; un PUT parcial sin nombre no falla", async () => {
  const crear = await pedir("POST", "/api/wines", { name: "X", vintage: 1899 });
  assert.equal(crear.status, 400);
  assert.match(crear.body.error, /cosecha/i);

  const sinNombre = await pedir("POST", "/api/wines", { winery: "B" });
  assert.equal(sinNombre.status, 400);

  const editar = await pedir("PUT", `/api/wines/${ID}`, { drinkFrom: 2030, drinkUntil: 2020 });
  assert.equal(editar.status, 400);
  assert.match(editar.body.error, /Beber desde/);

  // Un PUT parcial sin `name` no es un error de validación: llega al servicio (que no encuentra el vino).
  const original = Wine.findOne;
  Wine.findOne = () => Promise.resolve(null);
  try {
    const parcial = await pedir("PUT", `/api/wines/${ID}`, { notes: "rico" });
    assert.equal(parcial.status, 404);
    const vacio = await pedir("PUT", `/api/wines/${ID}`, { name: "  " });
    assert.equal(vacio.status, 400);
  } finally {
    Wine.findOne = original;
  }
});

test("POST /wishes valida igual que los vinos", async () => {
  const r = await pedir("POST", "/api/wishes", { name: "a".repeat(5000) });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /demasiado largo/);
});

test("fail(): ValidationError sin errores da el mensaje genérico y un error común sigue siendo 500", async () => {
  const res = () => {
    const r = { code: 0, body: null };
    r.status = (c) => ((r.code = c), r);
    r.json = (b) => ((r.body = b), r);
    return r;
  };
  const a = res();
  await fail(a, { name: "ValidationError" });
  assert.equal(a.code, 400);
  assert.equal(a.body.error, "Hay un dato que no es válido");
  const b = res();
  await fail(b, new Error("boom"));
  assert.equal(b.code, 500);
});

test("communityWines.conFoto: sólo publicados con foto Y (verificados o con una lectura confiable)", async () => {
  const original = CommunityWine.find;
  let filtro = null;
  CommunityWine.find = (f) => {
    filtro = f;
    const q = Promise.resolve([]);
    q.select = () => q;
    q.sort = () => q;
    q.limit = () => q;
    q.lean = () => q;
    return q;
  };
  communityWines.olvidarCache();
  try {
    await communityWines.conFoto(300);
    assert.equal(filtro.published, true);
    assert.deepEqual(filtro.$or, [{ verified: true }, { trustedCount: { $gt: 0 } }]);
    assert.ok(filtro.image.$regex.test("https://x/a.jpg"));
    assert.ok(filtro.image.$regex.test("data:image/jpeg;base64,AAAA"));
    assert.ok(!filtro.image.$regex.test("http://inseguro/a.jpg"));
    assert.ok(!filtro.image.$regex.test(""));
  } finally {
    CommunityWine.find = original;
    communityWines.olvidarCache();
  }
});
