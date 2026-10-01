/**
 * Registrar el service worker.
 *
 * ── SÓLO EN PRODUCCIÓN ──────────────────────────────────────────────────────
 * En desarrollo un SW es un estorbo: intercepta los pedidos de Vite, pelea con
 * el hot reload y hace que un cambio en el código no se vea hasta recargar dos
 * veces. Peor todavía, un SW registrado en `localhost` sobrevive al servidor
 * que lo instaló y sigue contestando con archivos de la sesión anterior.
 *
 * ── Y SE DESREGISTRA SOLO SI ALGUIEN LO TIENE DE ANTES ──────────────────────
 * No alcanza con "no registrarlo en dev": quien ya lo tenga instalado lo
 * conserva. Por eso en desarrollo se busca activamente y se da de baja, que es
 * también el botón de pánico si el SW de producción llegara a romper algo —
 * basta con publicar una versión que llame a `desregistrar()`.
 */

const SOPORTA = () => typeof navigator !== "undefined" && "serviceWorker" in navigator;

/** Da de baja cualquier service worker de este origen y borra sus cachés. */
export const desregistrar = async () => {
  if (!SOPORTA()) return;
  try {
    const registros = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registros.map((r) => r.unregister()));
    if (typeof caches !== "undefined") {
      const nombres = await caches.keys();
      await Promise.all(nombres.filter((n) => n.startsWith("rincones-")).map((n) => caches.delete(n)));
    }
  } catch {
    // Modo privado, permisos, lo que sea. No hay nada que hacer y no vale
    // romper el arranque de la app por esto.
  }
};

/**
 * @param {{produccion?: boolean}} opciones
 *   `produccion` entra por parámetro, con el valor real como default, para que
 *   los tests puedan probar los dos caminos sin depender de cómo el runner
 *   simula `import.meta.env` — que no es lo mismo que lo que hace Vite al
 *   compilar, y hacía que el test del caso "desarrollo" pasara por el camino
 *   equivocado sin avisar.
 */
export const registrarSW = ({ produccion = import.meta.env.PROD } = {}) => {
  if (!SOPORTA()) return;

  if (!produccion) {
    desregistrar();
    return;
  }

  /**
   * Después del `load` y no antes: registrar un SW dispara la descarga del
   * archivo y la instalación, y hacerlo mientras la app todavía está pintando
   * la primera pantalla le compite el ancho de banda a lo que la persona está
   * esperando ver.
   */
  window.addEventListener(
    "load",
    () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Que falle el registro no es un error de la app: sin SW anda igual,
        // sólo que sin caché offline.
      });
    },
    // Una sola vez. `load` dispara una vez por documento, así que dejar el
    // oyente puesto no cambia nada en la app — pero sí deja el `window` con un
    // suscriptor que nadie va a sacar, y en los tests, donde el `window` se
    // comparte, hacía que el registro de un caso se disparara en el siguiente.
    { once: true }
  );
};
