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
// `fotoDiferida`: la foto existe pero todavía no se trajo (ver communityWines.conFoto).
const tieneFoto = (wine) => wine.fotoDiferida === true || esImagenAceptada(wine.image);

const separarPorFoto = (candidatos) => {
  const lista = (Array.isArray(candidatos) ? candidatos : []).filter(Boolean);
  return {
    con: lista.filter(tieneFoto),
    sin: lista.filter((wine) => !tieneFoto(wine)),
  };
};

const conFotoPrimero = (candidatos, cantidad) => {
  const { con, sin } = separarPorFoto(candidatos);
  return [...con, ...sin].slice(0, cantidad);
};

/**
 * El universo del que se ELIGEN los destacados: sólo los vinos con foto si hay suficientes para
 * llenar `cantidad`; si no alcanzan, el universo completo (y después `conFotoPrimero` pone las
 * fotos adelante). Antes la foto era sólo un empujón en el puntaje, y un vino sin foto con muy
 * buena afinidad desplazaba a uno con foto: la tarjeta de Descubrí mostraba la botella genérica
 * aunque hubiera con qué llenarla de vinos reales.
 *
 * `tieneFoto` lo decide quien llama (puede saber de fotos del pool que el vino aún no trae).
 */
const universoConFoto = (universo, tieneFotoFn, cantidad, { puntaje = null, reservados = 2 } = {}) => {
  const lista = Array.isArray(universo) ? universo : [];
  const con = lista.filter((w) => tieneFotoFn(w));
  if (con.length < cantidad) return lista;
  if (typeof puntaje !== "function" || reservados <= 0) return con;
  // Los pocos sin foto que más le gustan a ESTA persona siguen compitiendo: la foto manda, pero no
  // se pierde del todo lo que más le va (su uva favorita sin foto no puede desaparecer de Descubrí).
  const mejores = lista
    .filter((w) => !tieneFotoFn(w))
    .map((w) => ({ w, p: Number(puntaje(w)) || 0 }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p)
    .slice(0, reservados)
    .map((x) => x.w);
  return [...con, ...mejores];
};

module.exports = { conFotoPrimero, separarPorFoto, universoConFoto };
