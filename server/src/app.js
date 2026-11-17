const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { claveIpEmail } = require("./utils/rateKey");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");

const { corsOptions } = require("./config/cors");
const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const labelsRoutes = require("./routes/labels.routes");
const catalogRoutes = require("./routes/catalog.routes");
const sommelierRoutes = require("./routes/sommelier.routes");
const winesRoutes = require("./routes/wines.routes");
const wishesRoutes = require("./routes/wishes.routes");
const usersRoutes = require("./routes/users.routes");
const analyticsRoutes = require("./routes/analytics.routes");
const promotionsRoutes = require("./routes/promotions.routes");
const errorHandler = require("./middleware/errorHandler");
const { errorShape } = require("./middleware/errorShape");

const app = express();

// Cuando se ejecuta detrás de un proxy (Vercel, Heroku, etc.), habilitar
// 'trust proxy' para que express-rate-limit y otros middlewares lean correctamente
// la IP real del cliente desde `X-Forwarded-For`.
app.set("trust proxy", 1);

// Security: HTTP Headers
app.use(helmet());
// Todos los errores de la API salen con `message` y `error` iguales (ver middleware/errorShape.js).
app.use(errorShape);

// Security: Rate limiting.
// El límite general es amplio porque la app es una SPA que hace varias llamadas
// por pantalla (destacados, búsquedas del sommelier, etc.). Detrás de un NAT
// varios usuarios comparten IP, así que un límite muy bajo cortaría a gente real.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 600,
  message: "Demasiadas solicitudes, intenta más tarde",
  standardHeaders: true,
  legacyHeaders: false,
  // La ingesta de métricas queda afuera de la cuota general y tiene la suya
  // propia (ver routes/analytics.routes.js). Si compartiera este presupuesto,
  // medir le comería los pedidos a las cosas que el usuario sí necesita: una
  // sesión larga mandaría decenas de eventos y podría dejar sin cuota a la
  // pantalla siguiente. Y al revés: alguien usando mucho la app se quedaría sin
  // poder reportar nada, sesgando justo los datos de los usuarios más activos.
  // Lo mismo vale para el conteo de impresiones de los destacados: tiene su propio
  // límite (ver routes/promotions.routes.js) y no puede comerle cuota a lo que el
  // usuario necesita.
  skip: (req) =>
    req.path === "/api/analytics/collect" || req.path === "/api/promotions/events",
});

// Aplicar rate limiting más estricto a login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // máximo 5 intentos de login
  message: "Demasiados intentos de login, intenta en 15 minutos",
  skipSuccessfulRequests: true, // no contar requests exitosos
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: claveIpEmail,
});

// Rate limiter específico para forgot-password (proteger abuso)
const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 5, // máximo 5 solicitudes por IP por hora
  message: "Demasiadas solicitudes de restablecimiento, intenta más tarde",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: claveIpEmail,
});

// El segundo freno: sólo por IP y más laxo. Con IP+email solos, una IP podría probar
// 5 contraseñas contra cada cuenta de una lista; esto acota el barrido total.
const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Demasiados intentos de login, intenta en 15 minutos",
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
});
const forgotIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: "Demasiadas solicitudes de restablecimiento, intenta más tarde",
  standardHeaders: true,
  legacyHeaders: false,
});

// Exportar los datos propios: ver dónde se monta, más abajo, para el porqué.
const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 10,
  message: "Esperá un rato antes de volver a descargar tus datos",
  standardHeaders: true,
  legacyHeaders: false,
});

// Registro: antes sólo lo cubría el límite general de 600/15min compartido con
// toda la API. Crear cuentas es justo la acción que un script de abuso repite
// (probar emails, saturar el envío de verificación), así que le pusimos el
// suyo — generoso para una persona real, no para un loop.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  // 20 por IP y hora en producción. La suite E2E registra una cuenta por prueba desde una sola IP y supera ese
  // tope: su servidor lo sube con REGISTER_RATE_LIMIT (nunca se define en producción).
  max: Number.parseInt(process.env.REGISTER_RATE_LIMIT, 10) || 20,
  message: "Demasiadas cuentas creadas desde acá, intenta más tarde",
  standardHeaders: true,
  legacyHeaders: false,
});

