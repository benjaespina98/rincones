import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useLugares } from "../hooks/useLugares";
import { getChangeLogs, getUsers } from "../services/adminApi";
import AdminUsersPage from "./AdminUsersPage";
import "./styles/AdminLoginPage.css";

const ACTION_LABELS = {
  create: "Creado",
  update: "Actualizado",
  delete: "Eliminado",
};

const buildLogSummary = (log) => {
  const nombreLugar = log.after?.nombre || log.before?.nombre || "Registro";

  if (log.action === "create") {
    return `Se creó ${nombreLugar}.`;
  }

  if (log.action === "delete") {
    return `Se eliminó ${nombreLugar}.`;
  }

  if (log.action === "update") {
    return "Se actualizaron datos del registro.";
  }

  return "";
};

const AdminLoginPage = () => {
  const { login, isAdmin, user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { lugares } = useLugares();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [logs, setLogs] = useState([]);
  const [usersSummary, setUsersSummary] = useState({
    total: 0,
    adminsInSample: 0,
    sampleSize: 0,
  });
  const [activeTab, setActiveTab] = useState("resumen");

  const nextPath = location.state?.from || "/admin";

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const loadDashboardData = async () => {
      try {
        setLoadingDashboard(true);
        const [logsData, usersData] = await Promise.all([
          getChangeLogs(60),
          getUsers(1, 100),
        ]);

        const sampleUsers = usersData.data || [];
        setLogs(logsData);
        setUsersSummary({
          total: usersData.pagination?.total || sampleUsers.length,
          adminsInSample: sampleUsers.filter((item) => item.role === "admin").length,
          sampleSize: sampleUsers.length,
        });
      } catch {
        setLogs([]);
        setUsersSummary({ total: 0, adminsInSample: 0, sampleSize: 0 });
      } finally {
        setLoadingDashboard(false);
      }
    };

    loadDashboardData();
  }, [isAdmin]);

  const metrics = useMemo(() => {
    const now = Date.now();
    const dayWindow = 24 * 60 * 60 * 1000;
    const logsToday = logs.filter((item) => now - new Date(item.createdAt).getTime() <= dayWindow).length;
    const createEvents = logs.filter((item) => item.action === "create").length;
    const updateEvents = logs.filter((item) => item.action === "update").length;
    const deleteEvents = logs.filter((item) => item.action === "delete").length;

    return {
      totalPlaces: lugares.length,
      totalUsers: usersSummary.total,
      adminsInSample: usersSummary.adminsInSample,
      sampleSize: usersSummary.sampleSize,
      logsToday,
      createEvents,
      updateEvents,
      deleteEvents,
    };
  }, [logs, lugares.length, usersSummary]);

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
      <div className="admin-shell">
        <section className="admin-hero">
          <div className="admin-hero__left">
            <span className="admin-kicker">Panel de control</span>
            <h1>Administración Rincones</h1>
            <p>
              Gestiona roles, monitorea actividad y entra a la experiencia completa de usuario.
            </p>
            <small>Sesión activa: {user?.email}</small>
          </div>

          <div className="admin-hero__actions">
            <button className="button button--secondary" type="button" onClick={() => navigate("/")}>Ver app usuario</button>
            <button className="button button--danger" type="button" onClick={logout}>Cerrar sesión</button>
          </div>
        </section>

        <nav className="admin-nav-tabs">
          <button
            className={`admin-nav-tab ${activeTab === "resumen" ? "active" : ""}`}
            onClick={() => setActiveTab("resumen")}
            type="button"
          >
            Resumen
          </button>
          <button
            className={`admin-nav-tab ${activeTab === "roles" ? "active" : ""}`}
            onClick={() => setActiveTab("roles")}
            type="button"
          >
            Roles
          </button>
          <button
            className={`admin-nav-tab ${activeTab === "actividad" ? "active" : ""}`}
            onClick={() => setActiveTab("actividad")}
            type="button"
          >
            Logs
          </button>
          <button
            className={`admin-nav-tab ${activeTab === "app" ? "active" : ""}`}
            onClick={() => setActiveTab("app")}
            type="button"
          >
            Vista App
          </button>
        </nav>

        <section className="admin-panel-surface">
          {activeTab === "resumen" && (
            <div className="admin-dashboard-grid">
              <article className="admin-metric-card">
                <span>Usuarios</span>
                <strong>{metrics.totalUsers}</strong>
                <small>Total en sistema</small>
              </article>

              <article className="admin-metric-card">
                <span>Lugares</span>
                <strong>{metrics.totalPlaces}</strong>
                <small>Publicados</small>
              </article>

              <article className="admin-metric-card">
                <span>Eventos 24h</span>
                <strong>{metrics.logsToday}</strong>
                <small>Actividad reciente</small>
              </article>

              <article className="admin-metric-card">
                <span>Admins detectados</span>
                <strong>{metrics.adminsInSample}</strong>
                <small>Muestra de {metrics.sampleSize} usuarios</small>
              </article>

              <article className="admin-wide-card">
                <h2>Actividad por tipo</h2>
                <div className="admin-chip-row">
                  <span className="admin-chip">Creaciones: {metrics.createEvents}</span>
                  <span className="admin-chip">Actualizaciones: {metrics.updateEvents}</span>
                  <span className="admin-chip">Eliminaciones: {metrics.deleteEvents}</span>
                </div>
              </article>

              <article className="admin-wide-card">
                <h2>Acciones rápidas</h2>
                <div className="admin-action-grid">
                  <button className="button" type="button" onClick={() => setActiveTab("roles")}>Gestionar roles</button>
                  <button className="button" type="button" onClick={() => setActiveTab("actividad")}>Revisar logs</button>
                  <button className="button" type="button" onClick={() => navigate("/agregar")}>Agregar lugar</button>
                  <button className="button" type="button" onClick={() => setActiveTab("app")}>Abrir vista app</button>
                </div>
              </article>
            </div>
          )}

          {activeTab === "roles" && (
            <section>
              <div className="admin-section-head">
                <h2>Administración de roles</h2>
                <p>Promueve o revoca permisos de administración en segundos.</p>
              </div>
              <AdminUsersPage embedded />
            </section>
          )}

          {activeTab === "actividad" && (
            <section>
              <div className="admin-section-head">
                <h2>Registro de actividad</h2>
                <p>Auditoría reciente de operaciones sobre lugares y usuarios.</p>
              </div>

              {loadingDashboard ? (
                <p className="admin-empty-state">Cargando actividad...</p>
              ) : !logs.length ? (
                <p className="admin-empty-state">No hay movimientos registrados todavía.</p>
              ) : (
                <div className="admin-log-list">
                  {logs.map((log) => (
                    <article key={log._id} className="admin-log-item">
                      <div className="admin-log-item__head">
                        <span className={`admin-log-badge admin-log-badge--${log.action}`}>
                          {ACTION_LABELS[log.action] || String(log.action || "").toUpperCase()}
                        </span>
                        <small>{new Date(log.createdAt).toLocaleString("es-AR")}</small>
                      </div>
                      <strong className="admin-log-item__title">
                        {log.after?.nombre || log.before?.nombre || "Registro"}
                      </strong>
                      <span className="admin-log-item__meta">Por {log.actor?.email || "admin"}</span>
                      <p className="admin-log-item__summary">{buildLogSummary(log)}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {activeTab === "app" && (
            <section>
              <div className="admin-section-head">
                <h2>Vista de usuario común</h2>
                <p>
                  Como admin también puedes navegar exactamente las secciones de usuario para revisar UX y contenido.
                </p>
              </div>

              <div className="admin-view-grid">
                <article className="admin-view-card">
                  <h3>Mi Bodega</h3>
                  <p>Gestiona colección y favoritos como usuario final.</p>
                  <button className="button" type="button" onClick={() => navigate("/")}>Abrir bodega</button>
                </article>

                <article className="admin-view-card">
                  <h3>Explorar</h3>
                  <p>Revisa recomendaciones y tarjetas de sugerencias.</p>
                  <button className="button" type="button" onClick={() => navigate("/explorar")}>Abrir explorar</button>
                </article>

                <article className="admin-view-card">
                  <h3>Descubrir</h3>
                  <p>Valida flujo de escaneo y alta de vinos.</p>
                  <button className="button" type="button" onClick={() => navigate("/descubrir")}>Abrir descubrir</button>
                </article>

                <article className="admin-view-card">
                  <h3>Perfil</h3>
                  <p>Controla edición de perfil y cierre de sesión.</p>
                  <button className="button" type="button" onClick={() => navigate("/perfil")}>Abrir perfil</button>
                </article>
              </div>
            </section>
          )}
        </section>
      </div>
    );
  }

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
            {loading ? "Ingresando..." : "Ingresar al panel"}
          </button>
        </form>
      </div>
    </section>
  );
};

export default AdminLoginPage;
