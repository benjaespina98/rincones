const ChangeLog = require("../models/changeLog.model");
const User = require("../models/user.model");
const Wine = require("../models/wine.model");
const WineReview = require("../models/wineReview.model");
const WineWish = require("../models/wineWish.model");
const WineMoment = require("../models/wineMoment.model");

const escapeRegex = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getChangeLogs = async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit || 30), 100);

    const logs = await ChangeLog.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.status(200).json({ data: logs });
  } catch (error) {
    return next(error);
  }
};

/**
 * El resumen del panel, contado por la base y no deducido de una muestra.
 *
 * ── QUÉ ESTABA MAL ──────────────────────────────────────────────────────────
 * El panel pedía los últimos 60 movimientos y sacaba de ahí todos sus números:
 * "Eventos 24h" era "cuántos de esos 60 son de hoy" —o sea que se plantaba en 60
 * y nunca podía decir más, aunque hubiera 300—, y "Creaciones / Actualizaciones /
 * Eliminaciones" eran los tipos de esos mismos 60, sin decir de qué período. Un
 * número que se congela solo, sin fallar y sin avisar, es peor que no tenerlo:
 * se sigue mirando como si fuera cierto.
 *
 * Acá cada número es un `countDocuments` sobre el rango que dice ser, y viaja
 * con `since` para que la pantalla pueda escribir de qué período habla.
 */
const getSummary = async (req, res, next) => {
  try {
    // Un valor inválido —cero, negativo, texto— vuelve al de siempre y no a "1
    // hora": si alguien manda basura, la tarjeta tiene que seguir diciendo lo que
    // dice su rótulo, no un período raro que nadie pidió.
    const pedidas = Number(req.query.hours);
    const horas = Number.isFinite(pedidas) && pedidas > 0 ? Math.min(pedidas, 24 * 30) : 24;
    const desde = new Date(Date.now() - horas * 60 * 60 * 1000);
    const enRango = { createdAt: { $gte: desde } };

    // En paralelo: son consultas independientes sobre índices distintos y en
    // serie el panel tardaría la suma de todas.
    const [usuarios, admins, movimientos, creaciones, ediciones, borrados, vinos, resenas] =
      await Promise.all([
        User.countDocuments({}),
        User.countDocuments({ role: "admin" }),
        ChangeLog.countDocuments(enRango),
        ChangeLog.countDocuments({ ...enRango, action: "create" }),
        ChangeLog.countDocuments({ ...enRango, action: "update" }),
        ChangeLog.countDocuments({ ...enRango, action: "delete" }),
        Wine.countDocuments({}),
        WineReview.countDocuments({}),
      ]);

    return res.status(200).json({
      data: {
        since: desde.toISOString(),
        hours: horas,
        users: usuarios,
        admins,
        wines: vinos,
        reviews: resenas,
        activity: { total: movimientos, create: creaciones, update: ediciones, delete: borrados },
      },
    });
  } catch (error) {
    return next(error);
  }
};

// Listar usuarios con búsqueda y conteo de actividad (solo para admins).
const getUsers = async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Math.min(Number(req.query.limit || 20), 100);
    const skip = (page - 1) * limit;
    const q = String(req.query.q || "").trim();
    const role = String(req.query.role || "").trim();

    const filter = {};
    if (q) {
      const rx = new RegExp(escapeRegex(q), "i");
      filter.$or = [{ email: rx }, { firstName: rx }, { lastName: rx }];
    }
    if (role === "user" || role === "admin") filter.role = role;

    const users = await User.find(filter)
      .select("_id email firstName lastName role createdAt stats")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Conteo real de vinos y reseñas por usuario, en dos consultas agregadas
    // (no una por fila): es lo que permite ver de un vistazo quién usa la app.
    const ids = users.map((u) => u._id);
    const [wineCounts, reviewCounts] = await Promise.all([
      Wine.aggregate([{ $match: { userId: { $in: ids } } }, { $group: { _id: "$userId", n: { $sum: 1 } } }]),
      WineReview.aggregate([{ $match: { userId: { $in: ids } } }, { $group: { _id: "$userId", n: { $sum: 1 } } }]),
    ]);
    const wineMap = new Map(wineCounts.map((r) => [String(r._id), r.n]));
    const reviewMap = new Map(reviewCounts.map((r) => [String(r._id), r.n]));

    const total = await User.countDocuments(filter);
    const admins = await User.countDocuments({ role: "admin" });

    return res.status(200).json({
      data: users.map((u) => ({
        ...u,
        wineCount: wineMap.get(String(u._id)) || 0,
        reviewCount: reviewMap.get(String(u._id)) || 0,
        isSelf: String(u._id) === String(req.user.id),
      })),
      meta: { admins },
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return next(error);
  }
};

