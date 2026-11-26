import { CLAVE_USUARIO } from "./claveUsuario";

/**
 * El último usuario que abrió sesión en este navegador, para abrir la app al instante.
 *
 * Abrir la app esperaba a `/auth/me` mirando el logo (y, con el token vencido, a una renovación y otra vuelta). Con esto
 * la app arranca con la persona que ya se conocía y lo confirma por detrás: si el server dice que la sesión terminó, se
 * va al login; si dice que sigue, se actualizan los datos. Quien manda es la cookie de sesión: esto sólo adelanta la
 * pantalla, y se borra al cerrar sesión (ver limpiarDatosLocales).
 */
export { CLAVE_USUARIO };

export const leerUsuarioGuardado = () => {
  try {
    const crudo = localStorage.getItem(CLAVE_USUARIO);
    if (!crudo) return null;
    const user = JSON.parse(crudo);
    // Sin id y email no es un usuario: se descarta antes de que la app confíe en él.
    return user && typeof user === "object" && user.id && user.email ? user : null;
  } catch {
    return null;
  }
};

export const guardarUsuario = (user) => {
  try {
    if (user && user.id && user.email) localStorage.setItem(CLAVE_USUARIO, JSON.stringify(user));
  } catch {
    // Sin almacenamiento la app anda igual, sólo que sin el arranque instantáneo.
  }
};

export const olvidarUsuario = () => {
  try {
    localStorage.removeItem(CLAVE_USUARIO);
  } catch {
    // Nada que borrar.
  }
};
