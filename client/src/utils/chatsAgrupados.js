/**
 * Agrupa las conversaciones por cuándo se usaron por última vez: "Hoy", "Ayer",
 * "Últimos 7 días", "Últimos 30 días" y "Más antiguas". Es como las agrupa
 * cualquier app de chat, y por la misma razón: se busca "la de ayer", no "la del
 * 14/09".
 *
 * Respeta el orden en que llegan —el servidor ya las manda de la más reciente a
 * la más vieja— y no inventa grupos vacíos. Las fechas se comparan por DÍA
 * calendario y no por horas transcurridas: una charla de anoche a las 23:50 es
 * "Ayer" a las 00:10, aunque hayan pasado veinte minutos.
 */
const DIA = 24 * 60 * 60 * 1000;

const aMedianoche = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export const grupoDe = (iso, ahora = new Date()) => {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "Más antiguas";
  const dias = Math.round((aMedianoche(ahora) - aMedianoche(fecha)) / DIA);

  if (dias <= 0) return "Hoy";
  if (dias === 1) return "Ayer";
  if (dias <= 7) return "Últimos 7 días";
  if (dias <= 30) return "Últimos 30 días";
  return "Más antiguas";
};

export const agruparPorFecha = (conversaciones = [], ahora = new Date()) => {
  const grupos = [];
  for (const c of conversaciones) {
    const titulo = grupoDe(c.updatedAt, ahora);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.titulo === titulo) ultimo.items.push(c);
    else grupos.push({ titulo, items: [c] });
  }
  return grupos;
};
