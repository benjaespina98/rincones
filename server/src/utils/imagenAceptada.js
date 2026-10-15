/**
 * ¿Esta cadena puede ser la foto de un vino que viene de afuera?
 *
 * Acepta sólo dos formas:
 *   · `data:image/...` — una foto subida desde el teléfono;
 *   · `https://...`    — una URL remota con TLS.
 *
 * `http://` plano queda afuera a propósito: el sitio se sirve por HTTPS, así que
 * el navegador bloquea esa imagen por contenido mixto y no se vería igual, y de
 * paso evita guardar una URL de un tercero sin cifrar que haría una petición
 * (con la IP y el referer de quien abra el vino) a un servidor ajeno.
 *
 * No valida el HOST: la mayoría de las fotos termina re-alojada en Cloudinary
 * (ver imageStorage.service), y una lista de hosts permitidos rompería los
 * catálogos de terceros que ya funcionan. Esto es un piso, no un perímetro.
 */
const esImagenAceptada = (valor) =>
  typeof valor === "string" && /^(data:image\/|https:\/\/[^\s/])/i.test(valor.trim());

module.exports = { esImagenAceptada };
