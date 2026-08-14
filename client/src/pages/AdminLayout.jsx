import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import Icon from "../components/Icon";
import "./styles/AdminLayout.css";

// El mismo menú en dos formas: sidebar fija de escritorio, tira que se
// desliza en celular. Un solo array evita que las dos versiones se
// desincronicen (ya pasó antes: la pantalla tenía "Vista app" en un lado y no
// en el otro).
const NAV_ITEMS = [
  { to: "/admin/panel", end: true, label: "Resumen", icon: "home" },
  { to: "/admin/panel/metricas", label: "Métricas", icon: "star" },
  { to: "/admin/panel/campanas", label: "Campañas", icon: "sparkle" },
  { to: "/admin/panel/usuarios", label: "Usuarios", icon: "user" },
  { to: "/admin/panel/resenas", label: "Reseñas", icon: "chat" },
  { to: "/admin/panel/actividad", label: "Actividad", icon: "calendar" },
];

/**
 * El armazón del panel: sidebar en escritorio, tira horizontal en celular,
 * con rutas de verdad debajo (`<Outlet/>`) en vez de pestañas armadas con
 * estado local. Cada sección tiene ahora su propia URL — se puede compartir
 * un link a "Usuarios" o volver atrás con el botón del navegador, cosa que
 * el panel anterior (una sola pantalla con `activeTab` en memoria) no podía.
 */
const AdminLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar__brand">
          <span className="admin-sidebar__badge" title="Estás operando sobre los datos de todos los usuarios">
            <Icon name="lock" size={13} /> Admin
          </span>
        </div>

        <nav className="admin-sidebar__nav" aria-label="Secciones del panel">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `admin-sidebar__link ${isActive ? "is-active" : ""}`}
            >
              <Icon name={item.icon} size={17} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar__foot">
          <span className="admin-sidebar__who" title={user?.email}>{user?.email}</span>
          <div className="admin-sidebar__actions">
            <button type="button" className="admin-bar__btn" onClick={() => navigate("/")}>
              <Icon name="arrow-left" size={15} />
              <span>Ir a la app</span>
            </button>
            <button type="button" className="admin-bar__btn admin-bar__btn--out" onClick={logout}>
              <Icon name="log-out" size={15} />
              <span>Salir</span>
            </button>
          </div>
        </div>
      </aside>

      <main className="admin-content">
        {/* La misma barra de la sidebar (chapa, email, salir), pero pensada
            para el ancho donde la sidebar se esconde — ver AdminLayout.css. */}
        <header className="admin-mobile-bar">
          <span className="admin-bar__badge">
            <Icon name="lock" size={12} /> Admin
          </span>
          <span className="admin-bar__who" title={user?.email}>{user?.email}</span>
          <div className="admin-bar__actions">
            <button type="button" className="admin-bar__btn" onClick={() => navigate("/")}>
              <Icon name="arrow-left" size={15} />
              <span>Ir a la app</span>
            </button>
            <button type="button" className="admin-bar__btn admin-bar__btn--out" onClick={logout}>
              <Icon name="log-out" size={15} />
              <span>Salir</span>
            </button>
          </div>
        </header>

        {/* Misma lista de secciones, en tira horizontal — visible sólo debajo
            del breakpoint donde entra la sidebar. */}
        <nav className="admin-nav-tabs" aria-label="Secciones del panel (celular)">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `admin-nav-tab ${isActive ? "active" : ""}`}
            >
              <Icon name={item.icon} size={16} /> {item.label}
            </NavLink>
          ))}
        </nav>

        <section className="admin-panel-surface">
          <Outlet />
        </section>
      </main>
    </div>
  );
};

export default AdminLayout;
