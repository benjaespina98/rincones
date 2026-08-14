import { useEffect, useRef } from "react";

/**
 * Botón "Continuar con Google" (Google Identity Services).
 *
 * Sin `VITE_GOOGLE_CLIENT_ID` configurado no renderiza nada — mismo criterio
 * que `errorMonitoring.js` con Sentry: una integración opcional no puede
 * romper ni ensuciar la pantalla si nadie la configuró. El script de Google
 * se carga una sola vez (lo comparten login y registro) y sólo cuando hace
 * falta, no en cada import.
 */
const CLIENT_ID = String(import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim();

let scriptPromise = null;
const loadGoogleScript = () => {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("No se pudo cargar Google Identity Services"));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
};

export default function GoogleAuthButton({ onCredential, disabled }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;

    loadGoogleScript()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          // `credential` es el ID token firmado por Google; se manda tal
          // cual al server, que es quien lo valida — acá no se confía en
          // nada de lo que venga del cliente.
          callback: ({ credential }) => onCredential?.(credential),
        });
        window.google.accounts.id.renderButton(containerRef.current, {
          type: "standard",
          theme: "filled_black",
          size: "large",
          shape: "pill",
          width: containerRef.current.offsetWidth || 320,
          text: "continue_with",
          locale: "es",
        });
      })
      .catch(() => {
        // Sin red o bloqueado por un ad-blocker: el botón simplemente no
        // aparece. El registro/login con email sigue disponible al lado.
      });

    return () => { cancelled = true; };
  }, [onCredential]);

  if (!CLIENT_ID) return null;

  return (
    <div className="auth-google">
      <div className="auth-divider"><span>o</span></div>
      <div ref={containerRef} className={`auth-google__btn ${disabled ? "is-disabled" : ""}`} />
    </div>
  );
}
