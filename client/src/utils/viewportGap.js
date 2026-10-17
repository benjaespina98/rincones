/**
 * Cuánto más corto es el viewport de layout que la pantalla, en una PWA de iOS.
 *
 * ── EL PROBLEMA ──────────────────────────────────────────────────────────────
 * Al abrir una PWA desde el ícono, iOS ancla lo `position: fixed` a un viewport
 * unos 58–60px más corto que la pantalla (más o menos la altura de la zona de la
 * isla): la barra de abajo queda flotando arriba de una franja vacía. Un scroll
 * del documento lo recalcula y la barra baja sola; por eso se veía "arreglado"
 * después de tocar la pantalla.
 *
 * ── POR QUÉ UNA FUNCIÓN APARTE ───────────────────────────────────────────────
 * Es la decisión que no puede equivocarse: restarle a una barra un hueco que no
 * existe la saca de la pantalla. Por eso es pura y está testeada, y es
 * conservadora:
 *   · sólo iOS en modo app (`navigator.standalone`). En Android la diferencia
 *     entre `screen.height` y `innerHeight` es la barra del sistema, que NO es un
 *     hueco, y compensarla sacaría la barra de la pantalla;
 *   · sólo un hueco chico y positivo (hasta 100px). Más que eso no es este bug.
 */
export const HUECO_MAXIMO = 100;

export const calcularHueco = ({ iosStandalone, pantallaAlto, ventanaAlto }) => {
  if (!iosStandalone) return 0;
  const pantalla = Number(pantallaAlto);
  const ventana = Number(ventanaAlto);
  if (!Number.isFinite(pantalla) || !Number.isFinite(ventana)) return 0;
  const hueco = pantalla - ventana;
  if (hueco <= 0 || hueco > HUECO_MAXIMO) return 0;
  return Math.round(hueco);
};
