import { useState } from "react";
import { WINE_TYPES, VARIETALS } from "../data/wineReference";
import { saveOnboarding } from "../services/authApi";
import { useToast } from "../context/ToastContext";
import Icon from "./Icon";
import "../styles/components/SettingsSheet.css";

const POPULAR_VARIETALS = [
  "Malbec", "Cabernet Sauvignon", "Merlot", "Syrah", "Pinot Noir",
  "Bonarda", "Cabernet Franc", "Chardonnay", "Sauvignon Blanc", "Torrontés",
  "Blend",
].filter((v) => v === "Blend" || VARIETALS.includes(v));

const toggle = (list, value) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

// Editor de preferencias de gusto (re-editable después del onboarding).
export default function PreferencesEditor({ initialTypes = [], initialVarietals = [], onClose, onSaved }) {
  const { showSuccess, showError } = useToast();
  const [types, setTypes] = useState(initialTypes || []);
  const [varietals, setVarietals] = useState(initialVarietals || []);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    try {
      setSaving(true);
      await saveOnboarding({ favoriteTypes: types, favoriteVarietals: varietals });
      showSuccess("Preferencias actualizadas");
      onSaved?.({ favoriteTypes: types, favoriteVarietals: varietals });
      onClose?.();
    } catch {
      showError("No se pudieron guardar las preferencias");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-sheet" role="dialog" aria-modal="true" aria-label="Preferencias de gusto">
      <div className="settings-sheet__panel">
        <div className="settings-sheet__head">
          <h2>Preferencias de gusto</h2>
          <button type="button" className="settings-sheet__close" onClick={onClose} aria-label="Cerrar">
            <Icon name="x" size={20} />
          </button>
        </div>

        <div className="settings-sheet__body">
          <p className="settings-sheet__label">¿Qué tipos preferís?</p>
          <div className="settings-chips">
            {WINE_TYPES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={`settings-chip ${types.includes(value) ? "is-sel" : ""}`}
                onClick={() => setTypes((t) => toggle(t, value))}
              >
                {label}
              </button>
            ))}
          </div>

          <p className="settings-sheet__label">¿Y qué uvas?</p>
          <div className="settings-chips">
            {POPULAR_VARIETALS.map((v) => (
              <button
                key={v}
                type="button"
                className={`settings-chip ${varietals.includes(v) ? "is-sel" : ""}`}
                onClick={() => setVarietals((l) => toggle(l, v))}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-sheet__footer">
          <button type="button" className="settings-sheet__cancel" onClick={onClose}>Cancelar</button>
          <button type="button" className="settings-sheet__save" onClick={save} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
