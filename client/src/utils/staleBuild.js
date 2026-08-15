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
 *
 * ── LA OTRA MITAD, QUE VIVE EN client/vercel.json ───────────────────────────
 *
 * Este archivo es la red de contención; el arreglo de fondo son tres reglas de
 * ahí, y se documentan acá porque `vercel.json` es JSON y no admite comentarios
 * (probado a la mala: unas claves `"//"` a modo de comentario hicieron que
 * Vercel rechazara el archivo entero por schema y el deploy del cliente fallara
 * en 0 ms, antes de compilar):
 *
 *   1. `/assets` queda FUERA del fallback del SPA. Sin eso, un chunk que ya no
 *      existe recibía `index.html` con status 200, y el navegador se quejaba del
 *      MIME en vez de dar un 404 — un error mucho más difícil de reconocer.
 *   2. `no-cache` en TODAS las navegaciones, no sólo en `/index.html`. Los
 *      headers se resuelven contra la ruta que entra, y esa ruta no la pide
 *      nadie: la PWA arranca en `/` y navega a `/login`, `/bodega`, etc.
 *   3. Los assets con hash siguen siendo `immutable` por un año: su nombre
 *      cambia con su contenido, así que nunca pueden quedar viejos.
 */

// A propósito nunca se borra dentro de la sesión: es lo único que garantiza que
// la recarga sea una. Vive en `sessionStorage`, así que la próxima vez que se
// abra la app arranca limpia y la recuperación vuelve a estar disponible.
const MARCA = "rincones_recarga_por_version";

/**
 * Cuándo falló el último chunk, en milisegundos.
 *
 * ── POR QUÉ NO ALCANZA CON MIRAR EL MENSAJE DEL ERROR ───────────────────────
 *
 * Porque el error que llega a React NO es el del chunk. Verificado corriendo un
 * build de producción con un chunk borrado: Vite atrapa el preload fallido,
 * emite `vite:preloadError`, y el `import()` termina resolviendo a `undefined`.
 * Entonces `React.lazy` hace `modulo.default` sobre eso y lo que explota es:
 *
 *     TypeError: Cannot read properties of undefined (reading 'default')
 *
 * Un mensaje que no dice absolutamente nada de chunks ni de módulos, y que es
 * indistinguible de cualquier bug común. Reconocerlo por texto es imposible sin
 * atrapar de paso errores reales, que es lo último que queremos: taparíamos bugs
 * detrás de una recarga.
 *
 * La salida es no adivinar. Vite YA nos avisó cuál fue la causa; lo único que
 * faltaba era acordarse un momento. Si hace menos de unos segundos falló un
 * chunk, el error que está subiendo por el árbol es su consecuencia.
 */
let ultimoFalloDeChunk = 0;

/**
 * Cuánto vale ese recuerdo. Cinco segundos: el TypeError de `React.lazy` llega
 * en el mismo tick o en el siguiente, así que sobra; y es lo bastante corto como
 * para que un bug de verdad, diez segundos después, no herede la excusa.
 */
const VENTANA_MS = 5000;

/** Deja constancia de que un chunk no bajó, para poder explicar lo que venga. */
const anotarFalloDeChunk = () => {
  ultimoFalloDeChunk = Date.now();
};

const mensajeDeChunkCaido = (error) => {
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
 * ¿Este error es un chunk que no se pudo bajar?
 *
 * Dos caminos, y hacen falta los dos: el mensaje —cuando el error ES el del
 * import, con las tres redacciones que usan Chrome, Safari y Firefox— y el
 * recuerdo de arriba, para el caso en que lo que llega es el daño colateral.
 */
export const esErrorDeBuildViejo = (error) => {
  if (mensajeDeChunkCaido(error)) return true;
  return ultimoFalloDeChunk > 0 && Date.now() - ultimoFalloDeChunk < VENTANA_MS;
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
    // Se anota SIEMPRE, aunque la recarga no se dispare (ya se gastó, o no hay
    // sessionStorage): es lo que después le permite al ErrorBoundary explicar
    // el TypeError que React va a tirar un tick más tarde.
    anotarFalloDeChunk();
    recuperarDeBuildViejo();
  };

  const alQuedarSinAtender = (evento) => {
    if (!mensajeDeChunkCaido(evento?.reason)) return;
    anotarFalloDeChunk();
    recuperarDeBuildViejo();
  };

  window.addEventListener("vite:preloadError", alFallarElPreload);
  window.addEventListener("unhandledrejection", alQuedarSinAtender);

  return () => {
    window.removeEventListener("vite:preloadError", alFallarElPreload);
    window.removeEventListener("unhandledrejection", alQuedarSinAtender);
  };
};
