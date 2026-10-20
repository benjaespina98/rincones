import { useEffect, useRef, useState } from "react";
import Portal from "./Portal";
import Icon from "./Icon";
import { useSheet } from "../hooks/useSheet";
import { wineDisplayName } from "../utils/wineIdentity";
import "./OpenBottleSheet.css";

/**
 * "Sumar botellas": volver a tener stock de un vino que ya está en tu bodega.
 *
 * Es el espejo de `OpenBottleSheet` y comparte su aspecto a propósito: la app se detiene a
 * preguntar cuántas y a decir qué va a pasar antes de tocar tus datos. Sirve sobre todo en
 * "Ya tomados": comprar de nuevo un vino que ya tomaste no tiene por qué pasar por escanear la
 * etiqueta otra vez. El vino conserva todo su historial (puntaje, notas, momentos, que ya lo
 * tomaste): sólo vuelven a haber botellas.
 */
const ATAJOS = [1, 3, 6, 12];
const MAX = 999;

export default function AddStockSheet({ wine, lote = 1, saving = false, onConfirm, onCancel }) {
  const [cantidad, setCantidad] = useState(1);
  const confirmRef = useRef(null);

  const stock = Math.max(0, Number(wine?.quantity) || 0);
  const quedaran = stock + cantidad;
  const variosVinos = lote > 1;

  const panelRef = useSheet(onCancel, { enabled: Boolean(wine) });

  useEffect(() => {
    if (wine) confirmRef.current?.focus();
  }, [wine]);

  if (!wine) return null;

  return (
    <Portal>
      <div
        className="open-sheet-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-stock-title"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onCancel?.();
        }}
      >
        <div className="open-sheet" ref={panelRef} tabIndex={-1}>
          <h2 className="open-sheet__title" id="add-stock-title">
            ¿Cuántas botellas sumás?
          </h2>
          <p className="open-sheet__wine">{variosVinos ? `A cada uno de los ${lote} vinos elegidos` : wineDisplayName(wine)}</p>

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

          <ul className="open-sheet__effects">
            <li>
              <Icon name="bottle" size={14} />
              <span>
                Se {cantidad === 1 ? "suma" : "suman"} a tu stock ·{" "}
                <strong>
                  {variosVinos
                    ? `${cantidad * lote} botellas en total`
                    : quedaran === 1
                      ? "vas a tener 1"
                      : `vas a tener ${quedaran}`}
                </strong>
              </span>
            </li>
            <li>
              <Icon name="check" size={14} />
              <span>
                {variosVinos
                  ? "Cada vino conserva su historial, su puntaje y sus notas"
                  : wine.tasted
                  ? "Sigue figurando como ya tomado, con todo su historial"
                  : "Conserva su puntaje y sus notas"}
              </span>
            </li>
          </ul>

          <div className="open-sheet__actions">
            <button
              ref={confirmRef}
              type="button"
              className="open-sheet__confirm"
              onClick={() => onConfirm?.(cantidad)}
              disabled={saving}
            >
              {saving ? "Sumando…" : cantidad === 1 ? "Sumar una botella" : `Sumar ${cantidad} botellas`}
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
