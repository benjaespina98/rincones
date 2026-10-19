/**
 * Una lista de strings que viene del cliente, acotada: cada ítem recortado y con largo máximo, sin
 * vacíos y con un máximo de ítems. Lo que se guarda vuelve después adentro de los prompts del
 * Sommelier, así que no puede crecer sin límite.
 */
const acotarLista = (valor, { largo = 40, items = 10 } = {}) =>
  (Array.isArray(valor) ? valor : [])
    .map((v) => String(v ?? "").trim().slice(0, largo).trim())
    .filter(Boolean)
    .slice(0, items);

module.exports = { acotarLista };
