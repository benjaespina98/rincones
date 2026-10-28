const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth.middleware");
const User = require("../models/user.model");
const Wine = require("../models/wine.model");
const { calculateAge, validateBirthDate } = require("../utils/age");
const { fail } = require("../utils/apiError");
const { esImagenAceptada } = require("../utils/imagenAceptada");
const winesService = require("../services/wines.service");
const { validatePasswordStrength } = require("../utils/password");
const sessions = require("../services/session.service");
const wineReviews = require("../services/wineReviews.service");
const { deleteAccount } = require("../services/accountDeletion.service");
const { exportAccount } = require("../services/accountExport.service");
const { acotarLista } = require("../utils/acotarLista");
const { passwordLimiter } = require("../middleware/aiLimiter");


// GET /api/users/profile - Obtener perfil del usuario actual
router.get("/profile", authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-passwordHash");

    if (!user) {
      return res.status(404).json({ success: false, error: "Usuario no encontrado" });
    }

    res.json({
      success: true,
      data: {
        id: user._id,
        email: user.email,
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        city: user.city || "",
        country: user.country || "",
        bio: user.bio || "",
        avatar: user.avatar || "",
        avatarPhoto: user.avatarPhoto || "",
        birthDate: user.birthDate || null,
        age: calculateAge(user.birthDate),
        onboarded: Boolean(user.onboardedAt),
        preferences: user.preferences || {},
        stats: user.stats || {},
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    fail(res, error, req);
  }
});

// PUT /api/users/profile - Actualizar perfil del usuario
router.put("/profile", authenticate, async (req, res) => {
  try {
    const {
      firstName, lastName, city, country, bio, avatar, avatarPhoto, birthDate,
      theme, language, notifications,
      favoriteTypes, favoriteVarietals, onboarded,
    } = req.body;

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, error: "Usuario no encontrado" });
    }

    // Preferencias de gusto (onboarding) — arrays de strings, acotados.
    if (Array.isArray(favoriteTypes)) {
      user.preferences.favoriteTypes = acotarLista(favoriteTypes, { items: 10 });
    }
    if (Array.isArray(favoriteVarietals)) {
      user.preferences.favoriteVarietals = acotarLista(favoriteVarietals, { items: 20 });
    }
    // Marca el onboarding como completado (una sola vez).
    if (onboarded === true && !user.onboardedAt) {
      user.onboardedAt = new Date();
    }

    // La fecha de nacimiento se puede corregir, pero sigue validando 18+.
    if (birthDate !== undefined) {
      const birthValidation = validateBirthDate(birthDate);
      if (!birthValidation.valid) {
        return res.status(400).json({ success: false, error: birthValidation.message });
      }
      user.birthDate = birthValidation.date;
    }

    // Tipos: un valor que no sea texto tiraba 500 al llamar a .trim(), y la foto
    // de perfil viajaba en cada /me sin forma ni tope.
    for (const [valor, etiqueta] of [
      [firstName, "El nombre"], [lastName, "El apellido"], [city, "La ciudad"],
      [country, "El país"], [bio, "La bio"], [avatar, "El avatar"], [avatarPhoto, "La foto"],
      [theme, "El tema"], [language, "El idioma"],
    ]) {
      if (valor !== undefined && typeof valor !== "string") {
        return res.status(400).json({ success: false, error: etiqueta + " no es válido" });
      }
    }
    if (typeof avatar === "string" && avatar.length > 16) {
      return res.status(400).json({ success: false, error: "El avatar no es válido" });
    }
    if (typeof avatarPhoto === "string" && avatarPhoto.trim() !== "") {
      if (avatarPhoto.length > 2000000 || !esImagenAceptada(avatarPhoto)) {
        return res.status(400).json({ success: false, error: "La foto no es válida" });
      }
    }

    // Largos: la pantalla ya los limita, pero la API se puede llamar sin la pantalla.
    for (const [valor, max, etiqueta, largo] of [
      [firstName, 40, "El nombre", "largo"],
      [lastName, 40, "El apellido", "largo"],
      [city, 60, "La ciudad", "larga"],
      [country, 60, "El país", "largo"],
      [bio, 500, "La bio", "larga"],
    ]) {
      if (typeof valor === "string" && valor.trim().length > max) {
        return res.status(400).json({ success: false, error: `${etiqueta} es demasiado ${largo} (máximo ${max} caracteres)` });
      }
    }

    // Actualizar campos de perfil
    if (firstName !== undefined) user.firstName = firstName.trim();
    if (lastName !== undefined) user.lastName = lastName.trim();
    if (city !== undefined) user.city = city.trim();
    if (country !== undefined) user.country = country.trim();
    if (bio !== undefined) user.bio = bio.trim();
    if (avatar !== undefined) user.avatar = avatar;
    // Vacío es una decisión válida acá: es "sacame la foto de Google, uso el
    // emoji". Se recuerda con `avatarPhotoRemoved` para que el próximo login
    // con Google no la vuelva a pegar sola (ver auth.controller.js).
    if (avatarPhoto !== undefined) {
      const limpia = String(avatarPhoto || "").trim();
      user.avatarPhoto = limpia;
      user.avatarPhotoRemoved = !limpia;
    }

    // Actualizar preferencias
    if (theme !== undefined) user.preferences.theme = theme;
    if (language !== undefined) user.preferences.language = language;
    if (notifications !== undefined) {
      user.preferences.notifications = {
        ...user.preferences.notifications,
        ...notifications,
      };
    }

    user.updatedAt = new Date();
    await user.save();

    res.json({
      success: true,
      message: "Perfil actualizado",
      data: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        city: user.city,
        country: user.country,
        bio: user.bio,
        avatar: user.avatar,
        avatarPhoto: user.avatarPhoto || "",
        birthDate: user.birthDate || null,
        age: calculateAge(user.birthDate),
        onboarded: Boolean(user.onboardedAt),
        preferences: user.preferences,
      },
    });
  } catch (error) {
    fail(res, error, req);
  }
});

