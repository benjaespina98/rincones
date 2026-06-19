import { Navigate, Route, Routes } from "react-router-dom";
import PrivateRoute from "./components/PrivateRoute";
import AppLayout from "./components/AppLayout";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import BodyPage from "./pages/BodyPage";
import SuggestionsPage from "./pages/SuggestionsPage";
import ScanWinePage from "./pages/ScanWinePage";
import ProfilePage from "./pages/ProfilePage";
import WineDetailPage from "./pages/WineDetailPage";
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
      
      {/* Detalle de vino */}
      <Route
        path="/vino/:id"
        element={
          <PrivateRoute>
            <AppLayout pageTitle="Vino">
                <WineDetailPage />
            </AppLayout>
          </PrivateRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
