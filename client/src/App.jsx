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

        {/* Private Routes with Bottom Tab Navigation */}
        <Route
          path="/"
          element={
            <PrivateRoute>
              <AppLayout pageTitle="Mi Bodega">
                <BodyPage />
              </AppLayout>
            </PrivateRoute>
          }
        />

        <Route
          path="/favoritos"
          element={
            <PrivateRoute>
              <AppLayout pageTitle="Favoritos">
                <BodyPage initialFilter="favorites" />
              </AppLayout>
            </PrivateRoute>
          }
        />

        <Route
          path="/explorar"
          element={
            <PrivateRoute>
              <AppLayout pageTitle="Explorar">
                <SuggestionsPage />
              </AppLayout>
            </PrivateRoute>
          }
        />

        <Route
          path="/descubrir"
          element={
            <PrivateRoute>
              <AppLayout pageTitle="Agregar vino">
                <ScanWinePage />
              </AppLayout>
            </PrivateRoute>
          }
        />

        <Route
          path="/perfil"
          element={
            <PrivateRoute>
              <AppLayout pageTitle="Perfil">
                <ProfilePage />
              </AppLayout>
            </PrivateRoute>
          }
        />

        <Route
          path="/vino/:id"
          element={
            <PrivateRoute>
              <AppLayout pageTitle="Vino">
                <WineDetailPage />
              </AppLayout>
            </PrivateRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
