import { useState } from "react";
import WineArtwork from "./WineArtwork";
import "../styles/components/WinePhoto.css";

/**
 * Foto de un vino con placeholder anti-flicker.
 *
 * Siempre dibuja la botella (WineArtwork) de fondo; si hay `src`, la imagen se
 * carga encima y recién cuando terminó de bajar se funde (fade-in). Así nunca
 * se ve el hueco vacío mientras la foto viaja desde Cloudinary/servidor —el
 * problema típico de "tarda unos segundos y aparece de golpe".
 */
/**
 * Las fotos de Open Food Facts son CC BY-SA 3.0: se pueden usar, pero la
 * licencia exige acreditar la fuente donde se muestran. Se detecta por la URL
 * porque no todas las rutas propagan `imageSource` desde el server.
 */
const esDeOpenFoodFacts = (src = "") => /openfoodfacts\.org/i.test(String(src));

export default function WinePhoto({ src, type = "unknown", artSize = 92, alt = "", className = "", priority = false }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const showImg = src && !failed;
  const acreditar = showImg && loaded && esDeOpenFoodFacts(src);

  return (
    <div className={`wine-photo ${className}`}>
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
