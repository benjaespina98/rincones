import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../context/ToastContext";
import { googleAuth } from "../services/authApi";
import { consumeGoogleAuthResult } from "../utils/googleOAuth";
import SplashScreen from "../components/SplashScreen";

/**
 * A donde Google redirige de vuelta después de "Continuar con Google" (ver
 * utils/googleOAuth.js — es una navegación de página completa, no un popup).
 * Pública y fuera de PrivateRoute: todavía no hay sesión en este navegador
 * cuando se llega acá.
 *
 * Sin UI propia más allá de la marca: dura lo que tarda la llamada al server,
 * después redirige — es tránsito, no una pantalla en la que alguien se queda.
 *
 * `useRef` evita el doble disparo del StrictMode de desarrollo: el nonce se
 * consume una sola vez (se borra al leerlo), así que un segundo efecto
 * encontraría "missing_token" y mandaría al login sin motivo.
 */
export default function GoogleCallbackPage() {
  const navigate = useNavigate();
  const { applySession } = useAuth();
  const { showError } = useToast();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const resultado = consumeGoogleAuthResult();

    if (resultado.error === "access_denied") {
      // La persona canceló desde la pantalla de Google: no es un error, no
      // hay nada que avisar.
      navigate("/login", { replace: true });
      return;
    }
    if (resultado.error) {
      showError("No se pudo continuar con Google. Probá de nuevo.");
      navigate("/login", { replace: true });
      return;
    }

    googleAuth(resultado.idToken)
      .then((user) => {
        applySession(user);
        // Mismo criterio que el registro con email: una cuenta nueva va a
        // Bodega (ahí vive el camino directo a escanear el primer vino), una
        // que ya existía va a Descubrí.
        navigate(resultado.mode === "register" ? "/bodega" : "/", { replace: true });
      })
      .catch((err) => {
        const msg = err.response?.data?.message || "No se pudo continuar con Google.";
        showError(msg);
        navigate("/login", { replace: true });
      });
  }, [navigate, applySession, showError]);

  return <SplashScreen label="Un momento" />;
}
