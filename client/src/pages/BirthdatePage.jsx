import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../context/ToastContext";
import { updateProfile } from "../services/authApi";
import { birthDateError, maxBirthDateForAge } from "../utils/age";
import Icon from "../components/Icon";
import "./Auth.css";

/**
 * Gate obligatorio SÓLO para cuentas que entraron sin pasar por el
 * formulario de registro — hoy, únicamente "Continuar con Google": ese login
 * no pide fecha de nacimiento, y es un dato obligatorio en toda la app (18+).
 * Ver el orden en `resolveAuthGate` (utils/authGate.js).
 *
 * Mismo patrón que VerifyRequiredPage y OnboardingPage: ruta de tránsito
 * fuera de AppGate (si no, se redirigiría a sí misma en loop), sin AppLayout.
 */
export default function BirthdatePage() {
  const navigate = useNavigate();
  const { refreshUser, logout } = useAuth();
  const { showError } = useToast();
  const [birthDate, setBirthDate] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const err = birthDateError(birthDate);
    if (err) {
      setError(err);
      return;
    }

    try {
      setSaving(true);
      await updateProfile({ birthDate });
      await refreshUser();
      navigate("/bodega", { replace: true });
    } catch (err) {
      const msg = err.response?.data?.error || "No se pudo guardar. Probá de nuevo.";
      setError(msg);
      showError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-brand__mark" aria-hidden="true">
            <Icon name="calendar" size={26} />
          </span>
          <h1 className="auth-brand__title">Un último dato</h1>
          <p className="auth-brand__subtitle">
            Rincones es una app de vinos: necesitamos tu fecha de nacimiento para confirmar que sos mayor de edad.
          </p>
        </div>

        {error && (
          <div className="auth-error" role="alert">
            <Icon name="alert-triangle" size={16} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="auth-field">
            <label className="auth-field__label" htmlFor="birthDate">Fecha de nacimiento</label>
            <div className="auth-input-wrap">
              <span className="auth-input-wrap__icon" aria-hidden="true"><Icon name="calendar" size={18} /></span>
              <input
                id="birthDate"
                type="date"
                name="birthDate"
                className="auth-input"
                value={birthDate}
                onChange={(e) => { setError(""); setBirthDate(e.target.value); }}
                max={maxBirthDateForAge()}
                disabled={saving}
              />
            </div>
          </div>

          <button type="submit" className="auth-submit" disabled={saving}>
            {saving ? <span className="auth-spinner" aria-hidden="true" /> : <>Continuar <Icon name="arrow-right" size={18} /></>}
          </button>
        </form>

        <div className="auth-footer">
          <button type="button" className="auth-link" onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
