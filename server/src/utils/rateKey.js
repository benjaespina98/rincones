/**
 * Clave de los límites de intentos de cuenta: IP + email.
 *
 * Sólo por IP, detrás del rewrite de Vercel todos podrían compartir bucket y
 * cinco fallos ajenos dejarían sin login a todo el mundo. Sólo por email, un
 * atacante bloquearía a su víctima. Con las dos cosas el golpe queda acotado a
 * "esta IP contra esta cuenta"; el barrido de muchas cuentas desde una IP lo
 * frena un segundo límite que mira sólo la IP (ver app.js).
 *
 * El email puede venir como cualquier cosa en un body malicioso: sólo cuenta si
 * es texto.
 */
const claveIpEmail = (req) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase().slice(0, 254) : "";
  return `${req.ip}|${email}`;
};

module.exports = { claveIpEmail };
