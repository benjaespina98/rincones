import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import BottomTabNavigation from "./BottomTabNavigation";
import OnboardingModal from "./OnboardingModal";
import Icon from "./Icon";
import { tapHaptic } from "../utils/haptics";
import { displayName, initials, isAdminUser } from "../utils/identity";
import "../styles/AppLayout.css";

const AppLayout = ({ children, pageTitle }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, refreshUser } = useAuth();
  const [onbDismissed, setOnbDismissed] = useState(false);

  // Onboarding: se muestra si el usuario nunca lo completó (flag del server).
  const showOnboarding = user && user.onboarded === false && !onbDismissed;

  // Los controles de volver sólo tienen sentido en pantallas de detalle;
  // en las pestañas principales la navegación es el propio tab bar.
  const isSubScreen = location.pathname.startsWith("/vino");
  const name = displayName(user);
  const admin = isAdminUser(user);

  const goToProfile = () => {
    tapHaptic();
    navigate("/perfil");
  };

  return (
    <div className="app-layout">
      <header className="app-topbar">
        {isSubScreen && (
          <div className="app-topbar__nav-controls">
            <button
              className="app-topbar__nav-btn"
              type="button"
              aria-label="Volver"
              title="Volver"
              onClick={() => navigate(-1)}
            >
              <Icon name="arrow-left" size={18} />
            </button>
          </div>
        )}

        <div className="app-topbar__title-wrap">
          <span className="app-topbar__brand">Rincones</span>
          <h1 className="app-topbar__title">{pageTitle}</h1>
        </div>

        <div className="app-topbar__actions">
          {/* Tocar el nombre lleva a la sección de perfil a pantalla completa
              (no un desplegable): configuración y cerrar sesión viven ahí. */}
          <button
            className="app-topbar__account"
            type="button"
            onClick={goToProfile}
            aria-label={`Ir a mi perfil (${name})`}
          >
            <span className="app-topbar__avatar">{initials(user)}</span>
            <span className="app-topbar__account-name">{name}</span>
            {/* El rol sólo se muestra si es admin: a un usuario común decirle
                "usuario" no le aporta nada. */}
            {admin && <span className="app-topbar__role">Admin</span>}
          </button>
        </div>
      </header>

      {/* key por ruta: al navegar, el contenido se remonta y hace un fade-in
          sutil (transición de página, sin librería). */}
      <main key={location.pathname} className="app-content app-content--with-topbar app-content--enter">
        {children}
      </main>
      <BottomTabNavigation />

      {showOnboarding && (
        <OnboardingModal
          onDone={() => {
            setOnbDismissed(true);
            refreshUser();
          }}
        />
      )}
    </div>
  );
};

export default AppLayout;
