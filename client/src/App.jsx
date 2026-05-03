import { Navigate, Route, Routes } from "react-router-dom";
import PrivateRoute from "./components/PrivateRoute";
import ProtectedRoute from "./components/ProtectedRoute";
import BottomTabNavigation from "./components/BottomTabNavigation";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
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
      
      {/* Private Routes with Bottom Tab Navigation */}
      
      {/* Bodega Tab - Mi Colección */}
      <Route
        path="/"
        element={
          <PrivateRoute>
            <div className="app-container">
              <main className="app-content">
                <BodyPage />
              </main>
              <BottomTabNavigation />
            </div>
          </PrivateRoute>
        }
      />
      
      {/* Explorar Tab - Sugerencias */}
      <Route
        path="/explorar"
        element={
          <PrivateRoute>
            <div className="app-container">
              <main className="app-content">
                <SuggestionsPage />
              </main>
              <BottomTabNavigation />
            </div>
          </PrivateRoute>
        }
      />
      
      {/* Descubrir Tab - Escanear/Agregar */}
      <Route
        path="/descubrir"
        element={
          <PrivateRoute>
            <div className="app-container">
              <main className="app-content">
                <ScanWinePage />
              </main>
              <BottomTabNavigation />
            </div>
          </PrivateRoute>
        }
      />
      
      {/* Perfil Tab */}
      <Route
        path="/perfil"
        element={
          <PrivateRoute>
            <div className="app-container">
              <main className="app-content">
                <ProfilePage />
              </main>
              <BottomTabNavigation />
            </div>
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
