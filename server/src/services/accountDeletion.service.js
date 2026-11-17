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
  await Promise.all([borrarDatosPropios(userId), purgeUserLeftovers(userId)]);
  await User.deleteOne({ _id: userId });
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

module.exports = { deleteAccount, purgeUserLeftovers, borrarDatosPropios };
