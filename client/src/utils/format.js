/**
 * Formato de números y fechas en es-AR, compartido.
 *
 * Estaba repetido tal cual (mismo `Intl.NumberFormat`, mismo truco de
 * `Date.UTC` para no perder un día por el huso horario) en PromoStats,
 * PromoReportPage y AdminPromotionsPage — los tres arman informes de
 * campañas y necesitan exactamente lo mismo. Un solo lugar evita que una
 * corrección (por ejemplo, un cambio de formato) quede aplicada en dos de
 * los tres y olvidada en el tercero.
 */

export const NUM = new Intl.NumberFormat("es-AR");

/** El número con su unidad en el número correcto: "1 impresión", no "1 impresiones". */
export const cantidad = (n, singular, plural) =>
  `${NUM.format(n || 0)} ${(n || 0) === 1 ? singular : plural}`;

/**
 * "YYYY-MM-DD" a "12 ago".
 *
 * `timeZone: "UTC"` porque el día se arma con `Date.UTC`: sin eso el
 * navegador lo pasa a hora local y en Argentina (UTC-3) devuelve el día
 * anterior — un informe corrido un día no se puede comparar contra nada.
 */
export const diaCorto = (valor) => {
  const [a, m, d] = String(valor).split("-").map(Number);
  if (!a || !m || !d) return valor;
  return new Date(Date.UTC(a, m - 1, d)).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
};
