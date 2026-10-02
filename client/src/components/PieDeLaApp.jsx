import CafecitoLink, { CAFECITO_URL } from "./CafecitoLink";
import "./PieDeLaApp.css";

/**
 * El pie de la app: la letra chica del final del perfil. Una línea fina y, debajo, una sola
 * fila con dos cosas, las dos discretas a propósito: el enlace para invitar un café y el
 * crédito del desarrollador. En un teléfono angosto la fila se parte en dos renglones
 * centrados en vez de apretarse.
 *
 * Va al final de la pantalla y nunca en el flujo de uso: no es publicidad ni compite con el
 * contenido. Cada pieza se apaga sola (el café con `VITE_CAFECITO_URL` vacía).
 *
 * El crédito está en inglés ("made by") aunque la app esté en español: es la firma de la
 * marca y se lee igual en cualquier idioma. El logo es el de fondo oscuro (texto blanco y
 * verde), que es sobre lo que se apoya: la app es oscura. Vive en `public/` y no se toca.
 */
const INSTAGRAM_URL = "https://www.instagram.com/200ok.dev/";

export default function PieDeLaApp() {
  return (
    <footer className="pie-app">
      <span className="pie-app__filete" aria-hidden="true" />
      <div className="pie-app__fila">
        <CafecitoLink />
        {/* Sin café (URL vacía) no queda un punto colgando. */}
        {CAFECITO_URL && <span className="pie-app__punto" aria-hidden="true" />}
        <a
          className="pie-app__credito"
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="200ok.dev en Instagram"
        >
          <span className="pie-app__por">made by</span>
          {/* Las medidas reales (1178×206 a 14px de alto) reservan el lugar: el pie no salta
              cuando llega el SVG. `lazy` porque está al final de la pantalla. */}
          <img
            className="pie-app__logo"
            src="/200ok-logo.svg"
            alt="200ok.dev"
            width="82"
            height="14"
            loading="lazy"
          />
        </a>
      </div>
    </footer>
  );
}
