const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const User = require("../src/models/user.model");
const Wine = require("../src/models/wine.model");
const WineWish = require("../src/models/wineWish.model");
const WineMoment = require("../src/models/wineMoment.model");
const WineReview = require("../src/models/wineReview.model");
const ChangeLog = require("../src/models/changeLog.model");
const accountDeletion = require("../src/services/accountDeletion.service");
const adminController = require("../src/controllers/admin.controller");

const responder = () => {
  const res = { statusCode: 0, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};

/**
 * ── EL BUG REAL: "BORRÉ UNO Y AL SIGUIENTE ME TIRÓ ERROR" ────────────────────
 *
 * Reportado en producción, con el panel de Logs (que armamos en esta misma
 * auditoría) devolviendo el stack exacto: al segundo borrado individual
 * seguido, no al primero, `MongoServerError: Only servers in a sharded
 * cluster can start a new transaction at the active transaction number`.
 *
 * Pasa por Atlas + funciones serverless (Vercel): entre una invocación y la
 * siguiente la conexión mongoose se reusa "tibia" para no pagar reconectar
 * en cada request, y el pool de sesiones del driver a veces entrega una
 * sesión que quedó con un número de transacción activo de un borrado
 * anterior — el server la rechaza con este mensaje puntual.
 *
 * El código YA sabía qué hacer cuando las transacciones no se pueden usar:
 * cae a un borrado sin transacción (mismo camino que un Mongo standalone
 * local, sin réplica). El bug no era la falta de un plan B — era que el
 * patrón que reconoce "esto es un problema de transacciones, no un error
 * real" no incluía este mensaje puntual.
 */
test("un error de transacción tipo 'active transaction number' cae al borrado sin transacción, no revienta en 500", async () => {
  const original = {
    findById: User.findById,
    countDocuments: User.countDocuments,
    deleteOne: User.deleteOne,
    startSession: mongoose.startSession,
    wineDeleteMany: Wine.deleteMany,
    wishDeleteMany: WineWish.deleteMany,
    momentDeleteMany: WineMoment.deleteMany,
    reviewDeleteMany: WineReview.deleteMany,
    changeLogCreate: ChangeLog.create,
    purge: accountDeletion.purgeUserLeftovers,
    imagenes: accountDeletion.imagenesPropias,
    limpiar: accountDeletion.limpiarImagenes,
  };
  // Las imágenes tienen su propio test (accountDeletion.test.js); acá se aíslan.
  accountDeletion.imagenesPropias = async () => [];
  accountDeletion.limpiarImagenes = async () => {};

  const targetUser = { _id: "u2", email: "borrar@rincones.app", role: "user" };
  User.findById = async () => targetUser;
  User.countDocuments = async () => 1;
  User.deleteOne = async () => ({ deletedCount: 1 });
  Wine.deleteMany = async () => ({ deletedCount: 0 });
  WineWish.deleteMany = async () => ({ deletedCount: 0 });
  WineMoment.deleteMany = async () => ({ deletedCount: 0 });
  WineReview.deleteMany = async () => ({ deletedCount: 0 });
  ChangeLog.create = async () => ({});
  // La limpieza de restos (sesiones, charlas, precios) tiene su propio test; acá se aísla.
  const purgados = [];
  accountDeletion.purgeUserLeftovers = async (id) => { purgados.push(id); };

  // El mensaje EXACTO visto en producción.
  mongoose.startSession = async () => ({
    withTransaction: async () => {
      throw new Error(
        "Only servers in a sharded cluster can start a new transaction at the active transaction number"
      );
    },
    endSession: async () => {},
  });

  try {
    const req = { params: { userId: "u2" }, user: { id: "admin1", email: "admin@rincones.app" } };
    const res = responder();
    await adminController.deleteUser(req, res, (e) => { throw e; });

    assert.equal(res.statusCode, 200, "no puede terminar en 500: el fallback tiene que funcionar");
    assert.match(res.body.message, /eliminada/i);
    assert.deepEqual(purgados, ["u2"], "el borrado de admin tiene que limpiar los restos del usuario");
  } finally {
    User.findById = original.findById;
    User.countDocuments = original.countDocuments;
    User.deleteOne = original.deleteOne;
    mongoose.startSession = original.startSession;
    Wine.deleteMany = original.wineDeleteMany;
    WineWish.deleteMany = original.wishDeleteMany;
    WineMoment.deleteMany = original.momentDeleteMany;
    WineReview.deleteMany = original.reviewDeleteMany;
    ChangeLog.create = original.changeLogCreate;
    accountDeletion.purgeUserLeftovers = original.purge;
    accountDeletion.imagenesPropias = original.imagenes;
    accountDeletion.limpiarImagenes = original.limpiar;
  }
});

test("un error de transacción real (no de disponibilidad) sigue llegando como error, no se tapa", async () => {
  const original = { findById: User.findById, startSession: mongoose.startSession };
  User.findById = async () => ({ _id: "u3", email: "x@rincones.app", role: "user" });
  mongoose.startSession = async () => ({
    withTransaction: async () => {
      throw new Error("algo totalmente distinto, un bug de verdad");
    },
    endSession: async () => {},
  });

  try {
    const req = { params: { userId: "u3" }, user: { id: "admin1", email: "admin@rincones.app" } };
    const res = responder();
    let propagado = false;
    await adminController.deleteUser(req, res, () => { propagado = true; });
    assert.equal(propagado, true, "un error real tiene que seguir llegando al errorHandler, no taparse");
  } finally {
    User.findById = original.findById;
    mongoose.startSession = original.startSession;
  }
});
