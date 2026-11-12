// Arma y resuelve el flujo de "Continuar con Google" como una navegación de
// página COMPLETA (redirect), no un popup ni un iframe.
//
// ── POR QUÉ, Y NO EL BOTÓN DE GOOGLE (Identity Services) ────────────────────
// La librería de Google (accounts.google.com/gsi/client) dibuja un botón
// dentro de un iframe de otro origen y, al tocarlo, abre un popup — dos cosas
// que un bloqueador de anuncios o el modo estricto de privacidad de un
// navegador de escritorio puede frenar en silencio: no salta ningún aviso de
// "popup bloqueado", el click simplemente no hace nada. Es justo lo que pasaba.
//
// Una redirección de página entera no tiene ese problema: es una navegación
// de primera parte de punta a punta (tu pestaña sale a accounts.google.com y
// vuelve), lo mismo que hace cualquier sitio cuando lo mandás a una pasarela
// de pago o a un login externo. Nada que bloquear.
const CLIENT_ID = String(import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim();

export const isGoogleAuthEnabled = () => Boolean(CLIENT_ID);

const NONCE_KEY = "google_oauth_nonce";

const randomNonce = () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

/**
 * Arranca el login: guarda un nonce de un solo uso (para notar si alguien
 * intenta reinyectar un token viejo) y manda al navegador entero a Google.
 *
 * `mode` viaja de ida y vuelta en `state`: es lo único que nos permite saber,
 * al volver, si esto arrancó desde login o desde registro — para mandar a una
 * cuenta nueva a Bodega en vez de al feed vacío de recomendaciones, igual que
 * ya hacía el registro con email.
 */
export const startGoogleAuth = (mode = "login") => {
  const nonce = randomNonce();
  sessionStorage.setItem(NONCE_KEY, nonce);

  const redirectUri = `${window.location.origin}/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "id_token",
    scope: "openid email profile",
    nonce,
    state: mode,
    prompt: "select_account",
  });

  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
};

/**
 * Lee lo que Google dejó en el FRAGMENT de la URL de vuelta
 * (`#id_token=...&state=...`) — nunca en query string, porque un fragment no
 * viaja al servidor en ningún log de acceso. Lo primero que hace es sacarlo
 * de la barra de direcciones: un JWT no tiene por qué quedar visible ni
 * copiable ahí.
 */
export const consumeGoogleAuthResult = () => {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  const params = new URLSearchParams(hash);
  window.history.replaceState(null, "", window.location.pathname);

  const nonceEsperado = sessionStorage.getItem(NONCE_KEY);
  sessionStorage.removeItem(NONCE_KEY);

  const error = params.get("error");
  if (error) return { error };

  const idToken = params.get("id_token");
  const mode = params.get("state") === "register" ? "register" : "login";
  if (!idToken) return { error: "missing_token" };

  // El nonce viaja ADENTRO del JWT (payload), no como parámetro aparte. Acá
  // sólo se decodifica para comparar contra el que guardamos antes de salir
  // — la firma y el resto de las validaciones reales las hace el server.
  try {
    const payload = JSON.parse(atob(idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    // Sin nonce guardado también se rechaza: «si hay, compara» dejaba pasar justo el caso que
    // el nonce existe para frenar (un token que no salió de ESTE inicio de sesión).
    if (!nonceEsperado || payload.nonce !== nonceEsperado) {
      return { error: "nonce_mismatch" };
    }
  } catch {
    return { error: "invalid_token" };
  }

  return { idToken, mode };
};
