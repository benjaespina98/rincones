import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../context/ToastContext";
import Icon from "../components/Icon";
import Logo from "../components/Logo";
import PasswordInput from "../components/PasswordInput";
import GoogleAuthButton from "../components/GoogleAuthButton";
import { destinoTrasLogin } from "../utils/destinoTrasLogin";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import "./Auth.css";

const LoginPage = () => {
  useDocumentTitle("Ingresar");
  const navigate = useNavigate();
  const location = useLocation();
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
      showSuccess("Sesión iniciada");
      // Vuelve a la pantalla que quería abrir (si venía de un enlace), no siempre al inicio.
      navigate(destinoTrasLogin(location.state?.from));
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
          <p className="auth-brand__subtitle">Registro personal de tus vinos.</p>
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

          {/* Acá y no sólo en el perfil: la decisión de entregar tus datos se
              toma ANTES de crear la cuenta, así que los enlaces tienen que
              estar donde se toma. Apagados y chicos, porque son la letra que
              casi nadie lee y el que la busca la encuentra igual. */}
          <p className="auth-legal">
            <Link to="/terminos" className="auth-legal__link">Términos</Link>
            <span aria-hidden="true"> · </span>
            <Link to="/privacidad" className="auth-legal__link">Privacidad</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
