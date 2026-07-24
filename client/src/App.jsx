import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import PrivateRoute from "./components/PrivateRoute";
import AppLayout from "./components/AppLayout";
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
const AdminLoginPage = lazy(() => import("./pages/AdminLoginPage"));

const RouteFallback = () => (
  <div className="page-loading" style={{ minHeight: "100vh" }}>
    <span className="spinner" aria-hidden="true" />
  </div>
);

const withLayout = (title, element) => (
  <PrivateRoute>
    <AppLayout pageTitle={title}>{element}</AppLayout>
  </PrivateRoute>
);

function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/admin" element={<AdminLoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Home = Descubrí (recomendaciones + contenido) */}
        <Route path="/" element={withLayout("Descubrí", <DiscoverPage />)} />

        {/* Mi bodega (antes era "/") */}
        <Route path="/bodega" element={withLayout("Mi Bodega", <BodyPage />)} />
        <Route path="/favoritos" element={withLayout("Favoritos", <BodyPage initialFilter="favorites" />)} />

        {/* Sommelier (antes /explorar) y Agregar (antes /descubrir) */}
        <Route path="/sommelier" element={withLayout("Sommelier", <SuggestionsPage />)} />
        <Route path="/agregar" element={withLayout("Agregar vino", <ScanWinePage />)} />

        {/* Redirecciones de rutas viejas para no romper enlaces guardados */}
        <Route path="/explorar" element={<Navigate to="/sommelier" replace />} />
        <Route path="/descubrir" element={<Navigate to="/agregar" replace />} />

        <Route path="/perfil" element={withLayout("Perfil", <ProfilePage />)} />
        <Route path="/vino/:id" element={withLayout("Vino", <WineDetailPage />)} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
