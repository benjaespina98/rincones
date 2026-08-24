import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAdminSummary } from "../services/adminApi";
import ErrorState from "../components/ErrorState";

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
  /**
   * Sin este estado, un fallo de red se veía como una app sin nadie adentro.
   *
   * El `catch` dejaba `resumen` en null y el render caía a un objeto de ceros,
   * así que la pantalla mostraba "0 usuarios · 0 vinos · 0 reseñas" con la
   * misma cara con la que muestra los números de verdad. En un panel de
   * administración eso no es un detalle estético: es la pantalla que se mira
   * para saber si algo se rompió, informando exactamente lo que informaría si
   * se hubiera roto TODO.
   */
  const [error, setError] = useState(false);

  /* La consulta, sin tocar `loading`/`error`: eso lo decide cada llamador.
     `vivo` es la bandera de "el componente sigue montado", y la pasa quien
     llama porque sólo el efecto sabe cuándo dejó de estarlo. */
  const pedir = (vivo = () => true) =>
    getAdminSummary(24)
      .then((data) => vivo() && setResumen(data))
      .catch(() => vivo() && setError(true))
      .finally(() => vivo() && setLoading(false));

  /* En el montaje no se toca el estado antes de pedir: `loading` ya arranca en
     true y `error` en false, así que volver a ponerlos sólo dispara un render
     de más — y es lo que marca la regla de hooks sobre setState sincrónico
     dentro de un efecto. */
  useEffect(() => {
    let montado = true;
    pedir(() => montado);
    return () => {
      montado = false;
    };
    // Sólo al montar: la consulta no depende de ningún estado.
  }, []);

  /* Reintentar sí necesita limpiar lo anterior: venimos de la pantalla de
     error y hay que volver al estado de carga. */
  const reintentar = () => {
    setLoading(true);
    setError(false);
    pedir();
  };

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
      </div>

      {error ? (
        <ErrorState
          title="No se pudieron cargar los números"
          hint="Es un problema de conexión con la API, no de los datos."
          onRetry={reintentar}
          compact
        />
      ) : loading ? (
        // Las mismas seis tarjetas en gris: la grilla no salta cuando llegan
        // los datos, y se ve de entrada cuánto viene en camino.
        <div className="admin-dashboard-grid" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <article key={i} className="admin-metric-card admin-metric-card--skel" />
          ))}
        </div>
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

          {/* El desglose lleva al registro, que es lo que se busca después de
              verlo: un número en un panel sólo sirve si se puede ir a mirar de
              qué está hecho. Cada chapa abre Actividad ya filtrada por esa
              acción. */}
          <article className="admin-wide-card">
            <h2>Últimas 24 horas</h2>
            <div className="admin-chip-row">
              <Link className="admin-chip" to="/admin/panel/actividad?accion=create">
                Altas: {metrics.activity.create}
              </Link>
              <Link className="admin-chip" to="/admin/panel/actividad?accion=update">
                Ediciones: {metrics.activity.update}
              </Link>
              <Link className="admin-chip" to="/admin/panel/actividad?accion=delete">
                Bajas: {metrics.activity.delete}
              </Link>
            </div>
          </article>
        </div>
      )}
    </section>
  );
};

export default AdminDashboardPage;
