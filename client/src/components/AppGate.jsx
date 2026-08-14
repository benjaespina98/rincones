import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { resolveAuthGate } from "../utils/authGate";

/**
 * Va DENTRO de `PrivateRoute` (que ya garantiza que hay sesión) y ADELANTE de
 * `AppLayout`: es el paso obligatorio antes de la navegación normal.
 *
 * No es un modal descartable —el bug que resolvía era justo ese: un aviso que
 * se podía cerrar sin completar nada— sino una redirección de verdad, así que
 * no hay forma de "quedar adentro" de la app sin pasar por acá primero. Y
 * corre en cada navegación, no sólo al loguearse: si en OTRA pestaña o
 * dispositivo la cuenta deja de estar verificada/onboardeada, esta también lo
 * nota apenas el usuario toca algo (el estado sale de `user`, que refleja lo
 * último que devolvió el servidor).
 */
const AppGate = ({ children }) => {
  const { user } = useAuth();
  const gate = resolveAuthGate(user);

  if (gate === "verify-email") return <Navigate to="/verificar-email" replace />;
  if (gate === "onboarding") return <Navigate to="/onboarding" replace />;

  return children;
};

export default AppGate;
