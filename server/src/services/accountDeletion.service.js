const User = require("../models/user.model");
const Wine = require("../models/wine.model");
const WineWish = require("../models/wineWish.model");
const WineMoment = require("../models/wineMoment.model");
const WineReview = require("../models/wineReview.model");
const WinePrice = require("../models/winePrice.model");
const AnalyticsEvent = require("../models/analyticsEvent.model");
const RefreshToken = require("../models/refreshToken.model");

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

  await RefreshToken.deleteMany({ userId });
  await Promise.all([
    Wine.deleteMany({ userId }),
    WineWish.deleteMany({ userId }),
    WineMoment.deleteMany({ userId }),
    WineReview.deleteMany({ userId }),
    WinePrice.deleteMany({ user: userId }),
    AnalyticsEvent.deleteMany({ userId }),
  ]);
  await User.deleteOne({ _id: userId });
  return { ok: true };
};

module.exports = { deleteAccount };
