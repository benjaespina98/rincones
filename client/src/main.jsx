import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { initErrorMonitoring } from "./services/errorMonitoring";
import { observarBuildViejo } from "./utils/staleBuild";
import { registrarSW } from "./utils/registrarSW";

// Sin VITE_SENTRY_DSN no hace nada (ver services/errorMonitoring.js): no
// bloquea el render, así que va suelta y no adentro del árbol de componentes.
initErrorMonitoring();

// Antes de montar nada: un chunk que no baja porque el shell quedó viejo tiene
// que resolverse trayendo el documento nuevo, no mostrando un error. Si se
// enganchara adentro del árbol, el primer import fallido —el de la propia
// pantalla que se está abriendo— ya habría pasado de largo. Ver utils/staleBuild.js.
observarBuildViejo();

/**
 * El service worker va DESPUÉS de `observarBuildViejo`, y el orden importa.
 *
 * Los dos atienden el mismo problema por lados opuestos: el observador
 * reacciona a un chunk que no bajó, el SW evita tener que bajarlo. Si el SW se
 * registrara primero y rompiera algo, el observador todavía no estaría
 * escuchando y volveríamos al síntoma viejo —la pantalla muerta— sin la
 * recuperación automática.
 */
registrarSW();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
)
