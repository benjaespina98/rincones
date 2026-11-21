const mongoose = require("mongoose");
const ChangeLog = require("../models/changeLog.model");
const ErrorLog = require("../models/errorLog.model");
const User = require("../models/user.model");
const Wine = require("../models/wine.model");
const WineReview = require("../models/wineReview.model");
const WineWish = require("../models/wineWish.model");
const WineMoment = require("../models/wineMoment.model");
const catalogService = require("../services/catalog.service");
const accountDeletion = require("../services/accountDeletion.service");
const wineImages = require("../services/wineImages.service");
const imageStorage = require("../services/imageStorage.service");
const growthMetrics = require("../services/growthMetrics.service");
const { CATALOG, fold } = require("../data/argentineWines");
const { filtroDeFechas } = require("../utils/dateRange");
const { leerPaginacion } = require("../utils/paginacion");

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

/**
 * Qué se guarda de la cuenta afectada en el registro de auditoría: el mail ENMASCARADO y nunca el nombre.
 * El registro no caduca, y quien pide irse (o a quien se le da de baja) no puede quedar ahí con nombre y mail.
 */
const cuentaParaAuditoria = (user) => ({
  email: accountDeletion.enmascararEmail(user.email),
  role: user.role,
});

const escapeRegex = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getChangeLogs = async (req, res, next) => {
  try {
    const { page, limit, skip } = leerPaginacion(req.query, { porDefecto: 30, maximo: 100 });

    const entityType = String(req.query.entityType || "").trim();
    const action = String(req.query.action || "").trim();
    const q = String(req.query.q || "").trim();
    const actor = String(req.query.actor || "").trim();
    const from = String(req.query.from || "").trim();
    const to = String(req.query.to || "").trim();
    const actorRole = String(req.query.actorRole || "").trim();

    const filter = {};
    if (entityType) filter.entityType = entityType;
    if (["create", "update", "delete"].includes(action)) filter.action = action;
    // El admin que actuó, aparte de `q`: buscar "¿qué hizo fulano?" con el
    // buscador de texto libre exige escribir su mail entero y de memoria; acá
    // alcanza con elegirlo de la lista de admins que ya actuaron (ver
    // `getChangeLogActors`).
    if (actor) filter["actor.email"] = actor;
    // Rango de fechas: "¿qué pasó esta semana?" es una pregunta tan real como
    // "¿qué pasó con este vino?". Los días se interpretan en calendario argentino (el mismo
    // corte que las métricas, ver utils/dateRange) y `to` incluye el día entero hasta las
    // 23:59:59.999. Un valor que no sea un "YYYY-MM-DD" real se ignora.
    const rangoFechas = filtroDeFechas({ from, to });
    if (rangoFechas) filter.createdAt = rangoFechas;

    // Quién actuó: un admin o una persona común editando lo suyo. El registro mezcla las dos
    // cosas (cada alta, edición o baja de vino queda con su autor), así que la pantalla necesita
    // poder separarlas. Los registros sin rol (viejos) cuentan como admin, que era lo único que
    // se auditaba antes.
    if (actorRole === "user") filter["actor.role"] = "user";
    else if (actorRole === "admin") filter["actor.role"] = { $ne: "user" };

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
      // Los mails de las cuentas afectadas se guardan ENMASCARADOS ("ju***@gmail.com"): buscar el mail entero
      // ("juan.perez@gmail.com") ya no coincidiría con el regex. Se busca también su forma enmascarada, que es
      // lo que hay guardado, y el dominio suelto ("@gmail.com") sigue encontrando por el regex de arriba.
      if (q.includes("@")) {
        const enmascarado = accountDeletion.enmascararEmail(q);
        filter.$or.push({ "after.targetEmail": enmascarado }, { "before.email": enmascarado });
      }
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

// Quiénes aparecen como actor en el registro, para el filtro "Admin" — una
// lista de mails para elegir, no un campo de texto libre que exige saber de
// memoria quién hizo qué.
//
// `data` sigue siendo la lista de mails (contrato de siempre). `details` suma el rol con el que
// actuó cada uno la última vez, y `?role=admin|user` filtra la lista: la columna "Admin" del
// registro listaba también a usuarios comunes (el actor es quien edita, sea quien sea).
const getChangeLogActors = async (req, res, next) => {
  try {
    const role = String(req.query.role || "").trim();
    const filas = await ChangeLog.aggregate([
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$actor.email", role: { $first: "$actor.role" } } },
    ]);
    const details = filas
      .filter((f) => f._id)
      .map((f) => ({ email: f._id, role: f.role === "user" ? "user" : "admin" }))
      .filter((f) => !["admin", "user"].includes(role) || f.role === role)
      .sort((a, b) => a.email.localeCompare(b.email));
    return res.status(200).json({ data: details.map((d) => d.email), details });
  } catch (error) {
    return next(error);
  }
};

/**
 * ── LOGS: LO QUE SE ROMPE, NO LO QUE SE HACE ────────────────────────────────
 * `ChangeLog` (arriba) es una auditoría de acciones — alguien crea, edita o
 * borra algo. Esto es la otra mitad, que hasta ahora sólo existía en la
 * consola de la terminal mientras el server corría: un 500, un `AbortError`
 * de Gemini, cualquier excepción que se haya escapado. Ver
 * `errorLog.service.js` para dónde se escribe.
 */
const getErrorLogs = async (req, res, next) => {
  try {
    const { page, limit, skip } = leerPaginacion(req.query, { porDefecto: 30, maximo: 100 });

    const q = String(req.query.q || "").trim();
    const from = String(req.query.from || "").trim();
    const to = String(req.query.to || "").trim();

    const filter = {};
    if (q) {
      const rx = new RegExp(escapeRegex(q), "i");
      filter.$or = [{ message: rx }, { route: rx }];
    }
    const rangoFechas = filtroDeFechas({ from, to });
    if (rangoFechas) filter.createdAt = rangoFechas;

    const [logs, total] = await Promise.all([
      ErrorLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      ErrorLog.countDocuments(filter),
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

    // Crecimiento y activación (ver growthMetrics.service), en paralelo con lo de abajo. Si falla,
    // el resto del resumen sigue llegando y `growth` va en null: un número nuevo no puede tirar el
    // panel entero. `?growth=0` lo omite. Acepta `days`, `from` y `to` (calendario argentino).
    const growthPendiente =
      String(req.query.growth) === "0"
        ? Promise.resolve(null)
        : growthMetrics
            .consultarCrecimiento({ days: req.query.days, from: req.query.from, to: req.query.to })
            .catch(() => null);

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
        growth: await growthPendiente,
      },
    });
  } catch (error) {
    return next(error);
  }
};

// Listar usuarios con búsqueda y conteo de actividad (solo para admins).
const getUsers = async (req, res, next) => {
  try {
    const { page, limit, skip } = leerPaginacion(req.query, { porDefecto: 20, maximo: 100 });
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

    // Un id mal formado daba CastError → 500; es un pedido inválido, no una falla del server.
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "userId inválido" });
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
      after: { role: user.role, targetEmail: accountDeletion.enmascararEmail(user.email) },
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
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "userId inválido" });
    }
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
    // Lo que cuelga de la cuenta fuera de la transacción (sesiones, charlas con la guía, analytics…) se limpia ANTES de
    // borrarla: si falla, la cuenta sigue existiendo y se puede reintentar, en vez de quedar huérfano lo más personal.
    await accountDeletion.purgeUserLeftovers(user._id);
    const imagenes = await accountDeletion.imagenesPropias(user._id);

    const cascade = async (session) => {
      const opts = session ? { session } : undefined;
      await accountDeletion.borrarDatosPropios(user._id, opts);
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
      /**
       * ── EL BUG REAL: "BORRÉ UNO Y EL SIGUIENTE ME TIRÓ ERROR" ────────────────
       *
       * Reportado en producción, reproducido con el stack exacto:
       * "MongoServerError: Only servers in a sharded cluster can start a new
       * transaction at the active transaction number" — al segundo borrado
       * individual seguido, no al primero. Pasa en Atlas + funciones
       * serverless (Vercel): entre una invocación y la siguiente, la conexión
       * mongoose se reusa "tibia" para no pagar reconectar en cada request, y
       * a veces el pool de sesiones del driver entrega una sesión que quedó
       * con un número de transacción activo de un borrado anterior — el
       * server la rechaza con ESTE mensaje puntual, que la lista de abajo no
       * contemplaba.
       *
       * Es la MISMA situación que el comentario de arriba ya sabía manejar
       * (transacciones no usables acá → caer al borrado sin transacción):
       * sólo hacía falta que el patrón reconociera este mensaje también, no
       * únicamente "no hay soporte de transacciones en absoluto". Por eso el
       * arreglo es ensanchar el patrón, no agregar un camino nuevo — el
       * fallback correcto ya existía.
       */
      const noSoportaTransacciones =
        /transaction number|IllegalOperation|Transactions are not supported/i.test(
          String(txError?.message || "")
        );
      if (!noSoportaTransacciones) throw txError;
      await cascade(null);
    }

    await accountDeletion.limpiarImagenes(imagenes);

    await logAdminAction({
      entityType: "user",
      // Un id nuevo, no el de la cuenta borrada: el registro no caduca y con el id se unía con lo que quedara.
      entityId: new mongoose.Types.ObjectId(),
      action: "delete",
      actor: { userId: req.user.id, email: req.user.email, role: "admin" },
      before: cuentaParaAuditoria(user),
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
    // Sólo strings con forma de ObjectId, y sin repetidos: un objeto ({ $ne: null }) o un id basura no llega a
    // `findById` (mismo criterio que `deleteUser`). Los inválidos se informan como fallidos, no se pierden.
    const crudos = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : [];
    const ids = [];
    const invalidos = [];
    for (const id of new Set(crudos.filter((x) => typeof x === "string"))) {
      if (mongoose.isValidObjectId(id)) ids.push(id);
      else invalidos.push(id);
    }
    const noStrings = crudos.length - crudos.filter((x) => typeof x === "string").length;
    if (ids.length === 0 && invalidos.length === 0 && noStrings === 0) {
      return res.status(400).json({ message: "No se recibió ningún usuario para eliminar" });
    }
    if (crudos.length > 100) {
      return res.status(400).json({ message: "Máximo 100 usuarios por lote" });
    }

    const deleted = [];
    const failed = invalidos.map((userId) => ({ userId: userId.slice(0, 40), reason: "Id inválido" }));
    if (noStrings > 0) failed.push({ userId: null, reason: `${noStrings} elemento(s) que no son un id` });

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

        await accountDeletion.purgeUserLeftovers(user._id);
        const imagenes = await accountDeletion.imagenesPropias(user._id);
        await accountDeletion.borrarDatosPropios(user._id);
        await User.deleteOne({ _id: user._id });
        await accountDeletion.limpiarImagenes(imagenes);

        await logAdminAction({
          entityType: "user",
          entityId: new mongoose.Types.ObjectId(),
          action: "delete",
          actor: { userId: req.user.id, email: req.user.email, role: "admin" },
          before: cuentaParaAuditoria(user),
          after: null,
        });

        deleted.push({ userId, email: user.email });
      } catch {
        failed.push({ userId, reason: "Error al eliminar" });
      }
    }

    return res.status(200).json({
      message: `${deleted.length} de ${crudos.length} cuentas eliminadas`,
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
    const { page, limit, skip } = leerPaginacion(req.query, { porDefecto: 20, maximo: 100 });
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

// --- Curación de fotos (pool compartido) ---
//
// El pool (wineImages.service.js) ya se llena solo con lo que cargan los
// usuarios. Esto es para adelantarse: precargar la foto de un vino que el
// admin todavía no tiene en su propia bodega, en vez de esperar a que lo
// cargue alguien. Reusa la misma búsqueda de catálogo que usa el buscador de
// Descubrí, así el admin escribe el nombre del vino y no una clave interna.

/**
 * El universo completo de vinos que la app conoce, con su estado en el pool:
 * qué tiene foto puesta y qué no. Es la vista por defecto de la pantalla,
 * ANTES de escribir nada en el buscador — "tener a mano todo el pool", no
 * sólo lo que se busca de a uno.
 *
 * ── QUÉ ES "TODO" ────────────────────────────────────────────────────────
 * Dos fuentes, unidas por la misma clave que usa el pool (nombre+bodega+uva):
 *   1. El catálogo argentino curado (data/argentineWines.js) — siempre está,
 *      cueste lo que cueste.
 *   2. Cada vino DISTINTO que cualquier usuario haya cargado alguna vez —de
 *      cualquiera, no sólo del admin que mira—, porque un vino real en la
 *      bodega de alguien es tan parte del pool como uno del catálogo, y es
 *      justo el que el catálogo curado no puede tener todavía.
 * Si una clave aparece en las dos fuentes, gana el catálogo (datos más
 * prolijos de bodega/región) y no se duplica la fila.
 *
 * Cero costo de Gemini: agrupa y pagina en memoria más dos consultas
 * (`Wine.aggregate`, `WineImage.find`). `searchWineImages`, más abajo, sigue
 * ahí para el caso raro que ni así aparece — un nombre que el modelo tiene
 * que interpretar porque llegó mal escrito.
 */
const browseWineImages = async (req, res, next) => {
  try {
    const q = fold(String(req.query.q || "").trim());
    const hasPhoto = ["yes", "no"].includes(req.query.hasPhoto) ? req.query.hasPhoto : "all";
    const page = Math.max(1, Number(req.query.page || 1));
    // Tope duro en 50: es justo el pedido ("que se limite para no
    // sobrecargar la pantalla"), no una sugerencia que el cliente pueda subir.
    const limit = Math.min(Math.max(1, Number(req.query.limit || 50)), 50);

    const porClaveUnion = new Map();
    for (const w of CATALOG) {
      const key = wineImages.wineKey(w.name, w.winery, w.varietal);
      if (key) {
        porClaveUnion.set(key, {
          name: w.name,
          winery: w.winery,
          varietal: w.varietal,
          type: w.type,
          region: w.region,
        });
      }
    }

    // Distinto por nombre+bodega+uva, cargado por cualquier usuario. `$limit`
    // es un techo de seguridad —hoy la colección tiene un puñado de vinos—,
    // no un recorte que se espere alcanzar.
    const deLaApp = await Wine.aggregate([
      {
        $group: {
          _id: { name: "$name", winery: "$winery", varietal: "$varietal" },
          type: { $first: "$type" },
          region: { $first: "$region" },
        },
      },
      { $limit: 5000 },
    ]);
    for (const w of deLaApp) {
      const name = String(w._id.name || "").trim();
      if (!name) continue;
      const winery = String(w._id.winery || "").trim();
      const varietal = String(w._id.varietal || "").trim();
      const key = wineImages.wineKey(name, winery, varietal);
      // Ya está por el catálogo (o por otro usuario con el mismo vino, casi
      // idéntico escrito): no se duplica la fila.
      if (!key || porClaveUnion.has(key)) continue;
      porClaveUnion.set(key, { name, winery, varietal, type: w.type || "unknown", region: w.region || "" });
    }

    let universo = [...porClaveUnion.values()];
    if (q) {
      universo = universo.filter((w) => fold(`${w.name} ${w.winery} ${w.varietal} ${w.region}`).includes(q));
    }

    const porClave = await wineImages.getImagesFor(universo);
    const conEstado = universo.map((w) => ({
      ...w,
      poolImage: porClave.get(wineImages.wineKey(w.name, w.winery, w.varietal)) || "",
    }));

    const final =
      hasPhoto === "all"
        ? conEstado
        : conEstado.filter((w) => (hasPhoto === "yes" ? Boolean(w.poolImage) : !w.poolImage));

    // Orden estable: alfabético por bodega y nombre. Sin esto, dos pedidos de
    // la misma página podrían no traer las mismas filas (el Map no promete
    // orden fijo entre pedidos), y "página 2" se leería distinto cada vez.
    final.sort((a, b) => `${a.winery}${a.name}`.localeCompare(`${b.winery}${b.name}`, "es"));

    const total = final.length;
    const pages = Math.max(1, Math.ceil(total / limit));
    const data = final.slice((page - 1) * limit, page * limit);

    return res.status(200).json({ data, pagination: { page, limit, total, pages } });
  } catch (error) {
    return next(error);
  }
};

const searchWineImages = async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return res.status(200).json({ data: [], degraded: false });

    const { results, degraded } = await catalogService.searchWines(q);

    // `catalogImage` es lo que ya trae el catálogo (puede venir de una fuente
    // oficial, no del pool); `poolImage` es puntualmente lo que hoy se le
    // muestra a un usuario que no aportó foto propia — es lo único que esta
    // pantalla puede cambiar. Se muestran separadas para que el admin sepa
    // cuál está pisando.
    const data = await Promise.all(
      results.slice(0, 30).map(async (w) => ({
        name: w.name,
        winery: w.winery || "",
        varietal: w.varietal || "",
        type: w.type || "unknown",
        catalogImage: w.image || "",
        poolImage: await wineImages.getImage(w.name, w.winery, w.varietal),
      }))
    );

    return res.status(200).json({ data, degraded });
  } catch (error) {
    return next(error);
  }
};

