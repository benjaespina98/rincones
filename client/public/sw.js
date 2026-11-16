/**
 * El service worker de Rincones.
 *
 * ── LO QUE ESTE ARCHIVO TIENE PROHIBIDO HACER ───────────────────────────────
 * Esta app YA tuvo el desastre que causa un service worker mal escrito, y lo
 * tuvo sin tener ninguno: la PWA instalada arrancaba con un `index.html` viejo
 * guardado por el caché HTTP y pedía chunks de un build que ya no existía. La
 * pantalla que no cargaba era la de entrar, así que el síntoma era "en la PWA
 * no puedo hacer login" y la única salida conocida era desinstalar la app. De
 * ahí salió `utils/staleBuild.js`, que todavía está.
 *
 * Un service worker que cachee el HTML reproduce exactamente eso, pero peor:
 * el caché HTTP se limpia solo o se vence, el de un SW no — se queda hasta que
 * alguien escriba el código que lo borre. Así que:
 *
 *   **El HTML se pide SIEMPRE a la red primero.** El caché del documento es
 *   únicamente la red de abajo para cuando no hay internet, y nunca gana
 *   cuando la red contesta.
 *
 * ── QUÉ SE CACHEA, ENTONCES ─────────────────────────────────────────────────
 * Los assets con hash en el nombre (`/assets/index-D6PSXqCp.js`). Son
 * inmutables por construcción: si el contenido cambia, cambia el nombre. Ahí
 * cache-first no puede servir nada viejo, porque el HTML nuevo pide nombres
 * nuevos, y es donde está toda la ganancia — abrir la app sin esperar la red.
 *
 * ── LO QUE NO SE TOCA ───────────────────────────────────────────────────────
 * `/api`. Nada. Los datos de una bodega son personales y cambian: servir el
 * stock de ayer como si fuera el de hoy es peor que decir "no hay conexión".
 * Y un caché de respuestas autenticadas en un dispositivo compartido es una
 * forma de filtrar datos entre sesiones.
 */

/**
 * Subir este número es la única forma de invalidar todo.
 *
 * Va en el nombre del caché, y `activate` borra cualquier caché que no sea el
 * de la versión actual. Sin eso, un error acá se queda en los teléfonos para
 * siempre.
 */
/**
 * Dos cosas de infraestructura que este archivo necesita para funcionar, las
 * dos en `client/vercel.json` y las dos fáciles de romper sin querer:
 *
 *   1. El rewrite catch-all que manda todo a `index.html` excluye `sw.js`. Sin
 *      esa excepción, el navegador pide /sw.js y recibe HTML: el registro falla
 *      y nada de esto corre.
 *   2. `/sw.js` se sirve con `no-store`. Si el propio service worker se
 *      cachea, un error acá deja de ser corregible: la versión nueva no se
 *      descarga nunca porque la vieja está guardada.
 */
const VERSION = "v1";
const CACHE_ASSETS = `rincones-assets-${VERSION}`;
const CACHE_DOC = `rincones-doc-${VERSION}`;

/** Lo mínimo para que la app abra sin red. El resto se cachea al pedirse. */
const BASE = ["/", "/manifest.webmanifest", "/favicon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_DOC)
      .then((cache) => cache.addAll(BASE))
      // Si algo de la base no está (un rename, un deploy a medias), el SW se
      // instala igual: andar sin caché es mejor que no instalarse.
      .catch(() => undefined)
  );
  /**
   * `skipWaiting` SÍ, y es deliberado.
   *
   * Lo prudente suele ser esperar a que se cierren las pestañas viejas, para no
   * cambiarle el código a una app que está corriendo. Acá es al revés: el
   * problema histórico de esta app fue quedarse con código viejo, no con código
   * nuevo. Entre "una pestaña abierta ve el build nuevo antes de recargar" y
   * "la PWA se queda clavada en un build que ya no existe", el segundo es el
   * que dejó gente sin poder entrar.
   */
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nombres) =>
        Promise.all(
          nombres
            .filter((n) => n.startsWith("rincones-") && n !== CACHE_ASSETS && n !== CACHE_DOC)
            .map((n) => caches.delete(n))
        )
      )
      .then(() => self.clients.claim())
  );
});

/**
 * ¿Es un asset con hash en el nombre? Esos son inmutables.
 *
 * Vite nombra `nombre-HASH.ext` (guion), y la regla anterior exigía un PUNTO antes del hash: no
 * coincidía con ningún archivo real, así que el caché de inmutables nunca se usaba. Además suma las
 * imágenes (las fotos van en `src/assets` con hash).
 */
const esAssetConHash = (url) =>
  url.origin === self.location.origin &&
  /^\/assets\/.+[.-][a-zA-Z0-9_-]{8,}\.(js|css|woff2?|avif|webp|jpe?g|png)$/.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Sólo GET: un POST que se reintenta desde un caché duplicaría una compra,
  // una reseña o una botella abierta.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Otro origen (Google Fonts, Cloudinary, Sentry): que lo maneje el navegador.
  if (url.origin !== self.location.origin) return;

  /**
   * La API, ni tocarla. `return` sin `respondWith` deja pasar el pedido como si
   * este archivo no existiera, que es exactamente lo que se quiere.
   */
  if (url.pathname.startsWith("/api/")) return;

  // ── Assets inmutables: del caché, y si no están, de la red y se guardan.
  if (esAssetConHash(url)) {
    event.respondWith(
      caches.match(request).then(
        (cacheada) =>
          cacheada ||
          fetch(request).then((respuesta) => {
            // Sólo las respuestas completas y OK. Guardar un 404 o un 206 deja
            // el error pegado hasta la próxima versión del SW.
            if (respuesta.ok && respuesta.status === 200) {
              const copia = respuesta.clone();
              caches.open(CACHE_ASSETS).then((c) => c.put(request, copia));
            }
            return respuesta;
          })
      )
    );
    return;
  }

  /**
   * ── El documento: la red primero, SIEMPRE ────────────────────────────────
   * Es la regla que evita repetir el bug de los chunks que no existen. El
   * caché sólo contesta si la red falló de verdad — sin internet, en el subte —
   * y nunca porque sea más rápido.
   */
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((respuesta) => {
          if (respuesta.ok) {
            const copia = respuesta.clone();
            caches.open(CACHE_DOC).then((c) => c.put("/", copia));
          }
          return respuesta;
        })
        .catch(() => caches.match("/").then((c) => c || Response.error()))
    );
  }
});