// Reenvío de verificación: mismo criterio que forgotLimiter (protege el envío
// de mails, no la creación de cuentas).
const resendVerificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 5,
  message: "Demasiados reenvíos, intenta más tarde",
  standardHeaders: true,
  legacyHeaders: false,
});

// Login con Google: antes compartía el bucket de 5/15min de `loginLimiter`,
// pensado para frenar adivinar contraseñas por fuerza bruta. Acá no hay
// contraseña que adivinar — el credential es un JWT que ya firmó Google, así
// que el riesgo de abuso es otro (loops rotos, reintentos de una integración
// que falla), no fuerza bruta. Un límite compartido con login castigaba a
// alguien probando distintas cuentas de Google en poco tiempo con el mismo
// mensaje ambiguo que un ataque de contraseñas — más generoso, pero no
// abierto del todo.
const googleAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20,
  message: "Demasiados intentos, intenta en unos minutos",
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
});

// La política vive en config/cors.js, no acá. Estaba escrita también en el
// entrypoint de Vercel y las dos copias se separaron: PATCH quedó permitido en
// esta y no en la otra, y eso rompió en producción —sólo en producción— el "+"/"−"
// del stock, pasar un guardado a la bodega y marcar favorito en Guardados.
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

// El rate limiter va DESPUÉS de CORS: si no, una respuesta 429 sale sin las
// cabeceras Access-Control-* y el browser la reporta como error de CORS en vez
// de "demasiadas solicitudes", ocultando la causa real.
app.use(limiter);

app.use(cookieParser()); // Parsear cookies
// Las rutas de cuenta no necesitan más que unos bytes: el tope grande es sólo
// para las fotos, y acá se aplica antes de autenticar.
app.use("/api/auth", express.json({ limit: "50kb" }));
app.use(express.json({ limit: "12mb" }));

app.get("/", (req, res) => {
  res.status(200).json({
    service: "rincones-server",
    status: "ok",
    health: "/api/health",
  });
});

app.get("/api/health", (req, res) => {
  // Sólo estado, nada de versiones, hosts ni nombres de base. `db` sirve para
  // que un monitor externo distinga "el server vive" de "el server ve Mongo".
  const dbUp = mongoose.connection.readyState === 1;
  res.status(dbUp ? 200 : 503).json({ status: dbUp ? "ok" : "degraded", db: dbUp ? "up" : "down" });
});

app.use("/api/auth/login", loginIpLimiter, loginLimiter);
app.use("/api/auth/google", googleAuthLimiter);
app.use("/api/auth/forgot-password", forgotIpLimiter, forgotLimiter);
app.use("/api/auth/register", registerLimiter);
app.use("/api/auth/resend-verification", resendVerificationLimiter);
/**
 * La exportación de datos personales.
 *
 * Es el endpoint más caro de la app por pedido: lee cinco colecciones enteras
 * del usuario y las serializa en memoria. Con una bodega grande son varios
 * megas, y repetirlo en bucle es la forma más barata de poner el servidor de
 * rodillas desde una cuenta legítima.
 *
 * Diez por hora es holgado para una persona —exportar es algo que se hace cada
 * tanto, no cada rato— y corta el bucle. Va por separado y no dentro del
 * general de 600 porque ahí un solo export mal repetido se come la cuota de
 * toda la navegación.
 */
app.use("/api/users/me/export", exportLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/labels", labelsRoutes);
app.use("/api/catalog", catalogRoutes);
app.use("/api/sommelier", sommelierRoutes);
app.use("/api/wines", winesRoutes);
app.use("/api/wishes", wishesRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/promotions", promotionsRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "Ruta no encontrada" });
});

app.use(errorHandler);

module.exports = app;
