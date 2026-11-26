/**
 * Lo que de cada turno de la charla viaja al server como contexto.
 *
 * Además del texto van los vinos de las tarjetas que acompañaron la respuesta (los tuyos primero, si no
 * las sugerencias de afuera): «¿cómo lo tomo?» se refiere a ellos y el texto a veces no los nombra.
 * Sólo nombre, bodega, uva y tipo: lo justo para que el modelo sepa de qué se habla.
 */
const TOPE = 3;

export const vinosMostrados = (mensaje) => {
  const lista = mensaje?.wines?.length ? mensaje.wines : mensaje?.descubrir || [];
  return lista
    .filter((v) => v?.name)
    .slice(0, TOPE)
    .map(({ name, winery, varietal, type }) => ({ name, winery, varietal, type }));
};

/** El turno tal como se manda: sin campos de más, y `wines` sólo si hay. */
export const turnoParaServidor = ({ role, text, wines }) => {
  const vinos = role === "assistant" ? vinosMostrados({ wines }) : [];
  return vinos.length ? { role, text, wines: vinos } : { role, text };
};
