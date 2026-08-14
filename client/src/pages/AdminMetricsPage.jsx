import AdminAnalyticsPage from "./AdminAnalyticsPage";

// Envoltorio fino: sólo agrega el encabezado de sección que antes ponía
// AdminLoginPage al montar la pestaña. AdminAnalyticsPage sigue siendo el
// tablero en sí — no hacía falta tocarlo para que viva en su propia ruta.
const AdminMetricsPage = () => (
  <section>
    <div className="admin-section-head">
      <h1>Métricas de uso</h1>
      <p>Cuánta gente entra a Rincones y qué mira. Sin cookies ni datos personales.</p>
    </div>
    <AdminAnalyticsPage />
  </section>
);

export default AdminMetricsPage;
