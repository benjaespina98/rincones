import { Navigate, Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar";
import HomePage from "./pages/HomePage";
import ExplorarPage from "./pages/ExplorarPage";
import LugarDetallePage from "./pages/LugarDetallePage";
import AgregarLugarPage from "./pages/AgregarLugarPage";
import "./App.css";

function App() {
  return (
    <div className="app-shell">
      <Navbar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/explorar" element={<ExplorarPage />} />
          <Route path="/lugares/:id" element={<LugarDetallePage />} />
          <Route path="/agregar" element={<AgregarLugarPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
