/**
 * Lo que la lista le dice a la persona sobre un vino que ya tomó.
 *
 * El servidor ya llevaba la cuenta (`consumptionCount` y `lastConsumedAt`: una
 * por cada vez que abrís botellas), pero ninguna pantalla la mostraba. El
 * resultado, reportado: tenías un vino tomado, sumabas una botella, abrías esa
 * botella, y la fila quedaba EXACTAMENTE igual que antes. Para el usuario no
 * había pasado nada, aunque el historial sí había avanzado.
 *
 * Esto es sólo texto, sin tocar datos: dos hechos independientes (cuántas veces
 * lo tomaste, cuántas botellas te quedan) dichos con las palabras de la acción
 * que los cambia.
 */

const DIA_MS = 24 * 60 * 60 * 1000;

/** "hoy", "ayer", "hace 3 días", "hace 2 meses", "hace 1 año". */
export const haceCuanto = (valor, ahora = new Date()) => {
  if (!valor) return "";
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return "";

  const dias = Math.floor((ahora.getTime() - fecha.getTime()) / DIA_MS);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  if (meses < 12) return `hace ${meses} ${meses === 1 ? "mes" : "meses"}`;
  const años = Math.floor(dias / 365);
  return `hace ${años} ${años === 1 ? "año" : "años"}`;
};

/** Cuántas veces lo tomaste (cada apertura cuenta una, abra las botellas que abra). */
export const vecesTomado = (wine) => {
  const n = Number(wine?.consumptionCount);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

/** "Tomado 2 veces · hoy". Vacío si el vino no está marcado como tomado. */
export const resumenTomado = (wine, ahora = new Date()) => {
  if (!wine?.tasted) return "";
  const n = vecesTomado(wine);
  const veces = n >= 2 ? `Tomado ${n} veces` : "Tomado";
  const cuando = haceCuanto(wine.lastConsumedAt, ahora);
  return cuando ? `${veces} · ${cuando}` : veces;
};

/** Qué hace cada botón de la fila, según el stock que hay. */
export const pistaDeStock = (wine) => {
  const q = Number(wine?.quantity) || 0;
  if (q <= 0) return "Sin botellas · con + sumás una al stock";
  const botellas = q === 1 ? "1 botella" : `${q} botellas`;
  return `${botellas} en tu bodega · con − abrís una`;
};
