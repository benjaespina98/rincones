import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import SplashScreen from "./SplashScreen";

/**
 * El guard del panel de admin, separado de `AdminLoginPage`.
 *
 * Antes la pantalla de login Y la de "sos admin, mostrale el panel" eran el
 * mismo componente montado en una única ruta pública (`/admin`): sin rutas
 * reales para Usuarios/Reseñas/etc, sin deep-link, sin botón "atrás" entre
 * secciones. Ahora `/admin` es sólo el login y `/admin/panel/*` son rutas de
 * verdad, protegidas acá — mismo patrón que `PrivateRoute`, pero exigiendo
 * además `role: admin` (re-chequeado contra la base en cada request del lado
 * del server; acá sólo se decide qué mostrar).
 */
const AdminRoute = ({ children }) => {
  const { user, isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) return <SplashScreen />;

  if (!user || !isAdmin) {
    return <Navigate to="/admin" replace state={{ from: location.pathname }} />;
  }

  return children;
};

export default AdminRoute;
