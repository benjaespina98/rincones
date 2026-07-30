import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import PrivateRoute from "./components/PrivateRoute";
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
const DiscoverPage = lazy(() => import("./pages/DiscoverPage"));
const BodyPage = lazy(() => import("./pages/BodyPage"));
const SuggestionsPage = lazy(() => import("./pages/SuggestionsPage"));
const ScanWinePage = lazy(() => import("./pages/ScanWinePage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const WineDetailPage = lazy(() => import("./pages/WineDetailPage"));
const CatalogWinePage = lazy(() => import("./pages/CatalogWinePage"));
const GuardadosPage = lazy(() => import("./pages/GuardadosPage"));
const AdminLoginPage = lazy(() => import("./pages/AdminLoginPage"));

// Mismo lenguaje que el arranque: al saltar entre secciones lazy se ve la
// marca, no un spinner suelto sin contexto.
const RouteFallback = () => <SplashScreen label="Un momento" />;

const withLayout = (title, element) => (
  <PrivateRoute>
    <AppLayout pageTitle={title}>{element}</AppLayout>
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
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

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
        <Route path="/vino/:id" element={withLayout("Vino", <WineDetailPage />)} />
        <Route path="/descubrir/vino" element={withLayout("Vino", <CatalogWinePage />)} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
