import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import BottomTabNavigation from "./BottomTabNavigation";
import Icon from "./Icon";
import "../styles/AppLayout.css";

const getInitials = (email = "") => {
  if (!email) {
    return "U";
  }

  const parts = email.split("@")[0].split(/[._-]/).filter(Boolean);
  if (!parts.length) {
    return email[0].toUpperCase();
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
};

const AppLayout = ({ children, pageTitle }) => {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const canGoBack = typeof window !== "undefined" && window.history.length > 1;

  return (
    <div className="app-layout">
      <header className="app-topbar">
        <div className="app-topbar__nav-controls">
          <button
            className="app-topbar__nav-btn"
            type="button"
            aria-label="Volver"
            title="Volver"
            onClick={() => navigate(-1)}
            disabled={!canGoBack}
          >
            <Icon name="arrow-left" size={18} />
          </button>

          <button
            className="app-topbar__nav-btn"
            type="button"
            aria-label="Ir al inicio"
            title="Ir al inicio"
            onClick={() => navigate("/")}
          >
            <Icon name="home" size={18} />
          </button>
        </div>

        <div className="app-topbar__title-wrap">
          <span className="app-topbar__brand">Rincones</span>
          <h1 className="app-topbar__title">{pageTitle}</h1>
        </div>

        <div className="app-topbar__actions">
          {isAdmin && (
            <button
              className="app-topbar__admin-btn"
              type="button"
              onClick={() => navigate("/admin")}
            >
              Admin
            </button>
          )}

          <button
            className="app-topbar__avatar"
            type="button"
            onClick={() => navigate("/perfil")}
            aria-label="Ir al perfil"
            title={user?.email || "Perfil"}
          >
            {getInitials(user?.email)}
          </button>
        </div>
      </header>

      <main className="app-content app-content--with-topbar">{children}</main>
      <BottomTabNavigation />
    </div>
  );
};

export default AppLayout;
