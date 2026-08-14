/**
 * A qué pantalla obligatoria hay que mandar a un usuario logueado antes de
 * dejarlo usar la app, si a alguna.
 *
 * Es una función pura (nada de router ni de contexto adentro) a propósito:
 * la pantalla de cada paso decide sola con qué reemplazarse, y esto se puede
 * testear sin montar rutas. El orden importa — verificar el email antes que
 * completar preferencias, porque no tiene sentido personalizar una cuenta que
 * todavía no sabemos si es de quien dice ser.
 *
 * `user` es el objeto que ya devuelven login/register/refresh/me/google (ver
 * buildAuthResponse en el server): `emailVerified`, `hasBirthDate` y
 * `onboarded` son la misma fuente de verdad en las cinco respuestas.
 *
 * `hasBirthDate` va DESPUÉS de verificar el email y ANTES del onboarding:
 * una cuenta de Google entra con el email ya verificado por Google (no pasa
 * por el primer paso) pero nunca completó el formulario que pide fecha de
 * nacimiento (18+ es obligatorio en toda la app), así que hay que pedirla
 * antes de dejarla tocar nada — y antes que el onboarding de preferencias,
 * que es cosmético y no una validación legal.
 */
export const resolveAuthGate = (user) => {
  if (!user) return null;
  if (!user.emailVerified) return "verify-email";
  if (!user.hasBirthDate) return "birthdate";
  if (!user.onboarded) return "onboarding";
  return null;
};
