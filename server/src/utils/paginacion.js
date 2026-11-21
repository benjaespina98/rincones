/**
 * `page` y `limit` de una query string, siempre válidos.
 *
 * `Number("abc")` es NaN y `page=0` da `skip` negativo: ambos llegaban a Mongo y volvían como un
 * 500. Acá cualquier valor raro (texto, cero, negativo, decimal, vacío) cae al valor por defecto
 * o se acota, y el pedido sigue en vez de romperse.
 */
const MAX_PAGINA = 100000;

const entero = (valor, porDefecto) => {
  const n = Math.floor(Number(valor));
  return Number.isFinite(n) && n >= 1 ? n : porDefecto;
};

const leerPaginacion = (query = {}, { porDefecto = 20, maximo = 100 } = {}) => {
  const page = Math.min(entero(query.page, 1), MAX_PAGINA);
  const limit = Math.min(entero(query.limit, porDefecto), maximo);
  return { page, limit, skip: (page - 1) * limit };
};

module.exports = { leerPaginacion, MAX_PAGINA };
