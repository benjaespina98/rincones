import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useKeyboardInset } from "../hooks/useKeyboardInset";
import { useViewportGap } from "../hooks/useViewportGap";
import ViewportDebug from "./ViewportDebug";
import { useHeaderCollapse } from "../hooks/useHeaderCollapse";
import BottomTabNavigation from "./BottomTabNavigation";
import Icon from "./Icon";
import Logo from "./Logo";
import { tapHaptic } from "../utils/haptics";
import { displayName, initials, isAdminUser, avatarColor } from "../utils/identity";
import { TAB_PATHS } from "../data/navigation";
import { TopbarContext } from "../context/TopbarContext";
import "./AppLayout.css";

// Onboarding y verificación de email ya no se resuelven acá: son un gate de
// ruta (ver AppGate, montado en App.jsx antes de este layout) y no un aviso
// que pudiera perderse. Si `AppLayout` está en pantalla, las dos cosas ya
// están hechas — no hace falta volver a preguntarlo.
//
// ── QUÉ SE FUE DE LA BARRA DE ARRIBA ───────────────────────────────────────
// El rótulo "RINCONES" en versalitas que iba arriba del título, en las catorce
// pantallas. La marca en cada pantalla es lo que hace una web: una app ya está
// adentro de su ícono, y repetir el nombre arriba de "Mi Bodega" no le dice
// nada a alguien que ya la abrió. En escritorio el nombre sigue estando, una
// vez, arriba del sidebar.
//
// También se fue el nombre escrito al lado del avatar. Quedó el avatar solo:
// la foto es lo que se reconoce de un vistazo, el nombre propio es lo único de
// la pantalla que uno ya sabe con seguridad, y en pantallas chicas ya se
// ocultaba — o sea que el control tenía dos formas distintas según el ancho.
const AppLayout = ({ children, pageTitle }) => {
  const navigate = useNavigate();
  const location = useLocation();
  /* Descubrí es la raíz: es la pantalla con la que se abre la app. */
  const esInicio = location.pathname === "/";
  /* La ficha de un vino lleva su propio título (el nombre del vino): el genérico "Vino" sólo
     estorba. Se queda para lectores de pantalla, pero no se dibuja ni en el grande ni en la barra. */
  const tituloGenerico = /^\/(vino\/|descubrir\/vino)/.test(location.pathname);
  const { user } = useAuth();
  // Una sola vez para toda la app: la barra de abajo y cualquier compositor
  // fijo de pantalla (ver SuggestionsPage) comparten la misma variable CSS.
  useKeyboardInset();
  // Mide y corrige el viewport corto de iOS al abrir la PWA (ver utils/viewportGap.js).
  useViewportGap();
  /**
   * ── EL TÍTULO GRANDE VIVE EN EL CONTENIDO, NO EN LA BARRA ─────────────────
   *
   * Es el patrón de iOS, y acá además resuelve una restricción: el título
   * grande se va con el scroll solo, porque es contenido, y el de la barra
   * aparece por OPACIDAD. No hay que animar ni el alto de la barra ni el
   * tamaño de la fuente — las dos cosas obligarían al navegador a recalcular
   * layout en cada cuadro mientras el dedo arrastra, que es justo lo que no se
   * puede hacer en un teléfono.
   *
   * El `h1` es el grande: es el encabezado real de la pantalla y el que tiene
   * que leer un lector. El de la barra es un eco decorativo, y por eso va como
   * `span` con `aria-hidden` — si fuera otro `h1` la pantalla tendría dos.
   */
  const compacto = useHeaderCollapse();
  // Las ranuras de la barra: se guardan en estado para que las pantallas se enteren
  // cuando existen (un ref común no avisa) y puedan colgar sus acciones por portal.
  const [izquierda, setIzquierda] = useState(null);
  const [derecha, setDerecha] = useState(null);
  const ranuras = useMemo(() => ({ izquierda, derecha }), [izquierda, derecha]);

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
    <TopbarContext.Provider value={ranuras}>
    <div className={`app-layout${isSubScreen ? "" : " app-layout--titulo-en-barra"}`}>
      <header className={`app-topbar ${compacto ? "is-compacto" : ""}`}>
        {isSubScreen && (
          <button
            className="app-topbar__nav-btn"
            type="button"
            aria-label="Volver"
            title="Volver"
            onClick={() => navigate(-1)}
          >
            {/* Chevron y no flecha: es el gesto de "atrás" del sistema en iOS y
                en Android, y la flecha llena de la app significa "ir hacia
                adelante, a otra pantalla" en todas las filas. */}
            <Icon name="chevron-left" size={20} />
          </button>
        )}

        {/* El eco de la barra: aparece cuando el grande ya se fue. Decorativo,
            porque el encabezado de verdad es el h1 de abajo. */}
        <div className="app-topbar__ranura app-topbar__ranura--izq" ref={setIzquierda} />

        <span className="app-topbar__title" aria-hidden="true">
          {tituloGenerico ? "" : pageTitle}
        </span>

        {/* Tocar el avatar lleva a la sección de perfil a pantalla completa
            (no un desplegable): configuración y cerrar sesión viven ahí. */}
        <div className="app-topbar__ranura" ref={setDerecha} />

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
            <span className={`app-topbar__avatar avatar-color--${avatarColor(user?.avatar)}`}>
              {initials(user)}
            </span>
          )}
          {/* Un punto y no la palabra "Admin": es un recordatorio de con qué
              cuenta entraste, no un rótulo que haya que leer en cada pantalla.
              El nombre completo del rol está en el perfil, a un toque. */}
          {admin && <span className="app-topbar__admin-dot" aria-label="Cuenta de administrador" />}
        </button>
      </header>

      {/* key por ruta: al navegar, el contenido se remonta y hace un fade-in
          sutil (transición de página, sin librería). */}
      {/* key por ruta: al navegar, el contenido se remonta y hace un fade-in
          sutil (transición de página, sin librería). */}
      <main key={location.pathname} className="app-content app-content--with-topbar app-content--enter">
        {/* ── LA MARCA, SÓLO EN LA PANTALLA DE ENTRADA ──────────────────────
            El rótulo "RINCONES" se sacó de la barra de arriba hace varias
            fases, y con razón: repetir la marca en las catorce pantallas es lo
            que hace una web, no una app — una app ya está adentro de su ícono.
            Eso no cambia.

            Lo que sí cambia es la primera pantalla. Descubrí es donde se abre
            la app, y ahí el título grande decía "Descubrí" con el saludo justo
            abajo, también grande: dos encabezados seguidos peleando por la
            misma mirada. El monograma con el nombre ocupa ese lugar y resuelve
            las dos cosas — la marca aparece UNA vez, donde tiene sentido, y el
            saludo deja de competir.

            Dónde estás parado no se pierde: lo dicen la pestaña encendida
            abajo y el título de la barra cuando scrolleás. */}
        {esInicio ? (
          <h1 className="app-hero-title app-hero-title--marca">
            <Logo size={32} aria-hidden="true" />
            Rincones
          </h1>
        ) : (
          <h1 className={tituloGenerico ? "sr-only" : "app-hero-title"}>{pageTitle}</h1>
        )}
        {children}
      </main>
      <BottomTabNavigation />
      <ViewportDebug />
    </div>
    </TopbarContext.Provider>
  );
};

export default AppLayout;
