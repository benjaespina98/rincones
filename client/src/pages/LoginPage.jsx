import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../context/ToastContext";
import Icon from "../components/Icon";
import Logo from "../components/Logo";
import PasswordInput from "../components/PasswordInput";
import GoogleAuthButton from "../components/GoogleAuthButton";
import "./Auth.css";

const LoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { showError, showSuccess } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({ email: "", password: "" });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setError("");
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.email || !formData.password) {
      setError("Completá tu correo y contraseña.");
      return;
    }

    try {
      setLoading(true);
      await login(formData.email, formData.password);
      // "Bienvenido" le pone género a alguien de quien no sabemos el género, y
      // la app le habla de vos a todo el mundo: la mitad de los usuarios leían
      // un saludo que no era para ellos. Esto saluda igual de bien sin suponer.
      showSuccess("Qué bueno tenerte de vuelta");
      navigate("/");
    } catch (err) {
      const msg = err.response?.data?.message || "No se pudo iniciar sesión. Revisá tus datos.";
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
          {/* La marca, no una copa genérica: es la primera pantalla que ve
              alguien que abre la app, y el mismo monograma que va a tener en
              el ícono del teléfono, el splash y la barra. */}
          <span className="auth-brand__mark" aria-hidden="true">
            <Logo size={38} />
          </span>
          <h1 className="auth-brand__title">Rincones</h1>
          <p className="auth-brand__subtitle">Tu bodega personal, siempre en el bolsillo.</p>
        </div>

        {error && (
          <div className="auth-error" role="alert">
            <Icon name="alert-triangle" size={16} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
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
            <label className="auth-field__label" htmlFor="password">Contraseña</label>
            <PasswordInput
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              disabled={loading}
              autoComplete="current-password"
            />
          </div>

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? <span className="auth-spinner" aria-hidden="true" /> : <>Iniciar sesión <Icon name="arrow-right" size={18} /></>}
          </button>
        </form>

        <GoogleAuthButton mode="login" disabled={loading} />

        <div className="auth-footer">
          <div className="auth-footer__row">
            <span>¿No tenés cuenta?</span>
            <Link to="/register" className="auth-link">Crear cuenta</Link>
          </div>
          <Link to="/forgot-password" className="auth-link">¿Olvidaste tu contraseña?</Link>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
