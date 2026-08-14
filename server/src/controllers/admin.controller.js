const mongoose = require("mongoose");
const ChangeLog = require("../models/changeLog.model");
const User = require("../models/user.model");
const Wine = require("../models/wine.model");
const WineReview = require("../models/wineReview.model");
const WineWish = require("../models/wineWish.model");
const WineMoment = require("../models/wineMoment.model");

// Registra una acción de admin sobre OTRA cuenta. Best-effort, igual que la
// auditoría de reseñas: la moderación (acá, la gestión de usuarios) nunca
// tiene que romperse porque falló la escritura del log.
const logAdminAction = async ({ entityType, entityId, action, actor, before, after }) => {
  try {
    await ChangeLog.create({ entityType, entityId, action, actor, before, after });
  } catch {
    // No hay nada mejor que hacer acá: ver el comentario de arriba.
  }
};

const escapeRegex = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getChangeLogs = async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(Number(req.query.limit || 30), 100);
    const skip = (page - 1) * limit;

    const entityType = String(req.query.entityType || "").trim();
    const action = String(req.query.action || "").trim();
    const q = String(req.query.q || "").trim();

    const filter = {};
    if (entityType) filter.entityType = entityType;
    if (["create", "update", "delete"].includes(action)) filter.action = action;

    // Con tres chips (tipo, acción) se podía mirar el registro, pero no
    // BUSCAR en él — y el uso real de una auditoría es puntual: "¿quién le
    // sacó el admin a fulano?", "¿qué pasó con este vino?". `before`/`after`
    // son objetos libres (cada entidad guarda lo suyo), así que se busca por
    // los campos que de verdad identifican una fila para quien la lee: el
    // admin que actuó y el nombre/mail/título de lo afectado.
    if (q) {
      const rx = new RegExp(escapeRegex(q), "i");
      filter.$or = [
        { "actor.email": rx },
        { "after.name": rx },
        { "before.name": rx },
        { "after.title": rx },
        { "before.title": rx },
        { "after.targetEmail": rx },
        { "before.email": rx },
        { "before.wine": rx },
      ];
    }

    // Antes esto sólo tenía `limit`: cualquier movimiento más allá de los
    // últimos 100 quedaba inaccesible desde el panel, no sólo lento de
    // traer. Con `page`/`skip` la historia completa es navegable.
    const [logs, total] = await Promise.all([
      ChangeLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      ChangeLog.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: logs,
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    });
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

    const sortField = ["createdAt", "wineCount", "reviewCount"].includes(String(req.query.sort))
      ? req.query.sort
      : "createdAt";
    const sortDir = req.query.dir === "asc" ? 1 : -1;
    // wineCount/reviewCount no viven en el documento (se calculan abajo), así
    // que no se pueden ordenar en la consulta de `User` — se ordenan en
    // memoria después de traer la página. Es correcto porque el orden por
    // esas columnas es sólo dentro de la página visible, no global; ordenar
    // "todos los usuarios por cantidad de vinos" de verdad necesitaría una
    // agregación distinta, que no vale la pena mientras el panel pagina de a
    // pocas decenas de filas.
    const sortInMemory = sortField !== "createdAt";

    const users = await User.find(filter)
      .select("_id email firstName lastName role createdAt")
      .sort(sortInMemory ? { createdAt: -1 } : { [sortField]: sortDir })
      .skip(skip)
      .limit(limit)
      .lean();

    // Conteo real de vinos y reseñas por usuario, en dos consultas agregadas
    // (no una por fila): es lo que permite ver de un vistazo quién usa la app.
    const ids = users.map((u) => u._id);
    const [wineCounts, reviewCounts, facet] = await Promise.all([
      Wine.aggregate([{ $match: { userId: { $in: ids } } }, { $group: { _id: "$userId", n: { $sum: 1 } } }]),
      WineReview.aggregate([{ $match: { userId: { $in: ids } } }, { $group: { _id: "$userId", n: { $sum: 1 } } }]),
      // `total` (con el filtro activo) y `admins` (global, para la guarda de
      // "no te quedes sin admins") en una sola ida a la base en vez de dos
      // `countDocuments` en serie.
      User.aggregate([
        {
          $facet: {
            total: [{ $match: filter }, { $count: "n" }],
            admins: [{ $match: { role: "admin" } }, { $count: "n" }],
          },
        },
      ]),
    ]);
    const wineMap = new Map(wineCounts.map((r) => [String(r._id), r.n]));
    const reviewMap = new Map(reviewCounts.map((r) => [String(r._id), r.n]));
    const total = facet[0]?.total[0]?.n || 0;
    const admins = facet[0]?.admins[0]?.n || 0;

    let rows = users.map((u) => ({
      ...u,
      wineCount: wineMap.get(String(u._id)) || 0,
      reviewCount: reviewMap.get(String(u._id)) || 0,
      isSelf: String(u._id) === String(req.user.id),
    }));
    if (sortInMemory) {
      rows = rows.sort((a, b) => (a[sortField] - b[sortField]) * sortDir);
    }

    return res.status(200).json({
      data: rows,
      meta: { admins },
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
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

    const previousRole = user.role;
    user.role = role;
    await user.save();

    // Otorgar o quitar admin es la acción más sensible del panel — quedaba
    // sin auditar mientras que un simple cambio de vino sí lo estaba. Si una
    // cuenta admin se compromete, esto es lo primero que hay que poder mirar.
    await logAdminAction({
      entityType: "user",
      entityId: user._id,
      action: "update",
      actor: { userId: req.user.id, email: req.user.email, role: "admin" },
      before: { role: previousRole },
      after: { role: user.role, targetEmail: user.email },
    });

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
    //
    // Va dentro de una transacción: son 5 borrados separados y, si el proceso
    // se cae a mitad de camino (o uno de los `deleteMany` falla), sin
    // transacción la cuenta podía quedar borrada con vinos/reseñas/deseos
    // huérfanos todavía en la base — o al revés, la cuenta seguir viva con
    // parte de sus datos ya borrados. `withTransaction` deshace todo si algo
    // falla a mitad de camino.
    //
    // Sólo funciona contra un replica set (así corre producción, en Atlas).
    // Un Mongo standalone local (`mongodb://127.0.0.1:27017`, sin réplica) no
    // soporta transacciones y tira ese error puntual — ahí se cae al borrado
    // sin transacción de siempre, para no bloquear el desarrollo local.
    const cascade = async (session) => {
      const opts = session ? { session } : undefined;
      await Promise.all([
        Wine.deleteMany({ userId: user._id }, opts),
        WineWish.deleteMany({ userId: user._id }, opts),
        WineMoment.deleteMany({ userId: user._id }, opts),
        WineReview.deleteMany({ userId: user._id }, opts),
      ]);
      await User.deleteOne({ _id: user._id }, opts);
    };

    try {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(() => cascade(session));
      } finally {
        await session.endSession();
      }
    } catch (txError) {
      const noSoportaTransacciones =
        /Transaction numbers|IllegalOperation|Transactions are not supported/i.test(
          String(txError?.message || "")
        );
      if (!noSoportaTransacciones) throw txError;
      await cascade(null);
    }

    await logAdminAction({
      entityType: "user",
      entityId: user._id,
      action: "delete",
      actor: { userId: req.user.id, email: req.user.email, role: "admin" },
      before: { email: user.email, role: user.role, firstName: user.firstName },
      after: null,
    });

    return res.status(200).json({ message: `Cuenta de ${user.email} eliminada` });
  } catch (error) {
    return next(error);
  }
};

