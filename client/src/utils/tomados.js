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

import { nuncaEstuvoEnTuCava } from "./cellarTime";

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
  // A los 360 días ya no son «11 meses», pero todavía no son 365: sin el piso daba «hace 0 años».
  const años = Math.max(1, Math.floor(dias / 365));
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
  // Lo que cargaste ya tomado no tiene fecha de la copa, sólo la de la carga: no se afirma "hoy".
  const sinFecha = n < 2 && wine.quantity === 0 && nuncaEstuvoEnTuCava(wine);
  const cuando = sinFecha ? "" : haceCuanto(wine.lastConsumedAt, ahora);
  return cuando ? `${veces} · ${cuando}` : veces;
};

/** Qué hace cada botón de la fila, según el stock que hay. */
export const pistaDeStock = (wine) => {
  const q = Number(wine?.quantity) || 0;
  if (q <= 0) return "Sin botellas · tocá + para sumar una al stock";
  const botellas = q === 1 ? "1 botella" : `${q} botellas`;
  return `${botellas} en tu bodega · tocá − para abrir una`;
};

/**
 * ¿Sacar este vino de «Ya tomados» pide confirmación? Sí cuando lo abriste de
 * verdad (hay al menos una apertura registrada). Uno marcado a mano, sin
 * aperturas, se desmarca directo: no hay historial que perder.
 */
export const requiereConfirmarSacar = (wine) => wine?.tasted === true && vecesTomado(wine) >= 1;

export const mensajeConfirmarSacar = (wine) => {
  const n = vecesTomado(wine);
  const veces = n === 1 ? "1 vez" : `${n} veces`;
  return `Lo abriste ${veces}. Si lo sacás, deja de figurar entre los tomados; las botellas de tu bodega no cambian. Podés deshacerlo por unos segundos.`;
};

/**
 * Dónde queda un vino cuando se queda sin botellas. Nada se borra: pasa a la pestaña que le corresponde, y hay
 * que decirlo, porque desde la pantalla un vino que sale de «En stock» y no aparece en ningún lado se confunde
 * con uno eliminado.
 */
export const dondeQueda = (wine) => {
  if (wine?.tasted === true) return "Ya tomados";
  if (wine?.favorite === true) return "Favoritos";
  return "Sin stock";
};

export const mensajeSinBotellas = (wine, nombre) => `Sin botellas: ${nombre} sigue guardado en «${dondeQueda(wine)}»`;

/** Aviso al sumar stock. Si ya estaba tomado, aclara que SIGUE entre los tomados. */
export const mensajeSumar = (wine, cantidad, nombre) => {
  const sumadas = cantidad === 1 ? "1 botella sumada al stock" : `${cantidad} botellas sumadas al stock`;
  return `${sumadas} · ${nombre}${wine?.tasted ? " · sigue entre los ya tomados" : ""}`;
};

/** Aviso al abrir botellas. Cada apertura cuenta una vez más: desde la segunda se dice. */
export const mensajeAbrir = ({ cantidad, quedan, veces, nombre }) => {
  const abiertas = cantidad === 1 ? "Botella abierta" : `${cantidad} botellas abiertas`;
  const tomado = veces >= 2 ? ` · lo tomaste ${veces} veces` : "";
  if (quedan === 0) return `Se terminó tu ${nombre}${tomado} · sigue en «Ya tomados»`;
  return `${abiertas} · te ${quedan === 1 ? "queda 1" : `quedan ${quedan}`}${tomado}`;
};
