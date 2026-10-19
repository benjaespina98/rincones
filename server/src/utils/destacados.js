const { esImagenAceptada } = require("./imagenAceptada");

/**
 * De los candidatos ya rankeados, sólo los que tienen una foto válida, en el mismo orden, hasta
 * `cantidad`.
 *
 * La tarjeta grande de Descubrí es casi toda imagen: sin foto muestra la botella genérica, igual
 * para todos los vinos, y eso no es una recomendación. Antes sólo se ORDENABA con foto primero y
 * se completaba con el resto; ahora es un filtro, y si no hay ninguno con foto la respuesta es
 * una lista vacía (la pantalla lo dice y ofrece sumar una foto).
 *
 * "Foto válida" es la misma regla con la que el server acepta una imagen en todos lados
 * (`esImagenAceptada`): https o data:image en base64, sin comillas ni paréntesis que rompan un
 * `url()` de CSS. Una cadena vacía, en blanco, o con otro esquema no cuenta.
 */
const soloConFoto = (candidatos, cantidad) =>
  (Array.isArray(candidatos) ? candidatos : [])
    .filter((wine) => esImagenAceptada(wine?.image))
    .slice(0, cantidad);

module.exports = { soloConFoto };
