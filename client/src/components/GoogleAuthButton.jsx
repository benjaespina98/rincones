import { isGoogleAuthEnabled, startGoogleAuth } from "../utils/googleOAuth";

// El logo de Google va así, con sus 4 colores, aunque el resto del ícono set
// de la app sea monocromo (ver components/Icon.jsx): es una marca ajena, no
// un ícono de sistema — cambiarle el color lo vuelve irreconocible.
const GoogleLogo = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.61z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.19l-2.9-2.26c-.81.54-1.85.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z" />
    <path fill="#FBBC05" d="M3.95 10.69A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.16.28-1.69V4.98H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.02z" />
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.98L3.95 7.3C4.66 5.17 6.65 3.58 9 3.58z" />
  </svg>
);

/**
 * "Continuar con Google" — un botón de verdad, no un iframe de terceros. Ver
 * utils/googleOAuth.js para por qué (bloqueadores de popup en escritorio).
 *
 * Sin `VITE_GOOGLE_CLIENT_ID` configurado no renderiza nada: el registro y el
 * login con email siguen andando igual, esto es una alternativa, no una
 * dependencia.
 *
 * `mode` es "login" o "register": sólo decide a dónde volver del lado de
 * Google (ver GoogleCallbackPage), no cambia nada de este botón en sí — el
 * server trata login y alta con Google exactamente igual.
 */
export default function GoogleAuthButton({ mode = "login", disabled }) {
  if (!isGoogleAuthEnabled()) return null;

  return (
    <div className="auth-google">
      <div className="auth-divider"><span>o</span></div>
      <button
        type="button"
        className="auth-google__btn"
        disabled={disabled}
        onClick={() => startGoogleAuth(mode)}
      >
        <GoogleLogo />
        Continuar con Google
      </button>
    </div>
  );
}
