/**
 * Una misma operación sobre cada id, de a uno y en orden (el servidor no tiene un endpoint de lote
 * para esto). Si una falla sigue con las demás. Devuelve quiénes salieron bien y quiénes no, para
 * decir la verdad ("3 de 5") y para dejar elegidos sólo los que faltan.
 */
export const recorrerDeUno = async (ids, operacion) => {
  const exitosos = [];
  const fallidos = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    try {
      await operacion(id);
      exitosos.push(id);
    } catch {
      fallidos.push(id);
    }
  }
  return { ok: exitosos.length, total: exitosos.length + fallidos.length, exitosos, fallidos };
};
