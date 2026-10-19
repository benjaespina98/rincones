import { invalidarDestacados } from "../services/wineSearchApi";

/**
 * Lo que la app guarda en este navegador y es de UNA persona: se borra al cerrar sesión o al
 * eliminar la cuenta, para que la siguiente persona que use el mismo navegador no herede los
 * filtros, la vista ni el último vino recomendado de la anterior (ni, tras eliminar la cuenta, el
 * token). Las preferencias del navegador en sí (tema del sistema, versión) no se tocan.
 */
export const CLAVES_POR_PERSONA = [
  "rincones_bodega_filtros",
  "rincones_bodega_vista",
  "rincones_descubri_ultimo",
  "rincones_token",
];

export const limpiarDatosLocales = () => {
  for (const clave of CLAVES_POR_PERSONA) {
    try {
      localStorage.removeItem(clave);
    } catch {
      // Sin acceso al almacenamiento no hay nada que limpiar.
    }
  }
  // El set de recomendaciones del día (sessionStorage, con la fecha en la clave).
  invalidarDestacados();
};
