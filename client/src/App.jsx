import { Navigate, Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar";
import DescubrirPage from "./pages/DescubrirPage";
import ExplorarPage from "./pages/ExplorarPage";
import LugarDetallePage from "./pages/LugarDetallePage";
import AgregarLugarPage from "./pages/AgregarLugarPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import ProtectedRoute from "./components/ProtectedRoute";
import "./App.css";

function App() {
  return (
    <div className="app-shell">
      <Navbar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<DescubrirPage />} />
          <Route path="/comunidad" element={<ExplorarPage />} />
          <Route path="/explorar" element={<Navigate to="/comunidad" replace />} />
          <Route path="/lugares/:id" element={<LugarDetallePage />} />
          <Route
            path="/agregar"
            element={
              <ProtectedRoute>
                <AgregarLugarPage />
              </ProtectedRoute>
            }
          />
          <Route path="/admin" element={<AdminLoginPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
