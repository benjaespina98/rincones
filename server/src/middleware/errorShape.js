/**
 * Una sola forma para los errores de la API.
 *
 * Las respuestas de error venían en dos formas: `{ message }` (la mayoría, y el manejador final) y `{ error }`
 * (promociones, vinos, `fail()`). Cada pantalla del cliente tenía que adivinar dónde estaba el texto, y la que
 * adivinaba mal mostraba el mensaje genérico en vez del que el server había escrito para esa persona.
 *
 * En vez de tocar los ~100 lugares que responden, esto envuelve `res.json`: toda respuesta 4xx/5xx sale con
 * `success: false` y con el texto en `message` Y en `error` (el mismo). Los lectores viejos siguen andando y los
 * nuevos leen sólo `message`.
 */
const normalizarError = (status, body) => {
  if (status < 400 || !body || typeof body !== "object" || Array.isArray(body)) return body;
  const salida = { ...body };
  if (typeof salida.message !== "string" && typeof salida.error === "string") salida.message = salida.error;
  if (typeof salida.error !== "string" && typeof salida.message === "string") salida.error = salida.message;
  if (salida.success === undefined) salida.success = false;
  return salida;
};

const errorShape = (req, res, next) => {
  const json = res.json.bind(res);
  res.json = (body) => json(normalizarError(res.statusCode, body));
  next();
};

module.exports = { errorShape, normalizarError };
