import { useState } from "react";
import { updatePassword } from "../services/authApi";
import { useToast } from "../context/ToastContext";
import Icon from "./Icon";
import "../styles/components/SettingsSheet.css";

// Cambiar contraseña (cablea el endpoint existente updatePassword).
export default function PasswordEditor({ onClose }) {
  const { showSuccess, showError } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (next.length < 6) return showError("La nueva contraseña debe tener al menos 6 caracteres");
    if (next !== confirm) return showError("Las contraseñas no coinciden");
    try {
      setSaving(true);
      await updatePassword(current, next);
      showSuccess("Contraseña actualizada");
      onClose?.();
    } catch (err) {
      showError(err?.response?.data?.error || "No se pudo cambiar la contraseña");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-sheet" role="dialog" aria-modal="true" aria-label="Cambiar contraseña">
      <div className="settings-sheet__panel">
        <div className="settings-sheet__head">
          <h2>Cambiar contraseña</h2>
          <button type="button" className="settings-sheet__close" onClick={onClose} aria-label="Cerrar">
            <Icon name="x" size={20} />
          </button>
        </div>

        <div className="settings-sheet__body">
          <label className="settings-field">
            <span>Contraseña actual</span>
            <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </label>
          <label className="settings-field">
            <span>Nueva contraseña</span>
            <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          </label>
          <label className="settings-field">
            <span>Repetir nueva contraseña</span>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </label>
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
