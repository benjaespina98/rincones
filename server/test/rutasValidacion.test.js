const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const mongoose = require("mongoose");
mongoose.set("bufferCommands", false); // sin base: lo no stubeado falla en el acto en vez de esperar 10 s
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
const token = (sub = ID) => jwt.sign({ sub, email: "qa@example.com", role: "user" }, process.env.JWT_SECRET, { expiresIn: "5m" });

const pedir = (metodo, path, body, sub) =>
  new Promise((resolve, reject) => {
    const server = http.createServer(app).listen(0, () => {
      const datos = body === undefined ? null : JSON.stringify(body);
      const req = http.request(
        {
          port: server.address().port,
          path,
          method: metodo,
          headers: {
            Authorization: `Bearer ${token(sub)}`,
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

test("PUT /users/password: después de 10 intentos fallidos corta con 429 (por usuario)", async () => {
  await conUsuario(async () => {
    const OTRO = "000000000000000000000099";
    let ultimo = null;
    for (let i = 0; i < 11; i += 1) {
      ultimo = await pedir("PUT", "/api/users/password", { currentPassword: "mala", newPassword: "Nueva12345!" }, OTRO);
      if (i < 10) assert.equal(ultimo.status, 403, `intento ${i + 1}`);
    }
    assert.equal(ultimo.status, 429);
    assert.match(ultimo.body.message, /muchas veces/);
    // Otro usuario no queda afectado.
    const distinto = await pedir("PUT", "/api/users/password", { currentPassword: "mala", newPassword: "Nueva12345!" }, "000000000000000000000098");
    assert.equal(distinto.status, 403);
  });
});

test("GET /users/:id/wine-stats: el promedio dice de cuántos vinos sale (bodega), aparte de las reseñas publicadas", async () => {
  const WineReview = require("../src/models/wineReview.model");
  const origStats = Wine.getUserStats;
  const origCount = WineReview.countDocuments;
  const origWineCount = Wine.countDocuments;
  Wine.countDocuments = () => Promise.resolve(0);
  Wine.getUserStats = async () => ({ avgRating: 3.83, ratedCount: 6, totals: { total: 6 } });
  WineReview.countDocuments = () => Promise.resolve(2);
  try {
    const r = await pedir("GET", `/api/users/${ID}/wine-stats`);
    assert.equal(r.status, 200);
    const stats = r.body.data || r.body;
    assert.equal(stats.ratedInCellar, 6);
    assert.equal(stats.ratedCount, 2);
    assert.equal(stats.avgRating, 3.83);
  } finally {
    Wine.getUserStats = origStats;
    WineReview.countDocuments = origCount;
    Wine.countDocuments = origWineCount;
  }
});

test("createWine: respeta una fecha de alta pasada (Deshacer), ignora la futura o inválida y arma el lote con ella", async () => {
  const winesService = require("../src/services/wines.service");
  const wineImages = require("../src/services/wineImages.service");
  const descripcion = require("../src/services/wineDescription.service");
  const origFind = Wine.find;
  const origSave = Wine.prototype.save;
  const origImg = wineImages.getImage;
  const origCom = communityWines.contribute;
  const origDesc = descripcion.ensureDescription;
  const origUserFindOne = User.findOne;
  const origUserFindById = User.findById;
  const vacia = () => {
    const q = Promise.resolve({ _id: ID, stats: {}, save: async () => {}, changeLog: [] });
    q.select = () => q;
    q.lean = () => q;
    return q;
  };
  const ChangeLog = require("../src/models/changeLog.model");
  const origLogCreate = ChangeLog.create;
  ChangeLog.create = async () => ({});
  User.findOne = vacia;
  User.findById = vacia;
  const origUpdateOne = User.updateOne;
  User.updateOne = async () => ({}); // contadores del perfil (update atómico)
  wineImages.getImage = async () => "";
  communityWines.contribute = async () => {};
  descripcion.ensureDescription = async () => {};
  Wine.find = () => {
    const q = Promise.resolve([]);
    q.select = () => q;
    return q;
  };
  Wine.prototype.save = async function () {
    await this.validate();
    return this;
  };
  const crear = (createdAt) => winesService.createWine(ID, { name: "QA Fecha", winery: "QA B", quantity: 2, ...(createdAt ? { createdAt } : {}) });
  try {
    const pasado = await crear("2026-10-01T10:00:00.000Z");
    assert.equal(pasado.wine.createdAt.toISOString(), "2026-10-01T10:00:00.000Z");
    assert.equal(new Date(pasado.wine.lots[0].addedAt).toISOString(), "2026-10-01T10:00:00.000Z");

    const antes = Date.now();
    for (const malo of ["2099-01-01T00:00:00.000Z", "basura"]) {
      const w = (await crear(malo)).wine;
      assert.ok(w.createdAt.getTime() >= antes - 5000, `se ignoró ${malo}`);
    }
    const sin = (await crear()).wine;
    assert.ok(sin.createdAt.getTime() >= antes - 5000);
  } finally {
    Wine.find = origFind;
    Wine.prototype.save = origSave;
    ChangeLog.create = origLogCreate;
    User.findOne = origUserFindOne;
    User.findById = origUserFindById;
    User.updateOne = origUpdateOne;
    wineImages.getImage = origImg;
    communityWines.contribute = origCom;
    descripcion.ensureDescription = origDesc;
  }
});

test("DELETE /users/me: después de 10 contraseñas incorrectas corta con 429", async () => {
  await conUsuario(async () => {
    const OTRO = "000000000000000000000077";
    let ultimo = null;
    for (let i = 0; i < 11; i += 1) {
      ultimo = await pedir("DELETE", "/api/users/me", { confirmEmail: "qa@example.com", password: "mala" }, OTRO);
      if (i < 10) assert.equal(ultimo.status, 403, `intento ${i + 1}`);
    }
    assert.equal(ultimo.status, 429);
  });
});

test("createWine con restauraDe re-vincula los momentos del diario del vino borrado (sólo los de esa persona)", async () => {
  const winesService = require("../src/services/wines.service");
  const WineMoment = require("../src/models/wineMoment.model");
  const wineImages = require("../src/services/wineImages.service");
  const descripcion = require("../src/services/wineDescription.service");
  const ChangeLog = require("../src/models/changeLog.model");
  const orig = {
    find: Wine.find,
    save: Wine.prototype.save,
    upd: WineMoment.updateMany,
    img: wineImages.getImage,
    com: communityWines.contribute,
    desc: descripcion.ensureDescription,
    uf: User.findById,
    log: ChangeLog.create,
  };
  const llamadas = [];
  Wine.find = () => {
    const q = Promise.resolve([]);
    q.select = () => q;
    return q;
  };
  Wine.prototype.save = async function () {
    await this.validate();
    return this;
  };
  WineMoment.updateMany = async (filtro, cambio) => llamadas.push({ filtro, cambio });
  wineImages.getImage = async () => "";
  communityWines.contribute = async () => {};
  descripcion.ensureDescription = async () => {};
  ChangeLog.create = async () => ({});
  const origUpdateOne2 = User.updateOne;
  User.updateOne = async () => ({}); // contadores del perfil (update atómico)
  User.findById = () => {
    const q = Promise.resolve({ _id: ID, stats: {}, save: async () => {} });
    q.select = () => q;
    return q;
  };
  try {
    const viejo = "000000000000000000000abc";
    const { wine } = await winesService.createWine(ID, { name: "QA Restaurado", winery: "QA B", quantity: 1, restauraDe: viejo });
    assert.equal(llamadas.length, 1);
    assert.equal(String(llamadas[0].filtro.userId), ID);
    assert.equal(String(llamadas[0].filtro.wineId), viejo);
    assert.equal(String(llamadas[0].cambio.$set.wineId), String(wine._id));

    // Un id inválido, o ninguno, no toca nada.
    await winesService.createWine(ID, { name: "QA Otro", winery: "QA B", quantity: 1, restauraDe: "no-es-un-id" });
    await winesService.createWine(ID, { name: "QA Otro 2", winery: "QA B", quantity: 1 });
    // Un objeto en lugar de un texto (intento de inyectar un operador) tampoco toca nada.
    await winesService.createWine(ID, { name: "QA Otro 3", winery: "QA B", quantity: 1, restauraDe: { $ne: null } });
    await winesService.createWine(ID, { name: "QA Otro 4", winery: "QA B", quantity: 1, restauraDe: [viejo] });
    assert.equal(llamadas.length, 1);
  } finally {
    Wine.find = orig.find;
    Wine.prototype.save = orig.save;
    WineMoment.updateMany = orig.upd;
    wineImages.getImage = orig.img;
    communityWines.contribute = orig.com;
    descripcion.ensureDescription = orig.desc;
    User.findById = orig.uf;
    User.updateOne = origUpdateOne2;
    ChangeLog.create = orig.log;
  }
});

test("PUT /users/profile: valores que no son texto o una foto inválida devuelven 400, no 500", async () => {
  await conUsuario(async () => {
    for (const cuerpo of [
      { firstName: { $ne: 1 } },
      { bio: 123 },
      { theme: ["x"] },
      { avatar: "x".repeat(17) },
      { avatarPhoto: "javascript:alert(1)" },
      { avatarPhoto: "http://atacante.example/x.png" },
      { avatarPhoto: `data:image/png;base64,${"A".repeat(2000001)}` },
    ]) {
      const r = await pedir("PUT", "/api/users/profile", cuerpo);
      assert.equal(r.status, 400, JSON.stringify(cuerpo).slice(0, 60));
    }
    const sacarFoto = await pedir("PUT", "/api/users/profile", { avatarPhoto: "" });
    assert.equal(sacarFoto.status, 200, "quitar la foto sigue siendo válido");
  });
});

test("las rutas de cuenta rechazan cuerpos de más de 50 kB antes de autenticar", async () => {
  const grande = await pedir("POST", "/api/auth/login", { email: "a@b.co", password: "x".repeat(60000) });
  assert.equal(grande.status, 413);
});
