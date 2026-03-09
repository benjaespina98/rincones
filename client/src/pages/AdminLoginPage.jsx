import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const AdminLoginPage = () => {
  const { login, isAdmin, user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const nextPath = location.state?.from || "/agregar";

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setLoading(true);
      setError("");
      await login(email, password);
      navigate(nextPath, { replace: true });
    } catch (requestError) {
      const message = requestError.response?.data?.message || "No se pudo iniciar sesion";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (isAdmin) {
    return (
      <section className="panel-card">
        <h1>Panel admin</h1>
        <p className="lead">Sesion iniciada como {user?.email}.</p>
        <div className="admin-actions">
          <button className="button" type="button" onClick={() => navigate("/agregar")}>
            Ir a agregar lugar
          </button>
          <button className="button button--danger" type="button" onClick={logout}>
            Cerrar sesion
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="panel-card">
      <span className="page-kicker">Acceso restringido</span>
      <h1>Acceso admin</h1>
      <p className="lead">Ingresa con usuario administrador para gestionar lugares.</p>

      <form className="place-form" onSubmit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>

        <label>
          Contrasena
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>

        {error && <p className="error-text">{error}</p>}

        <button className="button" type="submit" disabled={loading}>
          {loading ? "Ingresando..." : "Ingresar"}
        </button>
      </form>
    </section>
  );
};

export default AdminLoginPage;
