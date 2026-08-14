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
 * `user` es el objeto que ya devuelven login/register/refresh/me (ver
 * buildAuthResponse en el server): `emailVerified` y `onboarded` son la
 * misma fuente de verdad en las cuatro respuestas.
 */
export const resolveAuthGate = (user) => {
  if (!user) return null;
  if (!user.emailVerified) return "verify-email";
  if (!user.onboarded) return "onboarding";
  return null;
};
