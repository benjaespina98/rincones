import { useEffect, useRef, useState } from "react";
import Portal from "./Portal";
import Icon from "./Icon";
import { wineDisplayName } from "../utils/wineIdentity";
import "../styles/components/OpenBottleSheet.css";

/**
 * "Abrí una botella", dicho entero antes de hacerlo.
 *
 * ── QUÉ PROBLEMA RESUELVE ──────────────────────────────────────────────────
 * Eran dos, y los dos venían de que la acción no se explicaba en ningún lado
 * que se pudiera leer con un dedo:
 *
 * 1. Sólo se podía abrir UNA. Abrir tres en un asado eran tres toques, tres
 *    avisos y tres "Deshacer", de los cuales sólo el último servía para algo.
 *    Y era incoherente con el alta, donde sí se elegía cantidad (con atajos de
 *    media docena y caja).
 *
 * 2. No se sabía qué hacía. Que descuenta stock, que marca el vino como probado
 *    y que registra el consumo estaba escrito en un comentario del código y en
 *    el `title=` de un botón — o sea, en ningún lugar que exista en un teléfono.
 *    La única forma de averiguarlo era tocarlo y mirar qué cambió.
 *
 * Las tres consecuencias se enumeran acá, en presente y antes de confirmar. No
 * es un cartel de advertencia: es la diferencia entre una app que hace cosas y
 * una que te dice qué va a hacer.
 */
export default function OpenBottleSheet({ wine, saving = false, onConfirm, onCancel }) {
  const [cantidad, setCantidad] = useState(1);
  const confirmRef = useRef(null);

  const stock = Math.max(0, Number(wine?.quantity) || 0);
  const quedan = Math.max(0, stock - cantidad);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onCancel?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  if (!wine) return null;

  const nombre = wineDisplayName(wine);

  return (
    <Portal>
      <div
        className="open-sheet-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="open-sheet-title"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onCancel?.();
        }}
      >
        <div className="open-sheet">
          <h2 className="open-sheet__title" id="open-sheet-title">
            ¿Cuántas botellas abriste?
          </h2>
          <p className="open-sheet__wine">{nombre}</p>

          {/* El selector. Los atajos no son los del alta (6 y 12, que son formas
              de comprar): abrir de a dos o de a tres es lo que pasa en una mesa,
              y más que eso ya es un evento y se cuenta con el más. */}
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
              onClick={() => setCantidad((n) => Math.min(stock, n + 1))}
              disabled={saving || cantidad >= stock}
              aria-label="Una botella más"
            >
              <Icon name="plus" size={17} />
            </button>
          </div>

          {stock >= 2 && (
            <div className="open-sheet__presets">
              {[1, 2, 3].filter((n) => n <= stock).map((n) => (
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
          )}

          {/* Las tres cosas que van a pasar. En este orden porque es el de la
              consecuencia: primero lo que se mueve en tu cava, después lo que
              queda escrito de vos. */}
          <ul className="open-sheet__effects">
            <li>
              <Icon name="bottle" size={14} />
              <span>
                Se {cantidad === 1 ? "descuenta" : "descuentan"} de tu stock ·{" "}
                <strong>
                  {quedan === 0
                    ? "no te queda ninguna"
                    : `te ${quedan === 1 ? "queda 1" : `quedan ${quedan}`}`}
                </strong>
              </span>
            </li>
            <li>
              <Icon name="check" size={14} />
              <span>
                {wine.tasted
                  ? "El vino ya figura como probado y sigue igual"
                  : "El vino queda marcado como probado"}
              </span>
            </li>
            <li>
              <Icon name="calendar" size={14} />
              <span>Se registra el consumo de hoy</span>
            </li>
          </ul>

          <div className="open-sheet__actions">
            <button
              ref={confirmRef}
              type="button"
              className="open-sheet__confirm"
              onClick={() => onConfirm?.(cantidad)}
              disabled={saving || stock === 0}
            >
              {saving
                ? "Registrando…"
                : cantidad === 1
                  ? "Abrí una botella"
                  : `Abrí ${cantidad} botellas`}
            </button>
            <button
              type="button"
              className="open-sheet__cancel"
              onClick={onCancel}
              disabled={saving}
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
