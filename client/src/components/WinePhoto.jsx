import { useState } from "react";
import WineArtwork from "./WineArtwork";
import "./WinePhoto.css";

/**
 * Foto de un vino con placeholder anti-flicker.
 *
 * Siempre dibuja la botella (WineArtwork) de fondo; si hay `src`, la imagen se
 * carga encima y recién cuando terminó de bajar se funde (fade-in). Así nunca
 * se ve el hueco vacío mientras la foto viaja desde Cloudinary/servidor —el
 * problema típico de "tarda unos segundos y aparece de golpe".
 *
 * `fit` decide cómo se presenta la foto, y es la diferencia entre una botella y
 * un recorte:
 *
 *   "cover"   — la foto llena el marco. Para miniaturas de lista (46-64px),
 *               donde una botella entera sería ilegible y lo que aporta es la
 *               textura y el color de la etiqueta.
 *   "contain" — la botella entra COMPLETA, con aire alrededor, sombra propia y
 *               un halo tenue detrás. Para todo lo que presenta al vino: el
 *               destacado de la home, las tarjetas del rail, la vitrina y el
 *               hero de la ficha.
 *
 * El default es "cover" porque es el comportamiento que ya tenían todos los
 * usos; los que presentan una botella lo piden explícitamente.
 */
/**
 * Las fotos de Open Food Facts son CC BY-SA 3.0: se pueden usar, pero la
 * licencia exige acreditar la fuente donde se muestran. Se detecta por la URL
 * porque no todas las rutas propagan `imageSource` desde el server.
 */
const esDeOpenFoodFacts = (src = "") => /openfoodfacts\.org/i.test(String(src));

export default function WinePhoto({
  src,
  type = "unknown",
  artSize = 92,
  alt = "",
  className = "",
  priority = false,
  fit = "cover",
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const showImg = src && !failed;
  const acreditar = showImg && loaded && esDeOpenFoodFacts(src);

  // `is-loaded` vive en la raíz y no en la imagen: en modo "contain" hay que
  // apagar el dibujo de respaldo y encender el halo, y ambos son hermanos de la
  // foto, no hijos suyos.
  const estado = showImg && loaded ? "is-loaded" : "";

  return (
    <div className={`wine-photo wine-photo--${fit} ${estado} ${className}`}>
      <div className="wine-photo__art">
        <WineArtwork type={type} size={artSize} />
      </div>
      {showImg && (
        <img
          src={src}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          fetchpriority={priority ? "high" : "auto"}
          decoding="async"
          className={`wine-photo__img ${loaded ? "is-loaded" : ""}`}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
      {acreditar && (
        <span className="wine-photo__credito" title="Foto de Open Food Facts, licencia CC BY-SA 3.0">
          OFF
        </span>
      )}
    </div>
  );
}
