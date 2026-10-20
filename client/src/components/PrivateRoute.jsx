import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import ErrorState from "./ErrorState";
import SplashScreen from "./SplashScreen";

const PrivateRoute = ({ children }) => {
  const { user, loading, sinConexion, refreshUser } = useAuth();
  const location = useLocation();

  // Primera pantalla que ve el usuario al abrir la app: va la marca, no un
  // mensaje de sistema.
  if (loading) return <SplashScreen />;

  /**
   * No pudimos preguntar quién sos. Eso NO es haber cerrado sesión.
   *
   * Es la mitad de pantalla del arreglo que está explicado en AuthContext:
   * mandar al login a alguien cuya sesión sigue viva —porque se cortó la red o
   * porque el server tardó en despertar— es el peor final posible, porque
   * además le sugiere que la culpa fue suya y que tiene que volver a entrar.
   * Decimos lo que pasó y dejamos reintentar.
   */
  if (!user && sinConexion) {
    return (
      <ErrorState
        title="No pudimos conectarnos"
        hint="Tu sesión sigue abierta. Revisá tu conexión y volvé a intentar."
        onRetry={refreshUser}
      />
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }

  return children;
};

export default PrivateRoute;
