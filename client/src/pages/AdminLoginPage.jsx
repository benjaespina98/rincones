import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import Icon from "../components/Icon";
import { getChangeLogs, getUsers } from "../services/adminApi";
import AdminUsersPage from "./AdminUsersPage";
import AdminReviewsPage from "./AdminReviewsPage";
import AdminAnalyticsPage from "./AdminAnalyticsPage";
import AdminPromotionsPage from "./AdminPromotionsPage";
import "./styles/AdminLoginPage.css";

const ACTION_LABELS = {
  create: "Creado",
  update: "Actualizado",
  delete: "Eliminado",
};

const buildLogSummary = (log) => {
  const wineName = log.after?.name || log.before?.name || "un vino";

  if (log.action === "create") {
    return `Se agregó "${wineName}" a la bodega.`;
  }

  if (log.action === "delete") {
    return `Se eliminó "${wineName}" de la bodega.`;
  }

  if (log.action === "update") {
    return `Se actualizó "${wineName}".`;
  }

  return "";
};

const AdminLoginPage = () => {
  const { login, isAdmin, user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [logs, setLogs] = useState([]);
  const [usersSummary, setUsersSummary] = useState({ total: 0, admins: 0 });
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
          getUsers({ page: 1, limit: 100 }),
        ]);

        const sampleUsers = usersData.data || [];
        setLogs(logsData);
        setUsersSummary({
          total: usersData.pagination?.total || sampleUsers.length,
          // Conteo exacto que devuelve el server, no una estimación de la muestra.
          admins: usersData.meta?.admins ?? sampleUsers.filter((u) => u.role === "admin").length,
        });
      } catch {
        setLogs([]);
        setUsersSummary({ total: 0, admins: 0 });
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
      totalUsers: usersSummary.total,
      admins: usersSummary.admins,
      logsToday,
      createEvents,
      updateEvents,
      deleteEvents,
    };
  }, [logs, usersSummary]);

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

  if (isAdmin) {
    return (
      <div className="admin-shell">
        <section className="admin-hero">
          <div className="admin-hero__left">
            <span className="admin-kicker">
              <span className="admin-kicker__shield"><Icon name="lock" size={13} /></span>
              Modo administrador
            </span>
            <h1>Panel de Rincones</h1>
            <p>
              Estás viendo y editando datos de <strong>todos los usuarios</strong>, no sólo los tuyos.
            </p>
            <div className="admin-hero__session">
              <span className="admin-hero__avatar">{(user?.email || "?")[0].toUpperCase()}</span>
              <span className="admin-hero__who">
                <strong>{user?.email}</strong>
                <em>Permisos totales</em>
              </span>
            </div>
          </div>

          <div className="admin-hero__actions">
            <button className="button button--secondary" type="button" onClick={() => navigate("/")}>
              Salir a la app
            </button>
            <button className="button button--danger" type="button" onClick={logout}>Cerrar sesión</button>
          </div>
        </section>

        {/* Qué puede hacer un admin, en una línea. Antes había que deducirlo
            abriendo cada pestaña. */}
        <ul className="admin-powers">
          <li><Icon name="user" size={14} /> Cambiar roles y eliminar cuentas</li>
          <li><Icon name="chat" size={14} /> Borrar cualquier reseña pública</li>
          <li><Icon name="eye" size={14} /> Ver la actividad de todas las bodegas</li>
        </ul>

        <nav className="admin-nav-tabs" aria-label="Secciones del panel">
          {[
            { id: "resumen", label: "Resumen", icon: "home" },
            /* Métricas va segunda: es la pregunta que uno se hace al abrir el
               panel ("¿cuánta gente está usando esto?"), antes de administrar
               nada. */
            { id: "metricas", label: "Métricas", icon: "star" },
            { id: "destacados", label: "Destacados", icon: "sparkle" },
            { id: "roles", label: "Usuarios", icon: "user" },
            { id: "resenas", label: "Reseñas", icon: "chat" },
            { id: "actividad", label: "Actividad", icon: "calendar" },
            { id: "app", label: "Vista app", icon: "eye" },
          ].map((t) => (
            <button
              key={t.id}
              className={`admin-nav-tab ${activeTab === t.id ? "active" : ""}`}
              onClick={() => setActiveTab(t.id)}
              aria-current={activeTab === t.id ? "page" : undefined}
              type="button"
            >
              <Icon name={t.icon} size={16} /> {t.label}
            </button>
          ))}
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
                <span>Eventos 24h</span>
                <strong>{metrics.logsToday}</strong>
                <small>Actividad reciente</small>
              </article>

              <article className="admin-metric-card">
                <span>Administradores</span>
                <strong>{metrics.admins}</strong>
                <small>Con acceso a este panel</small>
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
                  <button className="button" type="button" onClick={() => setActiveTab("roles")}>Gestionar usuarios</button>
                  <button className="button" type="button" onClick={() => setActiveTab("resenas")}>Moderar reseñas</button>
                  <button className="button" type="button" onClick={() => setActiveTab("app")}>Abrir vista app</button>
                </div>
              </article>
            </div>
          )}

          {activeTab === "metricas" && (
            <section>
              <div className="admin-section-head">
                <h2>Métricas de uso</h2>
                <p>Cuánta gente entra a Rincones y qué mira. Sin cookies ni datos personales.</p>
              </div>
              <AdminAnalyticsPage />
            </section>
          )}

          {activeTab === "destacados" && (
            <section>
              <div className="admin-section-head">
                <h2>Destacados de Descubrí</h2>
                <p>Eventos y publicidades. Cada uno con su ventana de vigencia: se apagan solos cuando terminan.</p>
              </div>
              <AdminPromotionsPage />
            </section>
          )}

          {activeTab === "roles" && (
            <section>
              <div className="admin-section-head">
                <h2>Usuarios y roles</h2>
                <p>Buscá una cuenta, cambiale el rol o eliminala junto con todo su contenido.</p>
              </div>
              <AdminUsersPage embedded />
            </section>
          )}

          {activeTab === "resenas" && (
            <section>
              <div className="admin-section-head">
                <h2>Moderación de reseñas</h2>
                <p>Las reseñas son lo único público que escriben los usuarios. Cada baja queda registrada.</p>
              </div>
              <AdminReviewsPage embedded />
            </section>
          )}

          {activeTab === "actividad" && (
            <section>
              <div className="admin-section-head">
                <h2>Registro de actividad</h2>
                <p>Auditoría reciente de altas, ediciones y bajas en las bodegas de los usuarios.</p>
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
                        {log.after?.name || log.before?.name || "Vino"}
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
                  Como admin también podés recorrer las mismas secciones que un usuario para revisar UX y contenido.
                </p>
              </div>

              <div className="admin-view-grid">
                <article className="admin-view-card">
                  <h3>Mi Bodega</h3>
                  <p>Gestioná la colección y los guardados como usuario final.</p>
                  <button className="button" type="button" onClick={() => navigate("/bodega")}>Abrir bodega</button>
                </article>

                <article className="admin-view-card">
                  <h3>Sommelier</h3>
                  <p>Revisá las recomendaciones y las sugerencias.</p>
                  <button className="button" type="button" onClick={() => navigate("/sommelier")}>Abrir Sommelier</button>
                </article>

                <article className="admin-view-card">
                  <h3>Agregar</h3>
                  <p>Validá el flujo de escaneo y el alta de vinos.</p>
                  <button className="button" type="button" onClick={() => navigate("/agregar")}>Abrir Agregar</button>
                </article>

                <article className="admin-view-card">
                  <h3>Perfil</h3>
                  <p>Controlá la edición de perfil y el cierre de sesión.</p>
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
            {loading ? "Ingresando…" : "Ingresar al panel"}
          </button>
        </form>
      </div>
    </section>
  );
};

export default AdminLoginPage;