const setWineImage = async (req, res, next) => {
  try {
    const { name, winery = "", varietal = "", image } = req.body;
    if (!String(name || "").trim()) {
      return res.status(400).json({ message: "Falta el nombre del vino" });
    }
    if (!String(image || "").trim()) {
      return res.status(400).json({ message: "Falta la imagen" });
    }

    const before = await wineImages.getImage(name, winery, varietal);
    // Mismo paso que al cargar un vino: subir a Cloudinary (si está
    // configurado) y guardar la URL liviana, no el base64 crudo.
    const stored = await imageStorage.store(String(image).trim());

    let result;
    try {
      result = await wineImages.adminSet({ name, winery, varietal, image: stored, userId: req.user.id });
    } catch (err) {
      return res.status(422).json({ message: err.message || "No se pudo guardar la imagen" });
    }

    await logAdminAction({
      entityType: "wineImage",
      entityId: result.id,
      action: before ? "update" : "create",
      actor: { userId: req.user.id, email: req.user.email, role: "admin" },
      before: before ? { image: before } : null,
      after: { image: stored, name, winery },
    });

    return res.status(200).json({ message: "Imagen guardada", data: { ...result, image: stored } });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getSummary,
  getChangeLogs,
  getChangeLogActors,
  getErrorLogs,
  getUsers,
  updateUserRole,
  deleteUser,
  bulkDeleteUsers,
  getReviews,
  deleteReview,
  browseWineImages,
  searchWineImages,
  setWineImage,
};
