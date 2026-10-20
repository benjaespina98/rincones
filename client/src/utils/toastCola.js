/**
 * La cola de avisos con tope.
 *
 * Sin tope, una ráfaga de errores (o de acciones seguidas) apilaba avisos hasta tapar el
 * encabezado de la pantalla. Se muestran hasta `max`; al llegar uno nuevo se descarta el más
 * viejo, PERO nunca uno que traiga una acción ("Deshacer"): ese es el que la persona necesita
 * poder tocar dentro de su ventana de tiempo. Si todos traen acción, se descarta el más viejo igual
 * (el tope manda).
 */
export const MAX_AVISOS = 3;

export const agregarConTope = (cola, nuevo, max = MAX_AVISOS) => {
  const siguiente = [...cola, nuevo];
  while (siguiente.length > max) {
    const i = siguiente.findIndex((t, idx) => idx < siguiente.length - 1 && !t.action);
    siguiente.splice(i === -1 ? 0 : i, 1);
  }
  return siguiente;
};
