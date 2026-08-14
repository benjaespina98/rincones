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
    if (resultado.error === "nonce_mismatch") {
      // Dos intentos de login se superpusieron (doble click, volver atrás con
      // el navegador y reintentar) y el nonce guardado ya no es el de este
      // viaje. No es un problema del lado de Google ni del server: sólo hay
      // que arrancar de nuevo.
      showError("La sesión de Google expiró en el camino. Probá de nuevo.");
      navigate("/login", { replace: true });
      return;
    }
    if (resultado.error) {
      // "missing_token"/"invalid_token": Google volvió sin el id_token
      // esperado. Puede ser que la persona haya llegado a esta URL por su
      // cuenta (sin pasar por el botón), no necesariamente una falla real.
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
        // Sin respuesta del server (red caída, CORS, timeout) vs. un rechazo
        // explícito del server (credential inválido, email no verificado) son
        // dos problemas distintos — el primero conviene decirlo distinto para
        // no hacer parecer que la cuenta de Google está mal cuando en
        // realidad no llegó ni a validarse.
        const msg = err.response
          ? err.response.data?.message || "No se pudo continuar con Google."
          : "No pudimos conectar para validar tu cuenta de Google. Revisá tu conexión y probá de nuevo.";
        showError(msg);
        navigate("/login", { replace: true });
      });
  }, [navigate, applySession, showError]);

  return <SplashScreen label="Un momento" />;
}
