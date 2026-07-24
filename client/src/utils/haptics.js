// Vibración háptica sutil, al estilo de las apps nativas.
//
// Usa la Vibration API (navigator.vibrate). Funciona en Chrome/Android; en
// iOS Safari no existe y simplemente no hace nada (no rompe). Mantenemos los
// patrones muy cortos: un "tap" tiene que sentirse como un toque, no un zumbido.

const canVibrate = () =>
  typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

const vibrate = (pattern) => {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Algunos navegadores lo exponen pero lo bloquean sin gesto del usuario.
  }
};

// Toque liviano: navegación entre secciones, tabs.
export const tapHaptic = () => vibrate(10);

// Confirmación: acción exitosa (agregar vino, guardar).
export const successHaptic = () => vibrate([12, 40, 18]);

// Advertencia / error.
export const errorHaptic = () => vibrate([30, 40, 30]);
