import { useState } from "react";
import { updatePassword } from "../services/authApi";
import { useToast } from "../context/ToastContext";
import { passwordStrength, meetsPasswordPolicy } from "../utils/passwordStrength";
import Icon from "./Icon";
import "../styles/components/SettingsSheet.css";
import Portal from "./Portal";

/**
 * Cambiar contraseña.
 *
 * Usa la MISMA política que el registro (`meetsPasswordPolicy`: 8+, mayúscula,
 * minúscula y número). Antes pedía 6 caracteres sin complejidad, así que la app
 * exigía dos reglas distintas para lo mismo.
 */
export default function PasswordEditor({ onClose }) {
  const { showSuccess } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const strength = passwordStrength(next);

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;

    if (!current) return setError("Escribí tu contraseña actual.");
    if (!meetsPasswordPolicy(next)) {
      return setError("La contraseña necesita 8+ caracteres, con mayúsculas, minúsculas y números.");
    }
    if (next !== confirm) return setError("Las contraseñas no coinciden.");
    if (next === current) return setError("La nueva contraseña tiene que ser distinta de la actual.");

    try {
      setSaving(true);
      setError("");
      await updatePassword(current, next);
      showSuccess("Contraseña actualizada");
      onClose?.();
    } catch (err) {
      // El resto de la app lee `.message`; leer `.error` hacía que el mensaje
      // real del server nunca se mostrara.
      setError(err?.response?.data?.message || "No se pudo cambiar la contraseña. Probá de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Portal>
      <div className="settings-sheet" role="dialog" aria-modal="true" aria-labelledby="pwd-editor-title">
        <form className="settings-sheet__panel" onSubmit={submit}>
          <div className="settings-sheet__head">
            <h2 id="pwd-editor-title">Cambiar contraseña</h2>
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
            <label className="settings-field">
              <span>Contraseña actual</span>
              <input
                type="password"
                value={current}
                onChange={(e) => { setCurrent(e.target.value); setError(""); }}
                autoComplete="current-password"
                disabled={saving}
              />
            </label>

            <label className="settings-field">
              <span>Nueva contraseña</span>
              <input
                type="password"
                value={next}
                onChange={(e) => { setNext(e.target.value); setError(""); }}
                autoComplete="new-password"
                disabled={saving}
                aria-describedby="pwd-hint"
              />
            </label>

            {next && (
              <div className="settings-strength">
                <div className="settings-strength__bars" aria-hidden="true">
                  {[1, 2, 3].map((i) => (
                    <span key={i} className={i <= strength.level ? `is-on is-on--${strength.cls}` : ""} />
                  ))}
                </div>
                <span className="settings-strength__label">Seguridad: {strength.label}</span>
              </div>
            )}

            <p id="pwd-hint" className="settings-hint">
              Necesita 8+ caracteres, con mayúsculas, minúsculas y números.
            </p>

            <label className="settings-field">
              <span>Repetir nueva contraseña</span>
              <input
                type="password"
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); setError(""); }}
                autoComplete="new-password"
                disabled={saving}
              />
            </label>

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
            <button type="submit" className="settings-sheet__save" disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </div>
  </Portal>
  );
}
