import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import BottomTabNavigation from "./BottomTabNavigation";
import Icon from "./Icon";
import { tapHaptic } from "../utils/haptics";
import { displayName, initials, isAdminUser } from "../utils/identity";
import { TAB_PATHS } from "../data/navigation";
import "../styles/AppLayout.css";

// Onboarding y verificación de email ya no se resuelven acá: son un gate de
// ruta (ver AppGate, montado en App.jsx antes de este layout) y no un aviso
// que pudiera perderse. Si `AppLayout` está en pantalla, las dos cosas ya
// están hechas — no hace falta volver a preguntarlo.
const AppLayout = ({ children, pageTitle }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // Los controles de volver sólo tienen sentido en pantallas de detalle;
  // en las pestañas principales la navegación es el propio tab bar.
  //
  // Se define por la NEGATIVA —"no es una pestaña"— y no listando las de
  // detalle, que es lo que había: con `startsWith("/vino")` la ficha del
  // catálogo (/descubrir/vino), el perfil y las valoraciones se quedaban sin
  // botón de volver, y en esas tres el tab bar tampoco marca nada, así que la
  // única salida era adivinar a qué pestaña ir. Con la regla al revés, cada
  // pantalla nueva que no sea pestaña nace con su salida puesta.
  const isSubScreen = !TAB_PATHS.has(location.pathname);
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
            {/* La foto de Google manda sobre las iniciales, igual que en el
                perfil: es la foto de verdad, no un símbolo derivado del nombre.
                `alt=""` porque el botón que la contiene ya se anuncia entero
                ("Ir a mi perfil (Benja)") — repetir el nombre acá lo diría dos
                veces seguidas. */}
            {user?.avatarPhoto ? (
              <img
                className="app-topbar__avatar app-topbar__avatar--photo"
                src={user.avatarPhoto}
                alt=""
              />
            ) : (
              <span className="app-topbar__avatar">{initials(user)}</span>
            )}
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
    </div>
  );
};

export default AppLayout;
