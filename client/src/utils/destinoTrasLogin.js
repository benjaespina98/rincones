/**
 * A dónde llevar a la persona después de iniciar sesión: a la pantalla que quería abrir antes de
 * que la app le pidiera entrar (un enlace a un vino, por ejemplo), o al inicio.
 *
 * Sólo rutas internas: un `from` que no empiece con una sola "/" (un enlace a otro sitio, o
 * "//otro.com") o que apunte a una pantalla de acceso se ignora, para que esto no sirva de
 * redirección abierta ni deje a la persona en un bucle de login.
 */
const PANTALLAS_DE_ACCESO = ["/login", "/register", "/forgot-password", "/reset-password", "/verify-email", "/verificar-email", "/onboarding", "/auth"];

export const destinoTrasLogin = (from) => {
  if (typeof from !== "string") return "/";
  if (!from.startsWith("/") || from.startsWith("//") || from.includes("\\")) return "/";
  const ruta = from.split(/[?#]/)[0];
  if (PANTALLAS_DE_ACCESO.some((p) => ruta === p || ruta.startsWith(`${p}/`))) return "/";
  return from;
};