/**
 * GET /api/users/me/export — llevarse los datos propios.
 *
 * Va acá y no en un endpoint de admin porque es de la persona, no de la
 * operación: la única consulta posible es por `req.user.id`, así que no hay
 * forma de pedir los datos de otro ni equivocándose.
 *
 * `Content-Disposition: attachment` para que el navegador lo baje como archivo
 * en vez de mostrarlo: un JSON de doscientos vinos abierto en una pestaña no le
 * sirve a nadie, y en un teléfono directamente no se puede guardar desde ahí.
 */
router.get("/me/export", authenticate, async (req, res) => {
  try {
    const datos = await exportAccount(req.user.id);
    if (!datos) return res.status(404).json({ message: "Usuario no encontrado" });

    const fecha = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="rincones-${fecha}.json"`);
    // Indentado: el archivo es para que lo lea una persona, no una máquina.
    return res.status(200).send(JSON.stringify(datos, null, 2));
  } catch (error) {
    fail(res, error, req);
  }
});

// DELETE /api/users/me - Baja de cuenta con borrado real de los datos.
// Pide el email escrito a mano (y la contraseña, si la cuenta tiene) para que
// no se pueda disparar por un toque de más ni con una sesión olvidada abierta.
router.delete("/me", authenticate, passwordLimiter, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("+passwordHash email");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

    const confirmEmail = String(req.body?.confirmEmail || "").trim().toLowerCase();
    if (confirmEmail !== user.email) {
      return res.status(400).json({ message: "Escribí tu email para confirmar la baja" });
    }
    if (user.passwordHash) {
      const passwordOk = await user.comparePassword(String(req.body?.password || ""));
      // 403 y no 401: un 401 le dice al cliente "la sesión venció" y lo manda al login.
      if (!passwordOk) return res.status(403).json({ message: "La contraseña no es correcta" });
    }

    const result = await deleteAccount(user._id);
    if (!result.ok) {
      const message =
        result.reason === "last_admin"
          ? "Sos el único admin: no se puede dar de baja la cuenta"
          : "Usuario no encontrado";
      return res.status(result.reason === "last_admin" ? 400 : 404).json({ message });
    }

    sessions.clearAuthCookies(res);
    return res.status(200).json({ message: "Tu cuenta y tus datos se eliminaron" });
  } catch (error) {
    fail(res, error, req);
  }
});

// PUT /api/users/password - Cambiar contraseña
router.put("/password", authenticate, passwordLimiter, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ success: false, error: "Contraseña actual y nueva requeridas" });
    }

    // `.select("+passwordHash")` es imprescindible: el campo tiene select:false
    // en el schema, así que sin esto llegaba `undefined` a bcrypt.compare y el
    // endpoint tiraba 500 SIEMPRE. Cambiar la contraseña desde el perfil nunca
    // había funcionado — el 500 genérico tapaba la causa.
    const user = await User.findById(req.user.id).select("+passwordHash");

    if (!user) {
      return res.status(404).json({ success: false, error: "Usuario no encontrado" });
    }

    const isPasswordValid = await user.comparePassword(currentPassword);

    if (!isPasswordValid) {
      // 403 y no 401, por lo mismo que en DELETE /me: no es una sesión vencida.
      return res.status(403).json({ success: false, error: "Contraseña actual incorrecta" });
    }

    // Este endpoint NO validaba la fortaleza: se podía pasar de una contraseña
    // fuerte a "a" desde el perfil, aunque el registro sí lo impedía.
    const fuerza = validatePasswordStrength(newPassword);
    if (!fuerza.valid) {
      return res.status(400).json({ success: false, error: fuerza.message });
    }

    user.passwordHash = await user.hashPassword(newPassword);
    user.updatedAt = new Date();
    await user.save();

    // Cambiar la contraseña cierra las sesiones abiertas en OTROS dispositivos.
    // Es la razón habitual por la que uno la cambia —sospecha de que alguien
    // más entró—, y dejarlas vivas haría que el cambio no sirviera de nada.
    // La sesión actual se renueva para no echar a quien acaba de cambiarla.
    await sessions.revokeAllForUser(user._id);
    await sessions.startSession(res, user, req);

    res.json({
      success: true,
      message: "Contraseña actualizada. Se cerraron las sesiones en otros dispositivos.",
    });
  } catch (error) {
    fail(res, error, req);
  }
});

/**
 * GET /api/users/stats — las estadísticas del usuario.
 *
 * ── POR QUÉ NO DEVUELVE `user.stats` ────────────────────────────────────────
 * Porque había DOS respuestas para la misma pregunta y salían de fuentes
 * distintas: esta ruta devolvía `user.stats`, un contador que se mantiene a mano
 * sumando y restando en ocho lugares del servicio de vinos, mientras que
 * /wines/stats/summary cuenta los vinos de verdad. Dos números para el mismo
 * hecho es un número que en algún momento va a estar mal, y encima sin fallar:
 * alcanza con que una escritura se pierda, o con que alguien agregue un camino
 * nuevo y se olvide de tocar el contador, para que empiecen a discrepar.
 *
 * Ahora las dos rutas cuentan lo mismo, contándolo. `user.stats` sigue
 * existiendo y actualizándose, pero ya no lo lee nadie: dejó de ser una
 * respuesta y pasó a ser lo que era, un caché.
 */
router.get("/stats", authenticate, async (req, res) => {
  try {
    const resumen = await winesService.getStatsSummary(req.user.id);
    res.json({
      success: true,
      data: {
        winesCount: resumen.totalWines,
        tastedWines: resumen.tastedWines,
        averageRating: resumen.averageRating,
      },
    });
  } catch (error) {
    fail(res, error, req);
  }
});

// GET /api/users/:id/wine-stats - Estadísticas derivadas de la colección de vinos del usuario
router.get("/:id/wine-stats", authenticate, async (req, res) => {
  try {
    const targetUserId = req.params.id;

    /**
     * Sólo tus propias estadísticas.
     *
     * Acá había además un `|| req.user.isAdmin`, y era código muerto: el
     * middleware pone `id`, `email` y `role` en `req.user` — nunca `isAdmin`—,
     * así que la condición era siempre falsa y ningún admin pasó jamás por ese
     * camino. Fallaba cerrado, que es el lado bueno para equivocarse, pero la
     * línea decía que existía un permiso que no existía.
     *
     * No se "arregla" apuntando a `role`: el rol del token es el que tenías al
     * iniciar sesión, y por eso las rutas de admin usan `requireAdmin`, que lo
     * verifica contra la base. Esta ruta no lo necesita — su único llamador es
     * el dueño de las stats— así que la regla queda dicha en una sola línea.
     */
    if (req.user.id !== targetUserId) {
      return res.status(403).json({ success: false, error: "No autorizado" });
    }

    const stats = await Wine.getUserStats(targetUserId);

    /**
     * `ratedCount` venía de la agregación de arriba: cuántos vinos de TU
     * BODEGA ACTUAL tienen `rating > 0`. "Tus valoraciones" en el perfil lleva
     * a `MyRatings`, que lista reseñas PUBLICADAS (`WineReview`) — y esa lista
     * sobrevive a que borres el vino, o existe sin que el vino haya estado
     * nunca en tu bodega (puntuaste desde el catálogo). Dos tablas para el
     * mismo número es como el perfil terminaba diciendo "1" con dos reseñas
     * esperando adentro: se pisa acá con el conteo real de lo que esa pantalla
     * va a mostrar.
     */
    // El promedio (`avgRating`) sale de los puntajes de la bodega; este número es cuántos vinos lo
    // forman. Se guarda aparte porque `ratedCount` se pisa justo abajo con otra cuenta (las reseñas
    // publicadas), y el perfil terminaba diciendo "promedio de 2 vinos" sobre un promedio de 6.
    stats.ratedInCellar = stats.ratedCount;
    stats.ratedCount = await wineReviews.countByUser(targetUserId);

    /**
     * ── UN NÚMERO CON TIEMPO ADENTRO ─────────────────────────────────────────
     *
     * Todo lo demás en `stats` es "de siempre": vinos totales, probados
     * totales. Ninguno contesta "¿tomé mucho este mes?", que es la pregunta de
     * verdad detrás de "cuántos vinos tomé".
     *
     * No hay un registro de CADA botella abierta con su fecha —`adjustStock`
     * sólo mueve un contador—, así que no se puede contar "botellas de este
     * mes" sin inventar datos. Lo que SÍ hay, siempre, es `lastConsumedAt`: la
     * última vez que se abrió CADA vino. Contar vinos cuyo último consumo cae
     * en la ventana es honesto con lo que se sabe — dice "vinos distintos que
     * tomaste", no "botellas", y no cuenta dos veces el mismo Malbec si lo
     * abriste tres noches seguidas ese mes.
     */
    const ahora = new Date();
    const inicioDelMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const inicioDelAnio = new Date(ahora.getFullYear(), 0, 1);
    const [esteMes, esteAnio] = await Promise.all([
      Wine.countDocuments({ userId: targetUserId, lastConsumedAt: { $gte: inicioDelMes } }),
      Wine.countDocuments({ userId: targetUserId, lastConsumedAt: { $gte: inicioDelAnio } }),
    ]);
    stats.recientes = { esteMes, esteAnio };

    res.json({ success: true, data: stats });
  } catch (error) {
    fail(res, error, req);
  }
});

module.exports = router;
