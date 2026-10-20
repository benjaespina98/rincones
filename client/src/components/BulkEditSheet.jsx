import { useEffect, useRef, useState } from "react";
import Portal from "./Portal";
import { useSheet } from "../hooks/useSheet";
import { WINE_TYPE_LABELS } from "../data/wineReference";
import "./OpenBottleSheet.css";
import { camposDelLote } from "../utils/camposDelLote";
import "./BulkEditSheet.css";

/**
 * Editar varios vinos a la vez.
 *
 * Sólo los datos que tienen sentido compartir entre vinos distintos y que más se corrigen en
 * tanda: el tipo, la región y dónde están guardados. Lo que se deja vacío NO se toca (vacío no
 * significa "borrar": cada vino conserva lo suyo). El nombre, la uva, la cosecha y el puntaje
 * son de cada vino y se editan en su ficha.
 *
 * Devuelve sólo los campos que la persona completó, con los nombres que espera el servidor.
 */
export default function BulkEditSheet({ cantidad, regiones = [], saving = false, onConfirm, onCancel }) {
  const [type, setType] = useState("keep");
  const [region, setRegion] = useState("");
  const [cellarLocation, setCellarLocation] = useState("");
  const confirmRef = useRef(null);
  const panelRef = useSheet(onCancel, { enabled: true });

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  const cambios = camposDelLote({ type, region, cellarLocation });
  const hayCambios = Object.keys(cambios).length > 0;

  return (
    <Portal>
      <div
        className="open-sheet-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-edit-title"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onCancel?.();
        }}
      >
        <div className="open-sheet bulk-edit" ref={panelRef} tabIndex={-1}>
          <h2 className="open-sheet__title" id="bulk-edit-title">
            {cantidad === 1 ? "Editar 1 vino" : `Editar ${cantidad} vinos`}
          </h2>
          <p className="open-sheet__wine">Lo que dejes vacío no se modifica.</p>

          <label className="bulk-edit__campo">
            <span>Tipo</span>
            <select value={type} onChange={(e) => setType(e.target.value)} disabled={saving}>
              <option value="keep">No cambiar</option>
              {Object.entries(WINE_TYPE_LABELS).map(([clave, nombre]) => (
                <option key={clave} value={clave}>
                  {nombre}
                </option>
              ))}
            </select>
          </label>

          <label className="bulk-edit__campo">
            <span>Región</span>
            <input
              type="text"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="Por ejemplo, Valle de Uco"
              list="bulk-edit-regiones"
              maxLength={120}
              disabled={saving}
              autoComplete="off"
            />
          </label>

          {/* Las regiones que ya usás y las conocidas: elegir una evita escribirla distinto en cada vino
              ("Valle de Uco", "Uco") y que después no filtren juntas. */}
          <datalist id="bulk-edit-regiones">
            {regiones.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>

          <label className="bulk-edit__campo">
            <span>Guardado en</span>
            <input
              type="text"
              value={cellarLocation}
              onChange={(e) => setCellarLocation(e.target.value)}
              placeholder="Por ejemplo, Cava 1"
              maxLength={120}
              disabled={saving}
              autoComplete="off"
            />
          </label>

          <div className="open-sheet__actions">
            <button
              ref={confirmRef}
              type="button"
              className="open-sheet__confirm"
              onClick={() => onConfirm?.(cambios)}
              disabled={saving || !hayCambios}
            >
              {saving ? "Guardando…" : "Aplicar cambios"}
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
