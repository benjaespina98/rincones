import { useEffect, useRef } from "react";
import { trackPromoImpression } from "../services/promotionsApi";

/**
 * Medir una tarjeta del panel, esté donde esté en la pantalla.
 *
 * ── POR QUÉ ESTO EXISTE ─────────────────────────────────────────────────────
 * La medición vivía adentro de `PromoCarousel`: el carrusel sabía cuál era la
 * tarjeta activa, la observaba y contaba. Al repartir el contenido en tres
 * secciones —vinotecas arriba, evento destacado abajo, el resto en el feed— ese
 * carrusel deja de existir, y con él se iba la única implementación del conteo.
 *
 * Perder eso no es perder una métrica: es perder el respaldo de lo que se le
 * factura a alguien. Así que la medición se movió al lugar correcto, que es la
 * tarjeta individual.
 *
 * ── QUÉ CUENTA COMO IMPRESIÓN ───────────────────────────────────────────────
 * Una tarjeta que existe en el DOM no es una tarjeta que alguien vio. Se cuenta
 * cuando estuvo AL MENOS A LA MITAD A LA VISTA DURANTE UN SEGUNDO seguido, que
 * es el criterio de la industria, y UNA SOLA VEZ por visita. Pasar de largo
 * scrolleando no cuenta: el temporizador se cancela al salir de pantalla.
 *
 * El registro de lo ya visto es de módulo y no de componente, a propósito: la
 * misma campaña puede aparecer en dos secciones (una vinoteca patrocinada que
 * también es evento del mes), y contarla dos veces en la misma visita es
 * exactamente el error que infla los números que después alguien audita.
 */

/** Cuánto tiene que estar a la vista para que cuente. */
const MS_PARA_CONTAR = 1000;

/** Qué proporción de la tarjeta tiene que verse. */
const VISIBLE = 0.5;

/**
 * Lo ya contado en esta visita. Vive fuera de React porque la pregunta no es
 * "¿este componente ya contó?" sino "¿esta campaña ya se contó en esta visita?",
 * y las tarjetas se montan y desmontan al navegar entre pestañas.
 */
const yaContadas = new Set();

/** Para los tests y para cuando haga falta empezar de cero. */
export const resetImpressions = () => yaContadas.clear();

/**
 * Devuelve un ref para colgar de la tarjeta. Sin `id` no hace nada, así que se
 * puede llamar igual para contenido curado (que no se mide).
 */
export function useImpressionRef(id) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!id || !el || yaContadas.has(id)) return undefined;

    // Sin IntersectionObserver (navegador viejo) se cuenta al montar: perder
    // TODAS las impresiones es peor que contar alguna que quedó bajo el borde
    // de la pantalla.
    if (typeof IntersectionObserver === "undefined") {
      yaContadas.add(id);
      trackPromoImpression(id);
      return undefined;
    }

    let timer;
    const observer = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting) {
          timer = setTimeout(() => {
            yaContadas.add(id);
            trackPromoImpression(id);
            observer.disconnect();
          }, MS_PARA_CONTAR);
        } else {
          clearTimeout(timer);
        }
      },
      { threshold: VISIBLE }
    );

    observer.observe(el);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [id]);

  return ref;
}
