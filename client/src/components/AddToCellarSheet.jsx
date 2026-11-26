import { useEffect, useRef, useState } from "react";
import Portal from "./Portal";
import Icon from "./Icon";
import Segmented from "./Segmented";
import { useSheet } from "../hooks/useSheet";
import { wineDisplayName } from "../utils/wineIdentity";
import "./OpenBottleSheet.css";
import "./ScanReview.css";

/**
 * "Agregar a tu bodega" un vino que encontraste buscando, sin sacar ninguna foto.
 *
 * La misma elección que al escanear: "Lo tengo" (con cuántas botellas) o "Ya lo tomé" (sin stock
 * y probado, como una copa en un restaurante). Comparte aspecto con las hojas de
 * abrir y sumar botellas: la app se detiene a preguntar antes de tocar tus datos.
 */
const ATAJOS = [1, 3, 6, 12];
const MAX = 999;

export default function AddToCellarSheet({ wine, saving = false, onConfirm, onCancel }) {
  const [cantidad, setCantidad] = useState(1);
  const [afuera, setAfuera] = useState(false);
  const confirmRef = useRef(null);
  const panelRef = useSheet(onCancel, { enabled: Boolean(wine) });

  useEffect(() => {
    if (wine) confirmRef.current?.focus();
  }, [wine]);

  if (!wine) return null;

  const etiqueta = saving
    ? "Agregando…"
    : afuera
      ? "Guardar"
      : cantidad === 1
        ? "Agregar una botella"
        : `Agregar ${cantidad} botellas`;

  return (
    <Portal>
      <div
        className="open-sheet-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-cellar-title"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onCancel?.();
        }}
      >
        <div className="open-sheet" ref={panelRef} tabIndex={-1}>
          <h2 className="open-sheet__title" id="add-cellar-title">
            Agregar a tu bodega
          </h2>
          <p className="open-sheet__wine">{wineDisplayName(wine)}</p>

          <Segmented
            className="scan-review__destino"
            ariaLabel="¿La tenés o ya la tomaste?"
            value={afuera ? "tomado" : "tengo"}
            onChange={(v) => setAfuera(v === "tomado")}
            options={[
              { id: "tengo", label: "Lo tengo" },
              { id: "tomado", label: "Ya lo tomé" },
            ]}
          />

          {!afuera && (
            <>
              <div className="open-sheet__picker">
                <button
                  type="button"
                  className="qty-btn"
                  onClick={() => setCantidad((n) => Math.max(1, n - 1))}
                  disabled={saving || cantidad <= 1}
                  aria-label="Una botella menos"
                >
                  <Icon name="minus" size={17} />
                </button>
                <span className="open-sheet__n" aria-live="polite">
                  {cantidad}
                </span>
                <button
                  type="button"
                  className="qty-btn"
                  onClick={() => setCantidad((n) => Math.min(MAX, n + 1))}
                  disabled={saving || cantidad >= MAX}
                  aria-label="Una botella más"
                >
                  <Icon name="plus" size={17} />
                </button>
              </div>

              <div className="open-sheet__presets">
                {ATAJOS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`open-sheet__preset ${cantidad === n ? "is-active" : ""}`}
                    onClick={() => setCantidad(n)}
                    disabled={saving}
                    aria-pressed={cantidad === n}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="open-sheet__actions">
            <button
              ref={confirmRef}
              type="button"
              className="open-sheet__confirm"
              onClick={() => onConfirm?.(afuera ? 0 : cantidad)}
              disabled={saving}
            >
              {etiqueta}
            </button>
            <button type="button" className="open-sheet__cancel" onClick={onCancel} disabled={saving}>
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
