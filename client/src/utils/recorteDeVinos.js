/**
 * Cuántos vinos se muestran de entrada en una respuesta. Antes salían todos los que traía el
 * modelo (10 tarjetas para "¿qué tomo con un asado?") y la conversación quedaba tapada por
 * listas. Tres alcanzan para decidir; el resto está a un toque ("Ver N más"). De tu bodega
 * va primero —es lo que tenés a mano— y deja lugar a una sugerencia nueva si la hay.
 */
export const VINOS_VISIBLES = 3;
export const recorteDeVinos = (m, todos) => {
  const bodega = m.wines || [];
  const nuevos = m.descubrir || [];
  if (todos) return { bodega, nuevos, ocultos: 0 };
  const nB = Math.min(bodega.length, nuevos.length ? VINOS_VISIBLES - 1 : VINOS_VISIBLES);
  const nD = Math.min(nuevos.length, VINOS_VISIBLES - nB);
  return {
    bodega: bodega.slice(0, nB),
    nuevos: nuevos.slice(0, nD),
    ocultos: bodega.length + nuevos.length - nB - nD,
  };
};
