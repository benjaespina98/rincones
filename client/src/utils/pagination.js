/**
 * Qué números de página mostrar en un paginador.
 *
 * Siempre la primera, la última y una ventana alrededor de la actual. Los
 * huecos se marcan con `null`, que el render dibuja como "…". Nunca más de
 * siete botones: el registro de actividad puede tener cientos de páginas, y
 * una tira de trescientos números no es navegación, es otro problema.
 *
 * Vive en `utils` y no junto al componente porque es la única parte con lógica
 * —y por lo tanto la única que se puede probar sola.
 */
export const paginas = (actual, total, ventana = 1) => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const mostrar = new Set([1, total]);
  for (let p = actual - ventana; p <= actual + ventana; p += 1) {
    if (p >= 1 && p <= total) mostrar.add(p);
  }

  const ordenadas = [...mostrar].sort((a, b) => a - b);
  const salida = [];
  ordenadas.forEach((p, i) => {
    // Un hueco de UNA sola página no se marca con "…": el puntito ocupa lo
    // mismo que el número que estaría escondiendo, y encima lo esconde.
    if (i > 0 && p - ordenadas[i - 1] > 1) salida.push(null);
    salida.push(p);
  });
  return salida;
};
