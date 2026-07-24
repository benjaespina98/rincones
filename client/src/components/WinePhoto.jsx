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
export default function WinePhoto({ src, type = "unknown", artSize = 92, alt = "", className = "" }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const showImg = src && !failed;

  return (
    <div className={`wine-photo ${className}`}>
      <div className="wine-photo__art">
        <WineArtwork type={type} size={artSize} />
      </div>
      {showImg && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={`wine-photo__img ${loaded ? "is-loaded" : ""}`}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
