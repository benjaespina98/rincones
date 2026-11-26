/**
 * Protección CSRF para la sesión en cookies.
 *
 * Tres capas: las cookies son `SameSite=Lax` (otro sitio no las manda en un POST), CORS rechaza los
 * orígenes ajenos y, acá, todo pedido que escribe usando las cookies tiene que traer una cabecera
 * propia. Un formulario de otro sitio no puede agregarla, y un `fetch` ajeno que la agregue necesita
 * un preflight que CORS rechaza.
 */
const CABECERA = "x-requested-with";
const VALOR = "rincones";

const SOLO_LECTURA = new Set(["GET", "HEAD", "OPTIONS"]);

// Salen con `sendBeacon`, que no admite cabeceras propias. Sólo cuentan visitas e impresiones.
const EXENTAS = new Set(["/api/analytics/collect", "/api/promotions/events"]);

const protegerCsrf = (req, res, next) => {
  if (SOLO_LECTURA.has(req.method)) return next();
  // Sin cookies de sesión no hay nada que un tercero pueda usar. Y un Bearer no lo agrega el navegador solo.
  const conCookies = Boolean(req.cookies?.authToken || req.cookies?.refreshToken);
  const auth = String(req.headers.authorization || "");
  const conBearer = auth.startsWith("Bearer ") && auth.slice(7).trim() !== "";
  if (!conCookies || conBearer) return next();
  if (EXENTAS.has(req.path.replace(/\/+$/, "").toLowerCase())) return next();
  if (req.headers[CABECERA] === VALOR) return next();

  return res.status(403).json({ message: "Recargá la página y volvé a intentar", code: "CSRF" });
};

module.exports = { protegerCsrf };
