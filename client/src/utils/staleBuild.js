/**
 * ── "EN LA PWA NO PUEDO ENTRAR, Y SI LA REINSTALO ANDA" ─────────────────────
 *
 * No era el service worker: Rincones no tiene ninguno. Era el shell viejo.
 *
 * Todas las pantallas se cargan con `lazy()` (ver App.jsx), así que el
 * `index.html` que tenés abierto no trae el código de las pantallas: trae las
 * URLs de sus chunks, con el hash del build que lo generó. Cuando publicamos una
 * versión nueva, esos archivos dejan de existir — el build siguiente les pone
 * otro hash—. Y como el `index.html` del arranque se sirve desde el caché HTTP
 * del navegador, la app instalada podía seguir pidiendo, durante días, chunks de
 * un build que ya no está.
 *
 * Ahí se rompía. La PWA arranca en `/` con el shell viejo, React monta, la ruta
 * pide `/assets/LoginPage-<hash-viejo>.js` y el server contesta 404 — o peor, el
 * `index.html` entero, porque el fallback del SPA devolvía HTML para cualquier
 * ruta. En los dos casos el import falla, `lazy()` tira, y como la pantalla que
 * no cargaba era justamente la de entrar, el síntoma era "el login no funciona".
 *
 * Reinstalar lo arreglaba porque tiraba el caché HTTP y el shell volvía a
 * bajarse. Es el único motivo, y no es una solución que se le pueda pedir a
 * nadie.
 *
 * ── LA SALIDA ───────────────────────────────────────────────────────────────
 *
 * Un chunk que no baja no es un error de la app: es la app avisando que el
 * documento que la cargó quedó viejo. La respuesta correcta es ir a buscar el
 * nuevo, y eso es una recarga — pero una recarga que no se puede repetir sola,
 * porque si el chunk falta por otra razón (sin red, un 500) recargar en loop
 * deja a la persona frente a una pantalla que parpadea para siempre.
 *
 * Por eso la recarga es UNA, marcada en `sessionStorage`. Si después de traer un
 * documento nuevo el chunk sigue sin bajar, entonces sí es un problema real y se
 * muestra el error, que es lo honesto.
 *
 * NO se toca nada del usuario: ni el token, ni las preferencias, ni las cookies.
 * La sesión sobrevive a la actualización porque no hay ninguna razón para que no
 * lo haga — lo único que estaba viejo era el HTML.
 */

// A propósito nunca se borra dentro de la sesión: es lo único que garantiza que
// la recarga sea una. Vive en `sessionStorage`, así que la próxima vez que se
// abra la app arranca limpia y la recuperación vuelve a estar disponible.
const MARCA = "rincones_recarga_por_version";

/**
 * ¿Este error es un chunk que no se pudo bajar?
 *
 * Se mira el mensaje porque no hay un tipo de error para esto: cada navegador lo
 * redacta a su manera y ninguno expone un código. Están las tres familias que se
 * ven en producción — Chrome/Android, Safari/iOS y Firefox—, más el caso en que
 * el server devolvió HTML en lugar del módulo (el fallback del SPA tragándose la
 * ruta del asset), que se reconoce por el reclamo de MIME.
 */
export const esErrorDeBuildViejo = (error) => {
  const texto = `${error?.message || ""} ${error?.name || ""}`.toLowerCase();
  if (!texto.trim()) return false;

  return (
    texto.includes("failed to fetch dynamically imported module") ||
    texto.includes("error loading dynamically imported module") ||
    texto.includes("importing a module script failed") ||
    texto.includes("dynamically imported module") ||
    texto.includes("chunkloaderror") ||
    // El asset no existe y el fallback del SPA devolvió `index.html`: el
    // navegador se queja del MIME, no del 404.
    (texto.includes("mime type") && texto.includes("module"))
  );
};

/**
 * Trae el documento nuevo, una sola vez por sesión.
 *
 * Devuelve `true` si la recarga quedó disparada (quien llama no tiene que
 * mostrar nada: la pantalla está por irse) y `false` si ya se intentó y no
 * alcanzó, que es cuando corresponde mostrar el error de verdad.
 */
export const recuperarDeBuildViejo = () => {
  if (typeof window === "undefined") return false;

  try {
    if (sessionStorage.getItem(MARCA)) return false;
    sessionStorage.setItem(MARCA, String(Date.now()));
  } catch {
    // Sin sessionStorage (modo privado) no hay forma de garantizar que la
    // recarga sea una sola, y una recarga en loop es peor que un error visible.
    return false;
  }

  // `reload()` revalida el documento principal, que con `no-cache` en el HTML
  // (ver client/vercel.json) baja el `index.html` del build actual y con él los
  // hashes nuevos.
  window.location.reload();
  return true;
};

/**
 * Engancha el aviso de Vite y el de la plataforma.
 *
 * Vite emite `vite:preloadError` cuando falla el preload de un chunk, que es
 * ANTES de que el error llegue a React. Atajarlo ahí es lo que evita que la
 * persona llegue a ver una pantalla rota: se recarga y vuelve con la versión
 * nueva. `unhandledrejection` cubre el resto — un import que falla fuera del
 * árbol de React no pasa por ningún ErrorBoundary—.
 *
 * Devuelve su limpieza, para que el doble montaje de StrictMode en desarrollo no
 * deje listeners duplicados.
 */
export const observarBuildViejo = () => {
  if (typeof window === "undefined") return () => {};

  const alFallarElPreload = (evento) => {
    evento.preventDefault();
    recuperarDeBuildViejo();
  };

  const alQuedarSinAtender = (evento) => {
    if (esErrorDeBuildViejo(evento?.reason)) recuperarDeBuildViejo();
  };

  window.addEventListener("vite:preloadError", alFallarElPreload);
  window.addEventListener("unhandledrejection", alQuedarSinAtender);

  return () => {
    window.removeEventListener("vite:preloadError", alFallarElPreload);
    window.removeEventListener("unhandledrejection", alQuedarSinAtender);
  };
};
