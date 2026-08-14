import { useEffect, useState } from "react";
import { getAdminSummary } from "../services/adminApi";

/**
 * El Resumen: los números que responden "¿cuánto está creciendo esto?" antes
 * de administrar nada puntual. Contados por la base en cada request, no
 * deducidos de una muestra de movimientos recientes (ver el comentario en
 * `admin.controller.js#getSummary` sobre por qué la versión anterior se
 * quedaba pegada en 60).
 */
const AdminDashboardPage = () => {
  const [resumen, setResumen] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let vivo = true;
    getAdminSummary(24)
      .then((data) => vivo && setResumen(data))
      .catch(() => vivo && setResumen(null))
      .finally(() => vivo && setLoading(false));
    return () => {
      vivo = false;
    };
  }, []);

  const metrics = resumen || {
    users: 0,
    admins: 0,
    wines: 0,
    reviews: 0,
    activity: { total: 0, create: 0, update: 0, delete: 0 },
  };

  return (
    <section>
      <div className="admin-section-head">
        <h1>Resumen</h1>
        <p>Cómo está la app hoy, de un vistazo.</p>
      </div>

      {loading ? (
        <p className="admin-empty-state">Cargando el resumen…</p>
      ) : (
        <div className="admin-dashboard-grid">
          <article className="admin-metric-card">
            <span>Usuarios</span>
            <strong>{metrics.users}</strong>
            <small>Cuentas registradas</small>
          </article>

          <article className="admin-metric-card">
            <span>Vinos</span>
            <strong>{metrics.wines}</strong>
            <small>Cargados por los usuarios</small>
          </article>

          <article className="admin-metric-card">
            <span>Reseñas</span>
            <strong>{metrics.reviews}</strong>
            <small>Publicadas en la comunidad</small>
          </article>

          <article className="admin-metric-card">
            <span>Movimientos</span>
            <strong>{metrics.activity.total}</strong>
            <small>En las últimas 24 horas</small>
          </article>

          <article className="admin-metric-card">
            <span>Administradores</span>
            <strong>{metrics.admins}</strong>
            <small>Con acceso a este panel</small>
          </article>

          <article className="admin-wide-card">
            <h2>Qué pasó en las últimas 24 horas</h2>
            <div className="admin-chip-row">
              <span className="admin-chip">Se creó: {metrics.activity.create}</span>
              <span className="admin-chip">Se editó: {metrics.activity.update}</span>
              <span className="admin-chip">Se eliminó: {metrics.activity.delete}</span>
            </div>
          </article>
        </div>
      )}
    </section>
  );
};

export default AdminDashboardPage;
