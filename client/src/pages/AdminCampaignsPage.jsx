import AdminPromotionsPage from "./AdminPromotionsPage";

// Mismo criterio que AdminMetricsPage: sólo el encabezado de sección, la
// pantalla de gestión de campañas ya estaba bien resuelta y no hacía falta
// tocarla para que viva en su propia ruta.
const AdminCampaignsPage = () => (
  <section>
    <div className="admin-section-head">
      <h1>Campañas de Descubrí</h1>
      <p>Publicidades y eventos del espacio destacado.</p>
    </div>
    <AdminPromotionsPage />
  </section>
);

export default AdminCampaignsPage;
