import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const ProtectedRoute = ({ children }) => {
  const { isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <p>Cargando sesion...</p>;
  }

  if (!isAdmin) {
    return <Navigate to="/admin" replace state={{ from: location.pathname }} />;
  }

  return children;
};

export default ProtectedRoute;
