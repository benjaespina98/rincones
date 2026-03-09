import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import "./index.css";
import App from "./App";
import { LugaresProvider } from "./context/LugaresContext";

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <LugaresProvider>
        <App />
      </LugaresProvider>
    </BrowserRouter>
  </StrictMode>,
)
