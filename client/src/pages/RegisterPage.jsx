import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../context/ToastContext";
import { register as registerRequest } from "../services/authApi";
import { passwordStrength, meetsPasswordPolicy } from "../utils/passwordStrength";
import { birthDateError, maxBirthDateForAge } from "../utils/age";
import Icon from "../components/Icon";
import PasswordInput from "../components/PasswordInput";
import "./Auth.css";

const RegisterPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { showError, showSuccess } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    firstName: "",
    email: "",
    birthDate: "",
    password: "",
    confirmPassword: "",
  });

  const strength = passwordStrength(formData.password);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setError("");
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { firstName, email, birthDate, password, confirmPassword } = formData;

    if (!firstName || !email || !birthDate || !password || !confirmPassword) {
      setError("Completá todos los campos.");
      return;
    }
    const birthError = birthDateError(birthDate);
    if (birthError) {
      setError(birthError);
      return;
    }
    if (!meetsPasswordPolicy(password)) {
      setError("La contraseña necesita 8+ caracteres, con mayúsculas, minúsculas y números.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    try {
      setLoading(true);
      await registerRequest(email, password, firstName, birthDate);
      await login(email, password);
      showSuccess("¡Cuenta creada! Bienvenido a Rincones 🍷");
      navigate("/");
    } catch (err) {
      const msg = err.response?.data?.message || "No pudimos crear la cuenta.";
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
            <Icon name="wine-glass" filled size={32} />
          </span>
          <h1 className="auth-brand__title">Creá tu cuenta</h1>
          <p className="auth-brand__subtitle">Empezá a coleccionar y a descubrir tu próximo vino favorito.</p>
        </div>

        {error && (
          <div className="auth-error" role="alert">
            <Icon name="alert-triangle" size={16} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="auth-field">
            <label className="auth-field__label" htmlFor="firstName">Nombre</label>
            <div className="auth-input-wrap">
              <span className="auth-input-wrap__icon" aria-hidden="true"><Icon name="user" size={18} /></span>
              <input
                id="firstName"
                type="text"
                name="firstName"
                className="auth-input"
                value={formData.firstName}
                onChange={handleChange}
                placeholder="¿Cómo te llamás?"
                autoComplete="given-name"
                disabled={loading}
              />
            </div>
          </div>

          <div className="auth-field">
            <label className="auth-field__label" htmlFor="email">Correo electrónico</label>
            <div className="auth-input-wrap">
              <span className="auth-input-wrap__icon" aria-hidden="true"><Icon name="mail" size={18} /></span>
              <input
                id="email"
                type="email"
                name="email"
                className="auth-input"
                value={formData.email}
                onChange={handleChange}
                placeholder="tu@email.com"
                autoComplete="email"
                disabled={loading}
              />
            </div>
          </div>

          <div className="auth-field">
            <label className="auth-field__label" htmlFor="birthDate">Fecha de nacimiento</label>
            <div className="auth-input-wrap">
              <span className="auth-input-wrap__icon" aria-hidden="true"><Icon name="calendar" size={18} /></span>
              <input
                id="birthDate"
                type="date"
                name="birthDate"
                className="auth-input"
                value={formData.birthDate}
                onChange={handleChange}
                max={maxBirthDateForAge()}
                disabled={loading}
              />
            </div>
            <p className="auth-field__hint">Necesitás ser mayor de 18 años.</p>
          </div>

          <div className="auth-field">
            <label className="auth-field__label" htmlFor="password">Contraseña</label>
            <PasswordInput
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              disabled={loading}
              autoComplete="new-password"
            />
            {formData.password && (
              <div className="auth-strength">
                <div className="auth-strength__bars">
                  {[1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className={`auth-strength__bar ${i <= strength.level ? `is-on--${strength.cls}` : ""}`}
                    />
                  ))}
                </div>
                <span className="auth-strength__label">Seguridad: {strength.label}</span>
              </div>
            )}
          </div>

          <div className="auth-field">
            <label className="auth-field__label" htmlFor="confirmPassword">Confirmar contraseña</label>
            <PasswordInput
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              disabled={loading}
              autoComplete="new-password"
            />
          </div>

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? <span className="auth-spinner" aria-hidden="true" /> : <>Crear cuenta <Icon name="arrow-right" size={18} /></>}
          </button>
        </form>

        <div className="auth-footer">
          <div className="auth-footer__row">
            <span>¿Ya tenés cuenta?</span>
            <Link to="/login" className="auth-link">Iniciá sesión</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
