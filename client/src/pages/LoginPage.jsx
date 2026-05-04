import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../context/ToastContext";
import "./LoginPage.css";

const LoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { showError, showSuccess } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.email || !formData.password) {
      showError("Por favor completa todos los campos");
      return;
    }

    try {
      setLoading(true);
      await login(formData.email, formData.password);
      showSuccess("¡Bienvenido de vuelta!");
      navigate("/");
    } catch (error) {
      showError(error.response?.data?.message || "Error en autenticación");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <div className="login-icon">🍷</div>
          <h1>Rincones</h1>
          <p>Descubre y colecciona tus vinos favoritos</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email">Correo electrónico</label>
            <input
              id="email"
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="tu@email.com"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="••••••••"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="button button--primary button--block"
            disabled={loading}
          >
            {loading ? "Iniciando sesión..." : "Iniciar sesión"}
          </button>
        </form>

        <div className="login-footer">
          <p>¿No tienes cuenta?</p>
          <div style={{display:'flex', gap: '0.75rem', justifyContent: 'center'}}>
            <Link to="/register">Crear cuenta</Link>
            <Link to="/forgot-password">¿Olvidaste tu contraseña?</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