// Cambiar rol de usuario (solo para admins).
const updateUserRole = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!userId || !role) {
      return res.status(400).json({ message: "userId y role son requeridos" });
    }

    if (!["user", "admin"].includes(role)) {
      return res.status(400).json({ message: "role debe ser 'user' o 'admin'" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    // Guardas contra quedarse sin acceso. Sin esto, un admin podía bajarse a sí
    // mismo (o al último admin) y dejar la app sin panel, sin forma de volver
    // desde la interfaz.
    if (user.role === "admin" && role === "user") {
      if (String(user._id) === String(req.user.id)) {
        return res.status(400).json({
          message: "No podés quitarte a vos mismo el rol de admin. Pedíselo a otro admin.",
        });
      }
      const admins = await User.countDocuments({ role: "admin" });
      if (admins <= 1) {
        return res.status(400).json({
          message: "Es el único admin que queda. Promové a otro antes de bajarlo.",
        });
      }
    }

    user.role = role;
    await user.save();

    return res.status(200).json({
      message: `${user.email} ahora es ${role === "admin" ? "administrador" : "usuario"}`,
      data: { id: user._id, email: user.email, role: user.role },
    });
  } catch (error) {
    return next(error);
  }
};

// Eliminar un usuario y todo lo suyo. Sirve sobre todo para limpiar las cuentas
// de prueba (qa_*, smoke_*) que ensucian el panel.
const deleteUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

    if (String(user._id) === String(req.user.id)) {
      return res.status(400).json({ message: "No podés eliminar tu propia cuenta desde acá" });
    }
    if (user.role === "admin") {
      const admins = await User.countDocuments({ role: "admin" });
      if (admins <= 1) {
        return res.status(400).json({ message: "Es el único admin: no se puede eliminar" });
      }
    }

    // Cascada: si no, quedan vinos y reseñas huérfanos que igual se muestran.
    await Promise.all([
      Wine.deleteMany({ userId: user._id }),
      WineWish.deleteMany({ userId: user._id }),
      WineMoment.deleteMany({ userId: user._id }),
      WineReview.deleteMany({ userId: user._id }),
    ]);
    await User.deleteOne({ _id: user._id });

    return res.status(200).json({ message: `Cuenta de ${user.email} eliminada` });
  } catch (error) {
    return next(error);
  }
};

// --- Moderación de reseñas ---
// Las reseñas son lo único público que escriben los usuarios, así que es lo
// único que necesita moderación.

const getReviews = async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Math.min(Number(req.query.limit || 20), 100);
    const skip = (page - 1) * limit;
    const q = String(req.query.q || "").trim();

    const filter = {};
    if (q) {
      const rx = new RegExp(escapeRegex(q), "i");
      filter.$or = [{ name: rx }, { winery: rx }, { text: rx }, { authorName: rx }];
    }

    const [reviews, total] = await Promise.all([
      WineReview.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      WineReview.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: reviews,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return next(error);
  }
};

const deleteReview = async (req, res, next) => {
  try {
    const review = await WineReview.findById(req.params.reviewId);
    if (!review) return res.status(404).json({ message: "Reseña no encontrada" });

    await WineReview.deleteOne({ _id: review._id });

    // Queda registrado quién moderó qué: una reseña borrada por un admin no
    // debería ser indistinguible de una que borró su autor.
    try {
      await ChangeLog.create({
        entityType: "review",
        entityId: review._id,
        action: "delete",
        actor: { userId: req.user.id, email: req.user.email, role: "admin" },
        before: { wine: review.name, author: review.authorName, text: review.text },
        after: null,
      });
    } catch {
      // La auditoría nunca debe romper la moderación.
    }

    return res.status(200).json({ message: "Reseña eliminada" });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getSummary,
  getChangeLogs,
  getUsers,
  updateUserRole,
  deleteUser,
  getReviews,
  deleteReview,
};
