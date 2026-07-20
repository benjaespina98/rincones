import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "../context/ToastContext";
import { resetPassword } from "../services/authApi";
import { passwordStrength, meetsPasswordPolicy } from "../utils/passwordStrength";
import Icon from "../components/Icon";
import PasswordInput from "../components/PasswordInput";
import "./Auth.css";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const emailFromQuery = searchParams.get("email") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();

  const strength = passwordStrength(password);
  const invalidLink = !token || !emailFromQuery;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (invalidLink) {
      setError("El enlace es inválido o está incompleto. Pedí uno nuevo.");
      return;
    }
    if (!meetsPasswordPolicy(password)) {
      setError("La contraseña necesita 8+ caracteres, con mayúsculas, minúsculas y números.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    try {
      setLoading(true);
      await resetPassword({ token, email: emailFromQuery, newPassword: password });
      showSuccess("Contraseña actualizada. ¡Listo!");
      navigate("/login");
    } catch (err) {
      const msg = err.response?.data?.message || "No pudimos restablecer la contraseña.";
      setError(msg);
      showError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-brand__mark" aria-hidden="true">
            <Icon name="lock" size={26} />
          </span>
          <h1 className="auth-brand__title">Nueva contraseña</h1>
          <p className="auth-brand__subtitle">
            {emailFromQuery ? `Para ${emailFromQuery}` : "Creá una contraseña segura para tu cuenta."}
          </p>
        </div>

        {(error || invalidLink) && (
          <div className="auth-error" role="alert">
            <Icon name="alert-triangle" size={16} />
            {error || "El enlace es inválido o expiró. Pedí uno nuevo."}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="auth-field">
            <label className="auth-field__label" htmlFor="password">Nueva contraseña</label>
            <PasswordInput
              id="password"
              name="password"
              value={password}
              onChange={(e) => { setError(""); setPassword(e.target.value); }}
              disabled={loading || invalidLink}
              autoComplete="new-password"
            />
            {password && (
              <div className="auth-strength">
                <div className="auth-strength__bars">
                  {[1, 2, 3].map((i) => (
                    <span key={i} className={`auth-strength__bar ${i <= strength.level ? `is-on--${strength.cls}` : ""}`} />
                  ))}
                </div>
                <span className="auth-strength__label">Seguridad: {strength.label}</span>
              </div>
            )}
          </div>

          <div className="auth-field">
            <label className="auth-field__label" htmlFor="confirm">Confirmar contraseña</label>
            <PasswordInput
              id="confirm"
              name="confirm"
              value={confirm}
              onChange={(e) => { setError(""); setConfirm(e.target.value); }}
              disabled={loading || invalidLink}
              autoComplete="new-password"
            />
          </div>

          <button type="submit" className="auth-submit" disabled={loading || invalidLink}>
            {loading ? <span className="auth-spinner" aria-hidden="true" /> : <>Cambiar contraseña <Icon name="arrow-right" size={18} /></>}
          </button>
        </form>

        <div className="auth-footer">
          <Link to="/login" className="auth-link">← Volver al inicio de sesión</Link>
        </div>
      </div>
    </div>
  );
}
