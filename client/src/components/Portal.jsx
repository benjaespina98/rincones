import { createPortal } from "react-dom";

/**
 * Renderiza a `document.body`, fuera del árbol de la página.
 *
 * Por qué hace falta: un modal con `position: fixed; z-index: 1300` igual puede
 * quedar TAPADO si algún ancestro crea un contexto de apilamiento (un transform
 * residual de una animación, un backdrop-filter, un overflow). Pasaba de verdad:
 * en "Editar perfil" el header de la app se pintaba encima y se comía el click
 * del botón Guardar — el botón estaba ahí, habilitado, y no se podía tocar.
 *
 * Sacándolo a body, el z-index se resuelve contra la raíz y deja de depender de
 * qué haga la pantalla que lo abrió.
 */
export default function Portal({ children }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
