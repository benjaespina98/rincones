/**
 * «Esta noche»: las ocasiones que se le pueden pedir a tu bodega.
 *
 * Cada una es un pedido que el server ya sabe resolver (`POST /wines/suggest`, ver
 * `suggestWines` y `scoreWine` en wines.service.js): `mood` ordena por ganas y `food`
 * descarta lo que no va con el plato. Acá sólo se nombran, en el vocabulario de la
 * persona, y se decide qué decir cuando no hay nada.
 *
 * Son pocas a propósito: una fila que entra sin scrollear. Más opciones es más
 * decisión antes de contestar una sola pregunta (el mismo motivo por el que el eje
 * de ganas salió del Sommelier).
 */
export const OCASIONES = [
  { id: "liviano", label: "Algo liviano", pedido: { mood: "liviano" } },
  { id: "cuerpo", label: "Con cuerpo", pedido: { mood: "cuerpo" } },
  { id: "brindar", label: "Para brindar", pedido: { mood: "festivo" } },
  { id: "asado", label: "Asado", pedido: { food: "asado" } },
  { id: "pasta", label: "Pasta", pedido: { food: "pasta" } },
  { id: "pizza", label: "Pizza", pedido: { food: "pizza" } },
  { id: "pescado", label: "Pescado", pedido: { food: "pescado" } },
  { id: "picada", label: "Picada", pedido: { food: "picada" } },
];

/** Qué decir cuando la bodega no tiene nada para esa ocasión. */
export function sinResultado(ocasion) {
  if (!ocasion) return "";
  if (ocasion.pedido.food) return `No tenés botellas que vayan con ${ocasion.label.toLowerCase()}.`;
  return "No tenés botellas para eso ahora.";
}

/**
 * El motivo de una sugerencia, dicho en una línea. El server sólo habla cuando
 * distingue a un vino de otro (puntaje, favorito, «está en su punto»); si no hay
 * nada propio que decir, se nombra la ocasión elegida, que es lo que la persona pidió.
 */
export function motivoDe(vino, ocasion) {
  const propio = String(vino?.matchReason || "").trim();
  if (propio) return propio;
  if (!ocasion) return "";
  return ocasion.pedido.food ? `Va con ${ocasion.label.toLowerCase()}` : ocasion.label;
}
