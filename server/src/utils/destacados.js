const { esImagenAceptada } = require("./imagenAceptada");

/**
 * Los candidatos ya rankeados, con los que tienen foto primero y el resto después, hasta
 * `cantidad`. Mantiene el orden del ranking dentro de cada grupo (afinidad), y NUNCA deja la lista
 * vacía mientras haya candidatos: sin foto se recomienda igual, con la botella genérica.
 *
 * La tarjeta grande de Descubrí luce mucho más con foto real, por eso se prioriza; pero que una
 * foto falte no puede dejar a la persona sin recomendación. A medida que la gente cargue vinos con
 * su foto (el pool compartido y el catálogo comunitario), cada vez habrá más con qué llenar el
 * lugar de las que tienen.
 *
 * "Foto válida" es la misma regla con la que el server acepta una imagen en todos lados
 * (`esImagenAceptada`): https o data:image en base64, sin comillas ni paréntesis que rompan un
 * `url()` de CSS.
 */
const separarPorFoto = (candidatos) => {
  const lista = (Array.isArray(candidatos) ? candidatos : []).filter(Boolean);
  return {
    con: lista.filter((wine) => esImagenAceptada(wine.image)),
    sin: lista.filter((wine) => !esImagenAceptada(wine.image)),
  };
};

const conFotoPrimero = (candidatos, cantidad) => {
  const { con, sin } = separarPorFoto(candidatos);
  return [...con, ...sin].slice(0, cantidad);
};

module.exports = { conFotoPrimero, separarPorFoto };
