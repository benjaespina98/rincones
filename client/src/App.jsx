import { Navigate, Route, Routes } from "react-router-dom";
import PrivateRoute from "./components/PrivateRoute";
import ProtectedRoute from "./components/ProtectedRoute";
import AppLayout from "./components/AppLayout";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import BodyPage from "./pages/BodyPage";
import SuggestionsPage from "./pages/SuggestionsPage";
import ScanWinePage from "./pages/ScanWinePage";
import ProfilePage from "./pages/ProfilePage";
import PlacesMapPage from "./pages/PlacesMapPage";
import ExplorarPage from "./pages/ExplorarPage";
import LugarDetallePage from "./pages/LugarDetallePage";
import AgregarLugarPage from "./pages/AgregarLugarPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import "./App.css";

function App() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/admin" element={<AdminLoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      
      {/* Private Routes with Bottom Tab Navigation */}
      
      {/* Bodega Tab - Mi Colección */}
      <Route
        path="/"
        element={
          <PrivateRoute>
            <AppLayout pageTitle="Mi Bodega">
                <BodyPage />
            </AppLayout>
          </PrivateRoute>
        }
      />

      <Route
        path="/favoritos"
        element={
          <PrivateRoute>
            <AppLayout pageTitle="Favoritos">
                <BodyPage initialFilter="favorites" />
            </AppLayout>
          </PrivateRoute>
        }
      />
      
      {/* Explorar Tab - Sugerencias */}
      <Route
        path="/explorar"
        element={
          <PrivateRoute>
            <AppLayout pageTitle="Explorar">
                <SuggestionsPage />
            </AppLayout>
          </PrivateRoute>
        }
      />
      
      {/* Descubrir Tab - Escanear/Agregar */}
      <Route
        path="/descubrir"
        element={
          <PrivateRoute>
            <AppLayout pageTitle="Descubrir">
                <ScanWinePage />
            </AppLayout>
          </PrivateRoute>
        }
      />
      
      {/* Perfil Tab */}
      <Route
        path="/perfil"
        element={
          <PrivateRoute>
            <AppLayout pageTitle="Perfil">
                <ProfilePage />
            </AppLayout>
          </PrivateRoute>
        }
      />
      
      {/* Nested Routes (lugares, admin) */}
      <Route path="/lugares/:id" element={<LugarDetallePage />} />
      <Route path="/mapa" element={<PlacesMapPage />} />
      <Route path="/explorar-lugares" element={<ExplorarPage />} />
      <Route path="/agregar" element={<ProtectedRoute><AgregarLugarPage /></ProtectedRoute>} />
      
      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
