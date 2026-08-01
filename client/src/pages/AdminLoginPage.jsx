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
        {/* ── El encabezado, en una barra ──────────────────────────────────────
            Ocupaba 630px de una pantalla de 740: el título, un párrafo, tres
            chips explicando qué puede hacer un admin y siete pestañas en cuatro
            filas. El 85% de la pantalla era encabezado.

            Lo que se fue es texto que se lee UNA vez: el párrafo de "estás
            editando datos de todos los usuarios" y los tres chips de permisos.
            Quien entra acá es el dueño de la app y ya sabe dónde está; el aviso
            de que esto es modo administrador queda en la chapa dorada, que es lo
            que cumple esa función sin ocupar cuatro renglones. */}
        <header className="admin-bar">
          <span className="admin-bar__badge" title="Estás operando sobre los datos de todos los usuarios">
            <Icon name="lock" size={12} /> Admin
          </span>

          <span className="admin-bar__who" title={user?.email}>{user?.email}</span>

          <div className="admin-bar__actions">
            <button className="admin-bar__btn" type="button" onClick={() => navigate("/")}>
              <Icon name="arrow-left" size={15} />
              <span>Ir a la app</span>
            </button>
            <button className="admin-bar__btn admin-bar__btn--out" type="button" onClick={logout}>
              <Icon name="log-out" size={15} />
              <span>Salir</span>
            </button>
          </div>
        </header>

        {/* Una sola fila que se desliza, en vez de cuatro apiladas. Es el patrón
            de pestañas de cualquier app con más de cuatro secciones: se ve dónde
            estás y que hay más al costado, sin gastar media pantalla. */}
        <nav className="admin-nav-tabs" aria-label="Secciones del panel">
          {[
            { id: "resumen", label: "Resumen", icon: "home" },
            /* Métricas va segunda: es la pregunta que uno se hace al abrir el
               panel ("¿cuánta gente está usando esto?"), antes de administrar
               nada. */
            { id: "metricas", label: "Métricas", icon: "star" },
            { id: "destacados", label: "Campañas", icon: "sparkle" },
            { id: "roles", label: "Usuarios", icon: "user" },
            { id: "resenas", label: "Reseñas", icon: "chat" },
            { id: "actividad", label: "Actividad", icon: "calendar" },
            /* "Vista app" se fue: hacía lo mismo que "Ir a la app" de la barra.
               Dos controles con el mismo efecto obligan a preguntarse en qué se
               diferencian, y la respuesta era "en nada". */
          ].map((t) => (
            <button
              key={t.id}
              className={`admin-nav-tab ${activeTab === t.id ? "active" : ""}`}
              /* La tira se desliza, así que la pestaña elegida puede quedar
                 cortada contra el borde. Se centra sola.

                 Se mueve `scrollLeft` de la tira y no `scrollIntoView`: éste
                 arrastra también el scroll de la página, así que al elegir una
                 pestaña la vista saltaba de lugar sin que nadie se lo pidiera. */
              ref={(el) => {
                if (!el || activeTab !== t.id) return;
                const tira = el.parentElement;
                if (!tira || tira.scrollWidth <= tira.clientWidth) return;
                // Se mide con posiciones reales y no con `offsetLeft`: éste se
                // cuenta desde el ancestro POSICIONADO más cercano, que acá no es
                // la tira, así que el número salía corrido y no centraba nada.
                const desfase =
                  el.getBoundingClientRect().left - tira.getBoundingClientRect().left;
                const centrado =
                  tira.scrollLeft + desfase - (tira.clientWidth - el.clientWidth) / 2;
                tira.scrollTo({ left: Math.max(centrado, 0), behavior: "smooth" });
              }}
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

              {/* Acá había una tarjeta de "Acciones rápidas" con tres botones
                  que llevaban a Usuarios, Reseñas y Vista app: las MISMAS
                  pestañas que están arriba, a dos centímetros. Un atajo hacia
                  algo que ya está a un toque no es un atajo, es una copia del
                  menú que hay que mantener sincronizada con él. */}
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
                {/* Una línea. El encabezado no es el lugar para enumerar lo que hace
                    la pantalla: eso se ve en la pantalla, y en un celular esas tres
                    oraciones eran cinco renglones que había que saltear cada vez. */}
                <h2>Campañas de Descubrí</h2>
                <p>Publicidades y eventos del espacio destacado.</p>
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
