const User = require("../models/user.model");
const Wine = require("../models/wine.model");
const WineWish = require("../models/wineWish.model");
const WineMoment = require("../models/wineMoment.model");
const WineReview = require("../models/wineReview.model");
const winePrices = require("./winePrices.service");
const WineImage = require("../models/wineImage.model");
const AnalyticsEvent = require("../models/analyticsEvent.model");
const RefreshToken = require("../models/refreshToken.model");
const SommelierConversation = require("../models/sommelierConversation.model");
const CommunityWine = require("../models/communityWine.model");
const ErrorLog = require("../models/errorLog.model");
const imageStorage = require("./imageStorage.service");

/**
 * LA lista de lo que le pertenece a una persona y se borra con ella (vinos, deseos, momentos, reseñas), en un solo lugar.
 * Antes estaba copiada en tres sitios (la baja propia, el borrado de admin y el borrado en lote): al agregar una colección
 * nueva había que acordarse de los tres, y el que se olvidaba dejaba datos huérfanos de alguien que pidió irse.
 * `opts` admite `{ session }` para correrlo dentro de una transacción.
 */
const borrarDatosPropios = async (userId, opts) => {
  const modelos = [Wine, WineWish, WineMoment, WineReview];
  // Dentro de una transacción las operaciones van de a una: Mongo no admite operaciones en paralelo sobre la misma sesión.
  if (opts?.session) {
    for (const Modelo of modelos) await Modelo.deleteMany({ userId }, opts);
    return;
  }
  await Promise.all(modelos.map((Modelo) => Modelo.deleteMany({ userId }, opts)));
};

/**
 * Las imágenes de Cloudinary que subió esta persona (la foto de sus vinos y las de sus momentos), SIN contar las que
 * también usa otro documento: la foto que pasó al pool compartido o al catálogo comunitario, o la que otra persona
 * tenga igual. Esas son contenido de todos y se quedan (sin su nombre: ver `purgeUserLeftovers`).
 */
const imagenesPropias = async (userId) => {
  const [vinos, momentos] = await Promise.all([
    Wine.find({ userId, image: { $type: "string" } }).select("image").lean(),
    WineMoment.find({ userId }).select("photos").lean(),
  ]);
  const candidatas = [
    ...vinos.map((w) => w.image),
    ...momentos.flatMap((m) => m.photos || []),
  ].filter((u) => imageStorage.esUrlPropia(u));
  return [...new Set(candidatas)];
};

/** De `urls`, las que ya no usa ningún otro documento (ya borrados los de la persona). */
const urlsSinUso = async (urls) => {
  if (urls.length === 0) return [];
  const usadas = new Set();
  const [enPool, enComunidad, enVinos, enMomentos] = await Promise.all([
    WineImage.find({ image: { $in: urls } }).select("image").lean(),
    CommunityWine.find({ image: { $in: urls } }).select("image").lean(),
    Wine.find({ image: { $in: urls } }).select("image").lean(),
    WineMoment.find({ photos: { $in: urls } }).select("photos").lean(),
  ]);
  enPool.forEach((d) => usadas.add(d.image));
  enComunidad.forEach((d) => usadas.add(d.image));
  enVinos.forEach((d) => usadas.add(d.image));
  enMomentos.forEach((d) => (d.photos || []).forEach((u) => usadas.add(u)));
  return urls.filter((u) => !usadas.has(u));
};

/** Borra de Cloudinary las imágenes que ya nadie usa. Mejor esfuerzo: la cuenta ya no existe, un fallo no deshace la baja. */
const limpiarImagenes = async (imagenes) => {
  try {
    await imageStorage.eliminarImagenes(await urlsSinUso(imagenes));
  } catch (error) {
    console.error("Limpieza de imágenes tras la baja:", error.message);
  }
};

/**
 * Baja de cuenta con borrado real: el usuario y todo lo que le pertenece.
 *
 * Queda afuera, a propósito, lo que no es dato personal suyo: el catálogo
 * comunitario y la caché de etiquetas son anónimos. El registro de auditoría
 * (`ChangeLog`) y de errores tampoco se toca: son de operación, no del usuario.
 *
 * La cuenta se borra AL FINAL: si algo falla a mitad de camino, el usuario
 * sigue pudiendo entrar y reintentar, en vez de quedar con datos huérfanos
 * inaccesibles.
 *
 * Es el único admin: no se puede dar de baja, para no dejar el panel sin dueño.
 */
const deleteAccount = async (userId) => {
  const user = await User.findById(userId).select("role");
  if (!user) return { ok: false, reason: "not_found" };

  if (user.role === "admin") {
    const admins = await User.countDocuments({ role: "admin" });
    if (admins <= 1) return { ok: false, reason: "last_admin" };
  }

  /* Sesiones, analytics, precios, atribución de fotos y las charlas con la guía (ver `purgeUserLeftovers`). Las charlas son
     de lo más personal que guarda la app —con qué come, con quién, qué puede pagar— y el archivo tiene una retención de 180
     días que NO alcanza acá: quien se da de baja pidió que se vaya ahora, no dentro de medio año. */
  // Primero se cierran las sesiones: mientras se borra, nadie puede renovar el acceso de esta cuenta.
  await RefreshToken.deleteMany({ userId });
  // Se anotan ANTES de borrar los vinos y momentos: después ya no hay de dónde sacarlas.
  const imagenes = await imagenesPropias(userId);
  await Promise.all([borrarDatosPropios(userId), purgeUserLeftovers(userId)]);
  await User.deleteOne({ _id: userId });
  await limpiarImagenes(imagenes);
  return { ok: true };
};

/**
 * Lo que un borrado no puede dejar atrás aunque la cuenta no la pida el
 * dueño (panel de admin): sesiones, charlas con la guía, analytics, precios y
 * la atribución de fotos. Se usa después del borrado de vinos/reseñas/deseos.
 */
const purgeUserLeftovers = async (userId) => {
  await Promise.all([
    RefreshToken.deleteMany({ userId }),
    AnalyticsEvent.deleteMany({ userId }),
    SommelierConversation.deleteMany({ userId }),
    winePrices.retractAllFromUser(userId),
    WineImage.updateMany({ contributedBy: userId }, { $unset: { contributedBy: 1 } }),
    // Su id deja de figurar como contribuyente del catálogo comunitario (el vino queda, es anónimo) y de los errores.
    CommunityWine.updateMany({ contributors: userId }, { $pull: { contributors: userId } }),
    ErrorLog.deleteMany({ userId }),
  ]);
};

module.exports = { deleteAccount, purgeUserLeftovers, borrarDatosPropios, imagenesPropias, urlsSinUso, limpiarImagenes };
