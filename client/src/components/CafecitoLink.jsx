import { trackEvent } from "../services/analyticsApi";
import Icon from "./Icon";
import "./CafecitoLink.css";

/**
 * "☕ Invitame un café": el enlace para apoyar al desarrollador, a propósito casi invisible.
 *
 * Va al final del perfil (dentro de `PieDeLaApp`), en la parte más baja y menos transitada de la app: nunca en el
 * flujo de uso (bodega, Sommelier, escáner), nunca arriba, nunca como botón, banner o popup.
 * Es la letra chica, como los enlaces legales del login.
 *
 * ── LA URL VIVE EN UN SOLO LUGAR ────────────────────────────────────────────
 * `VITE_CAFECITO_URL`. Sin definir usa la de abajo; definida VACÍA, el enlace desaparece
 * (así se apaga sin tocar código). Es una constante de build, no un secreto.
 *
 * Abre en pestaña nueva con `noopener noreferrer`: el sitio externo no recibe `window.opener`
 * ni el referrer de la app. El clic se cuenta con la analítica propia, sin datos adicionales.
 */
export const CAFECITO_URL = (import.meta.env.VITE_CAFECITO_URL ?? "https://cafecito.app/200okdev").trim();

export default function CafecitoLink({ className = "" }) {
  if (!CAFECITO_URL) return null;

  return (
    <span className={`cafecito ${className}`.trim()}>
      <a
        className="cafecito__link"
        href={CAFECITO_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackEvent("cafecito_click")}
      >
        <Icon name="coffee" size={13} />
        Invitame un café
      </a>
    </span>
  );
}
