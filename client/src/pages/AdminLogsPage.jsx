import { Fragment, useCallback, useEffect, useState } from "react";
import { getErrorLogs } from "../services/adminApi";
import ErrorState from "../components/ErrorState";
import AdminPager from "../components/AdminPager";
import Icon from "../components/Icon";

const POR_PAGINA = 30;

const hora = (d) =>
  new Date(d).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * Los fallos del servidor.
 *
 * Es la otra mitad de Actividad: esa pantalla audita lo que HACE una persona
 * (crear, editar, borrar), ésta lo que se ROMPE — un 500, un timeout de
 * Gemini, una excepción que se escapó. Hasta ahora eso sólo vivía en la
 * consola de la terminal mientras el server corría; ver
 * server/errorLog.service.js para dónde queda ahora.
 *
 * Una fila por error, con la línea justa para reconocerlo (cuándo, qué ruta,
 * qué mensaje) y el stack completo detrás de un toque — es lo único que hace
 * falta para diagnosticar y pesa demasiado para vivir siempre a la vista.
 */
const AdminLogsPage = () => {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await getErrorLogs({ page, limit: POR_PAGINA, q: query, from, to });
      setLogs(res.data || []);
      setPagination(res.pagination || { page: 1, pages: 1, total: 0 });
    } catch {
      setError("No se pudieron cargar los logs");
    } finally {
      setLoading(false);
    }
  }, [page, query, from, to]);

  useEffect(() => {
    const t = setTimeout(load, query ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  const hayFiltros = Boolean(query || from || to);
  const limpiarFiltros = () => {
    setQuery("");
    setFrom("");
    setTo("");
    setPage(1);
  };

  return (
    <section>
      <div className="admin-section-head">
        <h1>Logs</h1>
      </div>

      <div className="admin-search">
        <Icon name="search" size={16} />
        <input
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(1); }}
          placeholder="Buscar por mensaje o ruta…"
          aria-label="Buscar en los logs"
        />
      </div>

      <div className="admin-filters">
        <div className="admin-filter-group admin-filter-group--dates" role="group" aria-label="Filtrar por fecha">
          <span className="admin-filter-group__label">Fecha</span>
          <input
            type="date"
            className="admin-date-input"
            value={from}
            max={to || undefined}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            aria-label="Desde"
          />
          <span className="admin-filter-group__sep" aria-hidden="true">a</span>
          <input
            type="date"
            className="admin-date-input"
            value={to}
            min={from || undefined}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
            aria-label="Hasta"
          />
        </div>

        {hayFiltros && (
          <button type="button" className="admin-chip admin-chip--clear" onClick={limpiarFiltros}>
            Limpiar filtros
          </button>
        )}
      </div>

      {!loading && error && <ErrorState title={error} onRetry={load} compact />}

      {!loading && !error && logs.length === 0 && (
        <p className="admin-empty-state">
          {hayFiltros
            ? "Ningún error coincide con estos filtros."
            : "Sin errores registrados. Buena señal."}
        </p>
      )}

      {!error && (loading || logs.length > 0) && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Cuándo</th>
                <th scope="col">Estado</th>
                <th scope="col">Ruta</th>
                <th scope="col">Mensaje</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 8 }, (_, i) => (
                    <tr key={`skel-${i}`} className="admin-table__skel">
                      <td colSpan={4}><span /></td>
                    </tr>
                  ))
                : logs.map((log) => {
                    const expanded = expandedId === log._id;
                    return (
                      <Fragment key={log._id}>
                        <tr
                          className="admin-table__row-clickable"
                          onClick={() => setExpandedId(expanded ? null : log._id)}
                          aria-expanded={expanded}
                        >
                          <td className="admin-table__num" data-label="Cuándo">{hora(log.createdAt)}</td>
                          <td data-label="Estado">
                            <span className="admin-log-badge admin-log-badge--delete">{log.statusCode || 500}</span>
                          </td>
                          <td className="admin-table__id" data-label="Ruta">{log.method} {log.route || "Sin dato"}</td>
                          <td className="admin-table__desc" data-label="Mensaje">{log.message}</td>
                        </tr>
                        {expanded && (
                          <tr>
                            <td colSpan={4}>
                              <pre className="admin-log-stack">{log.stack || "Sin stack disponible."}</pre>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
            </tbody>
          </table>
        </div>
      )}

      <AdminPager
        page={page}
        pages={pagination.pages}
        total={pagination.total}
        onChange={setPage}
        label="errores"
      />
    </section>
  );
};

export default AdminLogsPage;
