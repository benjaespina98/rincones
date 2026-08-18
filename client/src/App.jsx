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

// Páginas cargadas de forma diferida para achicar el bundle inicial.
const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
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
const GuardadosPage = lazy(() => import("./pages/GuardadosPage"));
const AdminLoginPage = lazy(() => import("./pages/AdminLoginPage"));
const AdminLayout = lazy(() => import("./pages/AdminLayout"));
const AdminDashboardPage = lazy(() => import("./pages/AdminDashboardPage"));
const AdminUsersPage = lazy(() => import("./pages/AdminUsersPage"));
const AdminReviewsPage = lazy(() => import("./pages/AdminReviewsPage"));
const AdminMetricsPage = lazy(() => import("./pages/AdminMetricsPage"));
const AdminCampaignsPage = lazy(() => import("./pages/AdminCampaignsPage"));
const AdminActivityPage = lazy(() => import("./pages/AdminActivityPage"));

// Mismo lenguaje que el arranque: al saltar entre secciones lazy se ve la
// marca, no un spinner suelto sin contexto.
const RouteFallback = () => <SplashScreen label="Un momento" />;

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
          <Route path="usuarios" element={<AdminUsersPage />} />
          <Route path="resenas" element={<AdminReviewsPage />} />
          <Route path="actividad" element={<AdminActivityPage />} />
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

        {/* Mi bodega (antes era "/") — solo stock real (escaneado) */}
        <Route path="/bodega" element={withLayout("Mi Bodega", <BodyPage />)} />
        {/* Guardados = vinos que querés probar / favoritos (no los tenés) */}
        <Route path="/guardados" element={withLayout("Guardados", <GuardadosPage />)} />
        {/* Rutas viejas de favoritos → filtro dentro de bodega */}
        <Route path="/favoritos" element={<Navigate to="/bodega?filter=favorites" replace />} />

        {/* Sommelier (antes /explorar) y Agregar (antes /descubrir) */}
        <Route path="/sommelier" element={withLayout("Sommelier", <SuggestionsPage />)} />
        <Route path="/agregar" element={withLayout("Agregar vino", <ScanWinePage />)} />

        {/* Redirecciones de rutas viejas para no romper enlaces guardados */}
        <Route path="/explorar" element={<Navigate to="/sommelier" replace />} />
        <Route path="/descubrir" element={<Navigate to="/agregar" replace />} />

        <Route path="/perfil" element={withLayout("Perfil", <ProfilePage />)} />
        {/* Tus valoraciones tienen pantalla propia y no una sección más adentro
            del perfil: son una lista que crece sin techo. Ver RatingsPage. */}
        <Route path="/valoraciones" element={withLayout("Valoraciones", <RatingsPage />)} />
        <Route path="/vino/:id" element={withLayout("Vino", <WineDetailPage />)} />
        <Route path="/descubrir/vino" element={withLayout("Vino", <CatalogWinePage />)} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
