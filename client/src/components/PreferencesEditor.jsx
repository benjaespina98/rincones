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
  const [error, setError] = useState("");

  const nothingSelected = types.length === 0 && varietals.length === 0;

  const save = async () => {
    if (saving) return;
    // Guardar sin nada seleccionado borraba las preferencias en silencio, con un
    // toast de éxito. Ahora lo avisamos en vez de dejarlo pasar.
    if (nothingSelected) {
      setError("Elegí al menos un tipo o una uva para guardar.");
      return;
    }
    try {
      setSaving(true);
      setError("");
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
    <div className="settings-sheet" role="dialog" aria-modal="true" aria-labelledby="prefs-editor-title">
      <div className="settings-sheet__panel">
        <div className="settings-sheet__head">
          <h2 id="prefs-editor-title">Preferencias de gusto</h2>
          <button
            type="button"
            className="settings-sheet__close"
            onClick={onClose}
            disabled={saving}
            aria-label="Cerrar"
          >
            <Icon name="x" size={20} />
          </button>
        </div>

        <div className="settings-sheet__body">
          <p className="settings-sheet__label" id="prefs-types">¿Qué tipos preferís?</p>
          <div className="settings-chips" role="group" aria-labelledby="prefs-types">
            {WINE_TYPES.map(({ value, label }) => {
              const on = types.includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  className={`settings-chip ${on ? "is-sel" : ""}`}
                  aria-pressed={on}
                  disabled={saving}
                  onClick={() => { setTypes((t) => toggle(t, value)); setError(""); }}
                >
                  {on && <Icon name="check" size={14} />} {label}
                </button>
              );
            })}
          </div>

          <p className="settings-sheet__label" id="prefs-grapes">¿Y qué uvas?</p>
          <div className="settings-chips" role="group" aria-labelledby="prefs-grapes">
            {POPULAR_VARIETALS.map((v) => {
              const on = varietals.includes(v);
              return (
                <button
                  key={v}
                  type="button"
                  className={`settings-chip ${on ? "is-sel" : ""}`}
                  aria-pressed={on}
                  disabled={saving}
                  onClick={() => { setVarietals((l) => toggle(l, v)); setError(""); }}
                >
                  {on && <Icon name="check" size={14} />} {v}
                </button>
              );
            })}
          </div>

          <p className="settings-hint">Usamos esto para afinar lo que te recomendamos.</p>

          {error && (
            <p className="settings-error" role="alert">
              <Icon name="alert-triangle" size={15} /> {error}
            </p>
          )}
        </div>

        <div className="settings-sheet__footer">
          <button type="button" className="settings-sheet__cancel" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="button" className="settings-sheet__save" onClick={save} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
