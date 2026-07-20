import { useState } from "react";
import { Link } from "react-router-dom";
import { useToast } from "../context/ToastContext";
import { forgotPassword } from "../services/authApi";
import Icon from "../components/Icon";
import "./Auth.css";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState("");
  const { showSuccess, showError } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) {
      showError("Ingresá tu email.");
      return;
    }

    try {
      setLoading(true);
      const data = await forgotPassword(email);
      setSent(true);
      // En desarrollo sin SMTP, el backend devuelve el enlace directo para probar.
      if (data?.resetUrl) {
        const path = data.resetUrl.replace(/^https?:\/\/[^/]+/, "");
        setDevResetUrl(path || data.resetUrl);
      }
      showSuccess("Si el email existe, te enviamos instrucciones.");
    } catch (err) {
      showError(err.response?.data?.message || "No pudimos procesar la solicitud.");
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
          <h1 className="auth-brand__title">Recuperar acceso</h1>
          <p className="auth-brand__subtitle">
            Te enviamos un enlace seguro para crear una nueva contraseña.
          </p>
        </div>

        {!sent ? (
          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <div className="auth-field">
              <label className="auth-field__label" htmlFor="email">Correo electrónico</label>
              <div className="auth-input-wrap">
                <span className="auth-input-wrap__icon" aria-hidden="true"><Icon name="mail" size={18} /></span>
                <input
                  id="email"
                  type="email"
                  className="auth-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  autoComplete="email"
                  disabled={loading}
                />
              </div>
            </div>

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? <span className="auth-spinner" aria-hidden="true" /> : <>Enviar instrucciones <Icon name="arrow-right" size={18} /></>}
            </button>
          </form>
        ) : (
          <>
            <p className="auth-hint">
              Revisá tu bandeja de entrada (y el spam). Si no llega en unos minutos, volvé a intentar.
            </p>
            {devResetUrl && (
              <div className="auth-devbox">
                <span className="auth-devbox__title">Modo desarrollo · sin email configurado</span>
                <Link to={devResetUrl} className="auth-devbox__link">
                  Abrir enlace de recuperación →
                </Link>
              </div>
            )}
          </>
        )}

        <div className="auth-footer">
          <Link to="/login" className="auth-link">← Volver al inicio de sesión</Link>
        </div>
      </div>
    </div>
  );
}
