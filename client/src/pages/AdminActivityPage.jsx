import { useCallback, useEffect, useState } from "react";
import { getChangeLogs } from "../services/adminApi";
import ErrorState from "../components/ErrorState";
import Icon from "../components/Icon";

const ACTION_LABELS = { create: "Creado", update: "Actualizado", delete: "Eliminado" };

const ENTITY_LABELS = {
  wine: "Vinos",
  review: "Reseñas",
  promotion: "Campañas",
  user: "Usuarios",
};

/**
 * Qué contar de cada movimiento según de qué entidad se trate: un vino dice
 * su nombre, una acción sobre un usuario dice qué cuenta y qué cambió.
 * Antes esto asumía SIEMPRE "vino" (`log.after?.name || "un vino"`), y desde
 * que el rol/borrado de usuarios también audita acá esa frase mentía —
 * "Se actualizó el.mail@ejemplo.com" salía como si fuera un vino.
 */
const buildLogSummary = (log) => {
  if (log.entityType === "user") {
    const target = log.after?.targetEmail || log.before?.email || "una cuenta";
    if (log.action === "delete") return `Se eliminó la cuenta de ${target}.`;
    if (log.action === "update" && log.after?.role) {
      return `${target} ahora es ${log.after.role === "admin" ? "administrador" : "usuario"} (antes: ${log.before?.role || "usuario"}).`;
    }
    return `Se modificó la cuenta de ${target}.`;
  }

  if (log.entityType === "review") {
    const wine = log.before?.wine || "un vino";
    return `Se eliminó una reseña de "${wine}".`;
  }

  if (log.entityType === "promotion") {
    const title = log.after?.title || log.before?.title || "una campaña";
    if (log.action === "create") return `Se creó la campaña "${title}".`;
    if (log.action === "delete") return `Se eliminó la campaña "${title}".`;
    return `Se actualizó la campaña "${title}".`;
  }

  const wineName = log.after?.name || log.before?.name || "un vino";
  if (log.action === "create") return `Se agregó "${wineName}" a la bodega.`;
  if (log.action === "delete") return `Se eliminó "${wineName}" de la bodega.`;
  return `Se actualizó "${wineName}".`;
};

const logTitle = (log) => {
  if (log.entityType === "user") return log.after?.targetEmail || log.before?.email || "Cuenta";
  if (log.entityType === "review") return log.before?.wine || "Reseña";
  if (log.entityType === "promotion") return log.after?.title || log.before?.title || "Campaña";
  return log.after?.name || log.before?.name || "Vino";
};

/**
 * El historial de auditoría, navegable de verdad.
 *
 * Antes esto era "los últimos 30 movimientos" con un `limit` fijo: no había
 * forma de ver nada más viejo desde el panel. Ahora pagina, y además deja
 * filtrar por tipo de entidad y por acción — el uso real de un log es buscar
 * algo puntual ("¿quién le sacó el admin a fulano?"), no leer todo en orden.
 */
const AdminActivityPage = () => {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await getChangeLogs({ page, limit: 30, entityType, action, q: query });
      setLogs(res.data || []);
      setPagination(res.pagination || { page: 1, pages: 1, total: 0 });
    } catch {
      setError("No se pudo cargar la actividad");
    } finally {
      setLoading(false);
    }
  }, [page, entityType, action, query]);

  // Mismo debounce que Usuarios: escribir "fulano@" no dispara una consulta
  // por letra.
  useEffect(() => {
    const t = setTimeout(load, query ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  return (
    <section>
      <div className="admin-section-head">
        <h1>Registro de actividad</h1>
        <p>
          {pagination.total > 0
            ? `${pagination.total} movimientos registrados en total.`
            : "Todo lo que se creó, editó o borró en la app."}
        </p>
      </div>

      {/* Buscar es lo que de verdad se usa con un registro largo: los chips
          acotan el TIPO de movimiento, pero no ayudan a encontrar "qué pasó
          con este vino" entre miles de filas. Busca por el admin que actuó y
          por el nombre/mail/título de lo afectado (ver `q` en el server). */}
      <div className="admin-log-search">
        <Icon name="search" size={16} />
        <input
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(1); }}
          placeholder="Buscar por admin, vino, mail…"
          aria-label="Buscar en el registro"
        />
      </div>

      <div className="admin-log-filters">
        {[
          { value: "", label: "Todo" },
          { value: "wine", label: ENTITY_LABELS.wine },
          { value: "review", label: ENTITY_LABELS.review },
          { value: "promotion", label: ENTITY_LABELS.promotion },
          { value: "user", label: ENTITY_LABELS.user },
        ].map((f) => (
          <button
            key={f.value}
            type="button"
            className={`admin-chip ${entityType === f.value ? "is-active" : ""}`}
            aria-pressed={entityType === f.value}
            onClick={() => { setEntityType(f.value); setPage(1); }}
          >
            {f.label}
          </button>
        ))}
        <span style={{ width: 1, alignSelf: "stretch", background: "var(--line)" }} />
        {[
          { value: "", label: "Cualquier acción" },
          { value: "create", label: "Creaciones" },
          { value: "update", label: "Ediciones" },
          { value: "delete", label: "Bajas" },
        ].map((f) => (
          <button
            key={f.value}
            type="button"
            className={`admin-chip ${action === f.value ? "is-active" : ""}`}
            aria-pressed={action === f.value}
            onClick={() => { setAction(f.value); setPage(1); }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && <p className="admin-empty-state">Cargando actividad…</p>}

      {!loading && error && <ErrorState title={error} onRetry={load} compact />}

      {!loading && !error && logs.length === 0 && (
        <p className="admin-empty-state">
          {query ? `Nada coincide con "${query}".` : "No hay movimientos con estos filtros."}
        </p>
      )}

      {!loading && !error && logs.length > 0 && (
        <div className="admin-log-list">
          {logs.map((log) => (
            <article
              key={log._id}
              className={`admin-log-item ${log.entityType === "user" ? "admin-log-item--admin" : ""}`}
            >
              <div className="admin-log-item__head">
                <span className={`admin-log-badge admin-log-badge--${log.action}`}>
                  {ACTION_LABELS[log.action] || String(log.action || "").toUpperCase()}
                </span>
                {log.entityType === "user" && (
                  <span className="admin-log-item__admin-tag">Acción sobre cuenta</span>
                )}
                <small>{new Date(log.createdAt).toLocaleString("es-AR")}</small>
              </div>
              <strong className="admin-log-item__title">{logTitle(log)}</strong>
              <span className="admin-log-item__meta">Por {log.actor?.email || "admin"}</span>
              <p className="admin-log-item__summary">{buildLogSummary(log)}</p>
            </article>
          ))}
        </div>
      )}

      {pagination.pages > 1 && (
        <div className="admin-log-pagination">
          <button
            type="button"
            className="admin-btn"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Anterior
          </button>
          <span>Página {pagination.page} de {pagination.pages} · {pagination.total} en total</span>
          <button
            type="button"
            className="admin-btn"
            onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
            disabled={page >= pagination.pages}
          >
            Siguiente
          </button>
        </div>
      )}
    </section>
  );
};

export default AdminActivityPage;
