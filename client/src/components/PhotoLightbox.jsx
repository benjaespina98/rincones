import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import Portal from "./Portal";
import "../styles/components/PhotoLightbox.css";

/**
 * La foto, a pantalla completa.
 *
 * Una etiqueta de vino es texto: la cosecha, la finca, el número de barrica.
 * Dentro del encabezado entra a 300px de ancho y no se lee nada; el gesto que
 * todo el mundo intenta —tocar la foto— no hacía nada.
 *
 * Tres formas de salir, porque nadie recuerda cuál es la de esta app: tocar
 * fuera, el botón de cerrar, y Escape. Y un toque sobre la foto la agranda al
 * doble sobre el punto tocado, que es cómo se lee una contraetiqueta sin tener
 * que abrir la imagen en otra pestaña.
 */
export default function PhotoLightbox({ src, alt = "", caption = "", onClose }) {
  const cerrarRef = useRef(null);
  const [zoom, setZoom] = useState(null);

  useEffect(() => {
    if (!src) return undefined;
    cerrarRef.current?.focus();

    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);

    /* Sin esto, el fondo scrollea detrás de la foto: se cierra el visor y la
       ficha quedó en otro lugar del que se dejó.

       Se bloquea `.app-content` y no `body`: en esta app el body NO scrollea
       (ver App.css), así que ponerle `overflow: hidden` —que es lo que hacía
       acá— no impedía absolutamente nada. El bug seguía pasando con el
       arreglo puesto. */
    const scroller = document.querySelector(".app-content") || document.documentElement;
    const overflowPrevio = scroller.style.overflow;
    scroller.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      scroller.style.overflow = overflowPrevio;
    };
  }, [src, onClose]);

  // El visor se monta al abrirse y se desmonta al cerrarse (lo decide quien lo
  // usa), así que cada apertura arranca sin zoom sin tener que resetearlo.
  if (!src) return null;

  const alternarZoom = (e) => {
    if (zoom) {
      setZoom(null);
      return;
    }
    // El origen del zoom es el punto que se tocó: se agranda lo que se quiso
    // mirar, no el centro de la imagen.
    const caja = e.currentTarget.getBoundingClientRect();
    setZoom({
      x: ((e.clientX - caja.left) / caja.width) * 100,
      y: ((e.clientY - caja.top) / caja.height) * 100,
    });
  };

  return (
    <Portal>
      <div
        className="photo-lightbox"
        role="dialog"
        aria-modal="true"
        aria-label={alt || "Foto del vino"}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose?.();
        }}
      >
        <button
          ref={cerrarRef}
          type="button"
          className="photo-lightbox__close"
          onClick={onClose}
          aria-label="Cerrar la foto"
        >
          <Icon name="x" size={18} />
        </button>

        <img
          className={`photo-lightbox__img ${zoom ? "is-zoomed" : ""}`}
          src={src}
          alt={alt}
          style={zoom ? { transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
          onClick={alternarZoom}
        />

        {caption && <p className="photo-lightbox__caption">{caption}</p>}
      </div>
    </Portal>
  );
}
