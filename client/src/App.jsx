import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import PrivateRoute from "./components/PrivateRoute";
import AdminRoute from "./components/AdminRoute";
import AppGate from "./components/AppGate";
import AppLayout from "./components/AppLayout";
import PageviewTracker from "./components/PageviewTracker";
import SplashScreen from "./components/SplashScreen";
import { initAnalytics } from "./services/analyticsApi";
import { initPromoTracking } from "./services/promotionsApi";
import "./App.css";
// WineDetailPage y CatalogWinePage son dos rutas cargadas por separado (lazy)
// que comparten la misma hoja de estilos de la ficha. Cada una la importaba
// por su cuenta, y Rollup no puede compartir un CSS entre dos chunks
// independientes: lo duplicaba entero en los dos, así que alguien que visitara
// las dos pantallas en una sesión bajaba el mismo CSS dos veces. Importarla acá,
// en el bundle principal que ya se carga siempre, la deja en un solo lugar.
import "./styles/shared/WineDetailPage.css";

// Páginas cargadas de forma diferida para achicar el bundle inicial.
const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const PrivacidadPage = lazy(() => import("./pages/PrivacidadPage"));
const TerminosPage = lazy(() => import("./pages/TerminosPage"));
const VerifyEmailPage = lazy(() => import("./pages/VerifyEmailPage"));
const GoogleCallbackPage = lazy(() => import("./pages/GoogleCallbackPage"));
const VerifyRequiredPage = lazy(() => import("./pages/VerifyRequiredPage"));
const BirthdatePage = lazy(() => import("./pages/BirthdatePage"));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage"));
const PromoReportPage = lazy(() => import("./pages/PromoReportPage"));
const DiscoverPage = lazy(() => import("./pages/DiscoverPage"));
const BodyPage = lazy(() => import("./pages/BodyPage"));
const SuggestionsPage = lazy(() => import("./pages/SuggestionsPage"));
const ScanWinePage = lazy(() => import("./pages/ScanWinePage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const RatingsPage = lazy(() => import("./pages/RatingsPage"));
const WineDetailPage = lazy(() => import("./pages/WineDetailPage"));
const CatalogWinePage = lazy(() => import("./pages/CatalogWinePage"));
const AdminLoginPage = lazy(() => import("./pages/AdminLoginPage"));
const AdminLayout = lazy(() => import("./pages/AdminLayout"));
const AdminDashboardPage = lazy(() => import("./pages/AdminDashboardPage"));
const AdminUsersPage = lazy(() => import("./pages/AdminUsersPage"));
const AdminReviewsPage = lazy(() => import("./pages/AdminReviewsPage"));
const AdminMetricsPage = lazy(() => import("./pages/AdminMetricsPage"));
const AdminCampaignsPage = lazy(() => import("./pages/AdminCampaignsPage"));
const AdminWineImagesPage = lazy(() => import("./pages/AdminWineImagesPage"));
const AdminActivityPage = lazy(() => import("./pages/AdminActivityPage"));
const AdminLogsPage = lazy(() => import("./pages/AdminLogsPage"));

/**
 * El styleguide, sólo en desarrollo.
 *
 * `import.meta.env.DEV` es una constante que Vite reemplaza literalmente al
 * compilar, así que en el build de producción esto queda como `false &&
 * <Route …>` y Rollup se lleva la rama entera junto con el `import()` que
 * cuelga de ella: la página no entra al bundle ni como chunk aparte. No hay que
 * acordarse de sacarla antes de publicar, que es la única forma en que una
 * herramienta interna termina en producción.
 */
const StyleguidePage = import.meta.env.DEV
  ? lazy(() => import("./pages/StyleguidePage"))
  : null;

// Mismo lenguaje que el arranque: al saltar entre secciones lazy se ve la
// marca, no un spinner suelto sin contexto.
const RouteFallback = () => <SplashScreen label="Un momento" />;

/**
 * ── EL ARRANQUE ERA UNA FILA INDIA DE TRES ESPERAS ──────────────────────────
 *
 * Abrir la app hacía esto, una cosa después de la otra:
 *
 *   1. bajar el bundle y montar React
 *   2. preguntar `/auth/me` — mirando el splash, con la red QUIETA
 *   3. recién ahí, con la sesión resuelta, empezar a bajar el chunk de la
 *      pantalla (Descubrí o Mi Bodega, que son lazy)
 *   4. y recién ahí pedir los datos
 *
 * El paso 3 no depende del 2: la pantalla a la que vas a entrar es la misma
 * tengas sesión o no la tengas —si no la tenés, vas al login, que también es un
 * chunk—. Así que ese tiempo muerto del paso 2 se usa para ir bajando lo que se
 * va a necesitar sí o sí.
 *
 * Se piden las tres puertas de entrada reales y nada más: Descubrí (la home),
 * Mi Bodega (la que más se usa) y el login (adonde va quien no tenga sesión).
 * Bajar las trece pantallas sería pelearle ancho de banda a la que hace falta
 * ahora, que es justo lo contrario de lo que se busca.
 *
 * Va con `requestIdleCallback` para que ni siquiera compita con el primer
 * pintado: primero se ve algo, después se adelanta trabajo.
 */
const adelantarPantallas = () => {
  const traer = () => {
    import("./pages/DiscoverPage");
    import("./pages/BodyPage");
    import("./pages/LoginPage");
  };
  if (typeof window === "undefined") return undefined;
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(traer, { timeout: 1500 });
    return () => window.cancelIdleCallback?.(id);
  }
  // Safari todavía no tiene requestIdleCallback.
  const id = setTimeout(traer, 200);
  return () => clearTimeout(id);
};

const withLayout = (title, element) => (
  <PrivateRoute>
    <AppGate>
      <AppLayout pageTitle={title}>{element}</AppLayout>
    </AppGate>
  </PrivateRoute>
);

function App() {
  // Engancha el vaciado de la cola de métricas al ciclo de vida de la pestaña.
  // Devuelve su limpieza para que el doble montaje de StrictMode en desarrollo no
  // deje listeners duplicados (ver services/analyticsApi.js).
  useEffect(() => initAnalytics(), []);
  // Lo mismo para las impresiones de los destacados: si la pestaña se cierra con
  // la cola llena, se va con `sendBeacon` en vez de perderse. Son los números que
  // se le informan a un anunciante, así que no pueden depender de que la visita
  // haya durado lo suficiente.
  useEffect(() => initPromoTracking(), []);
  // Ver `adelantarPantallas`: el chunk de la pantalla baja mientras se resuelve
  // la sesión, en vez de esperar a que termine para recién empezar.
  useEffect(() => adelantarPantallas(), []);

  return (
    <Suspense fallback={<RouteFallback />}>
      <PageviewTracker />
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/admin" element={<AdminLoginPage />} />
        {/* Panel de admin: rutas de verdad bajo /admin/panel, cada sección con
            su propia URL (deep-link, botón atrás) en vez de pestañas armadas
            con estado local. `AdminRoute` exige sesión + rol admin, igual que
            `PrivateRoute` exige sesión para el resto de la app. */}
        <Route
          path="/admin/panel"
          element={<AdminRoute><AdminLayout /></AdminRoute>}
        >
          <Route index element={<AdminDashboardPage />} />
          <Route path="metricas" element={<AdminMetricsPage />} />
          <Route path="campanas" element={<AdminCampaignsPage />} />
          <Route path="fotos" element={<AdminWineImagesPage />} />
          <Route path="usuarios" element={<AdminUsersPage />} />
          <Route path="resenas" element={<AdminReviewsPage />} />
          <Route path="actividad" element={<AdminActivityPage />} />
          <Route path="logs" element={<AdminLogsPage />} />
        </Route>
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        {/* Se abre desde el link del mail: puede caer en un navegador sin
            sesión iniciada (otro dispositivo), así que va afuera de PrivateRoute. */}
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        {/* A donde vuelve el navegador después de "Continuar con Google"
            (redirect de página completa, no popup — ver utils/googleOAuth.js).
            Sin sesión todavía, igual que /verify-email. */}
        <Route path="/auth/google/callback" element={<GoogleCallbackPage />} />

        {/* El informe del anunciante. Sin sesión y sin la navegación de la app:
            lo abre alguien de afuera que sólo quiere ver sus números. */}
        <Route path="/informe/:token" element={<PromoReportPage />} />

        {/* Privacidad y términos, FUERA del gate de sesión.
            Alguien tiene que poder leer qué se hace con sus datos antes de
            crear la cuenta —que es justo cuando la decisión se toma— y también
            después de darse de baja. Por eso se alcanzan desde el pie del login
            y desde el perfil, y el enlace se puede compartir por mensaje. */}
        <Route path="/privacidad" element={<PrivacidadPage />} />
        <Route path="/terminos" element={<TerminosPage />} />

        {/* Gates obligatorios: necesitan sesión (por eso van con PrivateRoute),
            pero NO pasan por AppGate — si lo hicieran, cada una redirigiría a
            sí misma en loop. Sin AppLayout: son pantallas de tránsito, no
            secciones de la app, y no tienen sentido con tab bar. */}
        <Route
          path="/verificar-email"
          element={<PrivateRoute><VerifyRequiredPage /></PrivateRoute>}
        />
        <Route
          path="/fecha-nacimiento"
          element={<PrivateRoute><BirthdatePage /></PrivateRoute>}
        />
        <Route
          path="/onboarding"
          element={<PrivateRoute><OnboardingPage /></PrivateRoute>}
        />

        {/* Home = Descubrí (recomendaciones + contenido) */}
        <Route path="/" element={withLayout("Descubrí", <DiscoverPage />)} />

        {/* Mi bodega: las cuatro vistas de tu colección, incluida "Favoritos"
            (lo que tenés con el corazón puesto, más lo que todavía no tenés
            y anotaste para conseguir). */}
        <Route path="/bodega" element={withLayout("Mi Bodega", <BodyPage />)} />
        {/* "Guardados" era una pestaña propia y hoy es la vista "Favoritos" de
            la bodega. Quien tenga el enlace guardado aterriza donde esperaba. */}
        <Route path="/guardados" element={<Navigate to="/bodega?vista=quiero-probar" replace />} />
        {/* Ruta vieja de /favoritos: apuntaba a un filtro que ya no existe
            (`?filter=favorites`, un "sólo favoritos" adentro de "Todos"). Hoy
            "favorites" lo traduce BodyPage directo a la misma vista unificada
            de arriba — ver el estado inicial de `vista` en ese componente. */}
        <Route path="/favoritos" element={<Navigate to="/bodega?filter=favorites" replace />} />

        {/* Sommelier (antes /explorar) y Agregar (antes /descubrir) */}
        <Route path="/sommelier" element={withLayout("Sommelier", <SuggestionsPage />)} />
        <Route path="/agregar" element={withLayout("Agregar vino", <ScanWinePage />)} />

        {/* Redirecciones de rutas viejas para no romper enlaces guardados */}
        <Route path="/explorar" element={<Navigate to="/sommelier" replace />} />
        <Route path="/descubrir" element={<Navigate to="/agregar" replace />} />

        <Route path="/perfil" element={withLayout("Cuenta", <ProfilePage />)} />
        {/* Tus valoraciones tienen pantalla propia y no una sección más adentro
            del perfil: son una lista que crece sin techo. Ver RatingsPage. */}
        <Route path="/valoraciones" element={withLayout("Valoraciones", <RatingsPage />)} />
        <Route path="/vino/:id" element={withLayout("Vino", <WineDetailPage />)} />
        <Route path="/descubrir/vino" element={withLayout("Vino", <CatalogWinePage />)} />

        {/* Ver el comentario de StyleguidePage arriba: en producción esta
            línea se compila a nada. Va sin PrivateRoute a propósito — es una
            herramienta para mirar el sistema, no una pantalla de la app. */}
        {StyleguidePage && (
          <Route path="/styleguide" element={<StyleguidePage />} />
        )}

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
