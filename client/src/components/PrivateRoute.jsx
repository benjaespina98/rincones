import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import SplashScreen from "./SplashScreen";

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Primera pantalla que ve el usuario al abrir la app: va la marca, no un
  // mensaje de sistema.
  if (loading) return <SplashScreen />;

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
};

export default PrivateRoute;