/**
 * Borra varios usuarios de una — pensado para las cuentas de prueba
 * (qa_*, smoke_*) que hoy hay que sacar de a una. Reusa exactamente las
 * mismas guardas que `deleteUser` (no te podés borrar a vos mismo, no se
 * puede dejar la app sin ningún admin) fila por fila, así que un pedido con
 * 10 ids donde una es inválida borra las otras 9 y avisa cuál falló, en vez
 * de fallar todo o nada por una sola fila problemática.
 */
const bulkDeleteUsers = async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    if (ids.length === 0) {
      return res.status(400).json({ message: "No se recibió ningún usuario para eliminar" });
    }
    if (ids.length > 100) {
      return res.status(400).json({ message: "Máximo 100 usuarios por lote" });
    }

    const deleted = [];
    const failed = [];

    for (const userId of ids) {
      try {
        const user = await User.findById(userId);
        if (!user) {
          failed.push({ userId, reason: "No encontrado" });
          continue;
        }
        if (String(user._id) === String(req.user.id)) {
          failed.push({ userId, email: user.email, reason: "Es tu propia cuenta" });
          continue;
        }
        if (user.role === "admin") {
          const admins = await User.countDocuments({ role: "admin" });
          if (admins <= 1) {
            failed.push({ userId, email: user.email, reason: "Es el único admin" });
            continue;
          }
        }

        await Promise.all([
          Wine.deleteMany({ userId: user._id }),
          WineWish.deleteMany({ userId: user._id }),
          WineMoment.deleteMany({ userId: user._id }),
          WineReview.deleteMany({ userId: user._id }),
        ]);
        await User.deleteOne({ _id: user._id });

        await logAdminAction({
          entityType: "user",
          entityId: user._id,
          action: "delete",
          actor: { userId: req.user.id, email: req.user.email, role: "admin" },
          before: { email: user.email, role: user.role, firstName: user.firstName },
          after: null,
        });

        deleted.push({ userId, email: user.email });
      } catch {
        failed.push({ userId, reason: "Error al eliminar" });
      }
    }

    return res.status(200).json({
      message: `${deleted.length} de ${ids.length} cuentas eliminadas`,
      data: { deleted, failed },
    });
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
    // Filtro por puntaje: el uso real de moderación es "mostrame las de 1-2
    // estrellas primero", no revisar todo en orden cronológico.
    const maxRating = Number(req.query.maxRating);

    const filter = {};
    if (q) {
      const rx = new RegExp(escapeRegex(q), "i");
      filter.$or = [{ name: rx }, { winery: rx }, { text: rx }, { authorName: rx }];
    }
    if (Number.isFinite(maxRating) && maxRating >= 1 && maxRating <= 5) {
      filter.rating = { $lte: maxRating };
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
  bulkDeleteUsers,
  getReviews,
  deleteReview,
};
