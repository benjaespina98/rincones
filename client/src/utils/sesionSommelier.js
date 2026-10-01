/**
 * La charla en curso con el Sommelier, guardada en `sessionStorage`.
 *
 * ── EL BUG QUE ESTO ARREGLA ─────────────────────────────────────────────────
 * Se guardaban los MENSAJES pero no a qué conversación del historial
 * pertenecen. Al salir de la pantalla y volver (o recargar) la charla se
 * restauraba entera y el id quedaba en `null`; la pregunta siguiente lo
 * interpretaba como "primera pregunta" y abría una conversación NUEVA en el
 * servidor, mientras en pantalla seguía el mismo hilo. Resultado: una sola
 * charla visible, dos entradas en el panel.
 *
 * Por eso mensajes e id se guardan juntos y se restauran juntos: son dos mitades
 * de lo mismo y separadas dejan de coincidir.
 *
 * ── COMPATIBILIDAD ──────────────────────────────────────────────────────────
 * Antes se guardaba un array de mensajes pelado. Esas sesiones, ya escritas en
 * navegadores abiertos, se siguen leyendo (sin id: la próxima pregunta abre una
 * conversación nueva, que es el comportamiento de antes y no empeora nada).
 *
 * `sessionStorage` y no `localStorage`: dura mientras la PESTAÑA sigue abierta.
 * Por usuario: en una compu compartida la sesión de una persona no hereda la
 * charla de la anterior.
 */
const CLAVE_BASE = "rincones:sommelier";
export const claveDe = (userId) => `${CLAVE_BASE}:${userId || "anon"}`;

const VACIA = { mensajes: [], conversacionId: null };

export const leerSesion = (userId, storage = globalThis.sessionStorage) => {
  try {
    const crudo = storage.getItem(claveDe(userId));
    const datos = crudo ? JSON.parse(crudo) : null;

    // Formato viejo: un array de mensajes, sin id.
    if (Array.isArray(datos)) return { mensajes: datos, conversacionId: null };

    if (datos && Array.isArray(datos.mensajes)) {
      const id = datos.conversacionId;
      return {
        mensajes: datos.mensajes,
        conversacionId: typeof id === "string" && id ? id : null,
      };
    }
    return { ...VACIA };
  } catch {
    // Modo privado, JSON roto, lo que sea: la charla sigue andando en memoria,
    // sólo que no sobrevive a salir de la pantalla.
    return { ...VACIA };
  }
};

/** Sin mensajes no hay nada que recordar: se borra la entrada. */
export const guardarSesion = (userId, { mensajes, conversacionId }, storage = globalThis.sessionStorage) => {
  try {
    if (!mensajes || mensajes.length === 0) storage.removeItem(claveDe(userId));
    else storage.setItem(claveDe(userId), JSON.stringify({ mensajes, conversacionId: conversacionId || null }));
  } catch {
    // Idem leerSesion: sigue andando en memoria si esto falla.
  }
};
