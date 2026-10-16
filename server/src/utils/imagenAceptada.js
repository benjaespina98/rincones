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
 * Además se rechaza lo que rompe una URL de CSS o un atributo (comillas, paréntesis,
 * barra invertida, `<` `>` y espacios): el cliente la usa en `url("...")`, y una
 * cadena con `"` o `)` podría cerrar el literal e inyectar otra declaración.
 *
 * No valida el HOST: la mayoría de las fotos termina re-alojada en Cloudinary
 * (ver imageStorage.service), y una lista de hosts permitidos rompería los
 * catálogos de terceros que ya funcionan. Esto es un piso, no un perímetro.
 */
const PATRON = /^(?:data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=_-]+|https:\/\/[^\s"'()<>\\/][^\s"'()<>\\]*)$/i;

const esImagenAceptada = (valor) => typeof valor === "string" && PATRON.test(valor.trim());

module.exports = { esImagenAceptada };
