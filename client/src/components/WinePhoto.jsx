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
 * `marca` (la bodega) se pasa al dibujo de respaldo para que dos vinos sin foto no se vean idénticos: ver
 * utils/variacionDeBotella.js.
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

function WinePhotoInner({
  src,
  type = "unknown",
  artSize = 92,
  alt = "",
  className = "",
  priority = false,
  fit = "cover",
  marca = "",
  onFail,
}) {
  const [loaded, setLoaded] = useState(false);
  // Proporción real de la imagen (ancho / alto), sólo para fit="auto".
  const [proporcion, setProporcion] = useState(null);
  const [failed, setFailed] = useState(false);
  const showImg = src && !failed;
  const acreditar = showImg && loaded && esDeOpenFoodFacts(src);

  // `is-loaded` vive en la raíz y no en la imagen: en modo "contain" hay que
  // apagar el dibujo de respaldo y encender el halo, y ambos son hermanos de la
  // foto, no hijos suyos.
  const estado = showImg && loaded ? "is-loaded" : "";

  // fit="auto": llena el marco (cover) salvo que la imagen sea mucho más
  // angosta que él — una botella de catálogo recortada, 1:3 — donde cover le
  // comería el pico y la base y contain deja las franjas vacías que son
  // inevitables. Con las fotos de la propia bodega (4:3, 1:1, 3:4) cubre y no
  // sobra nada. El umbral es la mitad de una botella en foto vertical (0,5).
  const ajuste = fit === "auto" ? (proporcion !== null && proporcion < 0.5 ? "contain" : "cover") : fit;

  return (
    <div className={`wine-photo wine-photo--${ajuste} ${estado} ${className}`}>
      <div className="wine-photo__art">
        <WineArtwork type={type} size={artSize} marca={marca} />
      </div>
      {showImg && (
        <img
          src={src}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          fetchpriority={priority ? "high" : "auto"}
          decoding="async"
          className={`wine-photo__img ${loaded ? "is-loaded" : ""}`}
          onLoad={(e) => {
            const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
            if (w && h) setProporcion(w / h);
            setLoaded(true);
          }}
          onError={() => {
            setFailed(true);
            // Quien necesite saber que la foto no cargó (la recomendación de Descubrí no puede mostrar
            // la botella genérica) se entera acá.
            onFail?.();
          }}
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

/* ── UN ESTADO POR FOTO ─────────────────────────────────────────────────────
   `loaded`, `failed` y `proporcion` describen UNA imagen. Si el vino cambia de
   foto con el componente montado (se edita la imagen: mismo `_id`, otro `src`),
   el estado de la anterior quedaba pegado: una botella 1:3 reemplazada por una
   4:3 seguía en `contain`; una que había fallado nunca mostraba la nueva. La
   `key` hace que cada `src` arranque desde cero, sin efectos ni resets a mano. */
export default function WinePhoto(props) {
  return <WinePhotoInner key={props.src || ""} {...props} />;
}
