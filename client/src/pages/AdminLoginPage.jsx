import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import "./AdminLoginPage.css";

/**
 * Sólo el acceso. El panel en sí (Resumen, Usuarios, Reseñas…) vive ahora en
 * rutas propias bajo `/admin/panel/*`, protegidas por `AdminRoute` — esta
 * pantalla ya no decide qué mostrar según el rol, sólo inicia sesión y manda
 * para allá. Mismo login que el resto de la app (`/api/auth/login`): lo que
 * distingue "admin" es el rol de la cuenta, no un flujo de acceso aparte.
 */
const AdminLoginPage = () => {
  const { login, isAdmin, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const nextPath = location.state?.from || "/admin/panel";

  // Ya con sesión de admin abierta (volvió a /admin a mano, o recargó acá):
  // directo al panel, sin mostrarle el formulario de nuevo.
  useEffect(() => {
    if (user && isAdmin) navigate(nextPath, { replace: true });
  }, [user, isAdmin, navigate, nextPath]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setLoading(true);
      setError("");
      await login(email, password);
      navigate(nextPath, { replace: true });
    } catch (requestError) {
      const message = requestError.response?.data?.message || "No se pudo iniciar sesión";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="admin-login-screen">
      <div className="admin-login-card">
        <span className="admin-kicker">Acceso separado</span>
        <h1>Ingreso Administrador</h1>
        <p>
          Este acceso está reservado para cuentas con rol <strong>admin</strong>.
        </p>

        <form className="admin-login-form" onSubmit={handleSubmit}>
          <label htmlFor="admin-email">Email</label>
          <input
            id="admin-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="admin@rincones.app"
            required
          />

          <label htmlFor="admin-password">Contraseña</label>
          <input
            id="admin-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            required
          />

          {error && <p className="admin-error-text">{error}</p>}

          <button className="button button--primary admin-submit" type="submit" disabled={loading}>
            {loading ? "Ingresando…" : "Ingresar al panel"}
          </button>
        </form>
      </div>
    </section>
  );
};

export default AdminLoginPage;
