import { useCallback, useRef, useState } from "react";
import Portal from "./Portal";
import { useSheet } from "../hooks/useSheet";
import "./BottomSheet.css";

/**
 * La hoja que sube desde abajo.
 *
 * ── POR QUÉ UN COMPONENTE Y NO OTRA HOJA MÁS ────────────────────────────────
 * La app tenía cinco paneles que hacían esto mismo (filtros, ajustes, receta,
 * concepto, abrir botella), cada uno con su marcado y su CSS. Se parecían
 * porque alguien los copió, no porque compartieran nada: uno cerraba con
 * Escape, otro no; uno bloqueaba el scroll de atrás, otro creía bloquearlo.
 *
 * Acá el comportamiento vive en un solo lugar y lo aporta `useSheet`: Escape,
 * bloqueo del scroll real, foco que entra y vuelve, y Tab que no se escapa.
 *
 * ── ARRASTRAR PARA CERRAR ───────────────────────────────────────────────────
 * En un teléfono, bajar la hoja con el pulgar es el gesto que la gente prueba
 * primero, antes de buscar una X. Se sigue el dedo con `transform` —nunca
 * `height` ni `top`, que obligan a recalcular el layout en cada frame— y se
 * cierra si el arrastre pasó de un tercio del alto o si el gesto terminó rápido
 * hacia abajo. Un flick corto cierra igual que un arrastre largo: medir sólo la
 * distancia obliga a arrastrar hasta el final, que se siente pesado.
 *
 * Con `prefers-reduced-motion` no hay transición de vuelta, pero el gesto sigue
 * funcionando: se reduce el movimiento, no la funcionalidad.
 */

/** Cuánto hay que bajar para que suelte, como fracción del alto de la hoja. */
const UMBRAL = 0.33;
/** Un gesto más corto que esto es un flick: manda la velocidad, no la distancia. */
const FLICK_MS = 280;
const FLICK_PX = 56;

export default function BottomSheet({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  /** Texto del botón de cerrar para lectores de pantalla. */
  closeLabel = "Cerrar",
  className = "",
}) {
  const panelRef = useSheet(onClose, { enabled: isOpen });
  const [arrastre, setArrastre] = useState(0);
  // Estado y no sólo el ref: React tiene que re-renderizar para apagar la
  // transición mientras el dedo manda, y un ref no lo despierta.
  const [arrastrando, setArrastrando] = useState(false);
  const gesto = useRef(null);

  const alBajar = useCallback((e) => {
    // Sólo el gesto que empieza en el asa. Arrastrar desde el contenido tiene
    // que scrollear la hoja, no moverla: si no, no se puede leer una lista
    // larga sin cerrarla sin querer.
    if (!e.currentTarget.dataset.asa) return;
    gesto.current = { y0: e.clientY, t0: Date.now() };
    setArrastrando(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, []);

  const alMover = useCallback((e) => {
    if (!gesto.current) return;
    // Sólo hacia abajo: tirar para arriba no hace nada, porque no hay adónde ir.
    setArrastre(Math.max(0, e.clientY - gesto.current.y0));
  }, []);

  const alSoltar = useCallback(() => {
    if (!gesto.current) return;
    const recorrido = arrastre;
    const duracion = Date.now() - gesto.current.t0;
    const alto = panelRef.current?.offsetHeight || 1;
    gesto.current = null;
    setArrastrando(false);

    const paso = recorrido > alto * UMBRAL;
    const flick = duracion < FLICK_MS && recorrido > FLICK_PX;
    if (paso || flick) onClose?.();
    setArrastre(0);
  }, [arrastre, onClose, panelRef]);

  if (!isOpen) return null;

  const tituloId = title ? "sheet-titulo" : undefined;
  const descId = description ? "sheet-desc" : undefined;

  return (
    <Portal>
      <div className="sheet" role="presentation">
        {/* El velo cierra al tocarlo: es lo que todo el mundo intenta después
            del gesto de bajar. `aria-hidden` porque el botón de cerrar de
            adentro ya ofrece la misma salida a quien no usa puntero. */}
        <button
          type="button"
          className="sheet__velo"
          aria-hidden="true"
          tabIndex={-1}
          onClick={onClose}
        />
        <div
          ref={panelRef}
          className={`sheet__panel ${className}`.trim()}
          role="dialog"
          aria-modal="true"
          aria-labelledby={tituloId}
          aria-describedby={descId}
          tabIndex={-1}
          style={arrastre ? { transform: `translateY(${arrastre}px)` } : undefined}
          data-arrastrando={arrastrando ? "" : undefined}
        >
          <div
            className="sheet__asa-zona"
            data-asa=""
            onPointerDown={alBajar}
            onPointerMove={alMover}
            onPointerUp={alSoltar}
            onPointerCancel={alSoltar}
          >
            <span className="sheet__asa" aria-hidden="true" />
          </div>

          {(title || description) && (
            <header className="sheet__head">
              {title && (
                <h2 id={tituloId} className="sheet__titulo">
                  {title}
                </h2>
              )}
              {description && (
                <p id={descId} className="sheet__desc">
                  {description}
                </p>
              )}
            </header>
          )}

          <div className="sheet__cuerpo">{children}</div>

          {footer && <footer className="sheet__pie">{footer}</footer>}

          <button
            type="button"
            className="sheet__cerrar"
            onClick={onClose}
            aria-label={closeLabel}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </Portal>
  );
}
