import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getChangeLogs } from "../services/adminApi";
import ErrorState from "../components/ErrorState";
import AdminPager from "../components/AdminPager";
import Icon from "../components/Icon";

const ACTION_LABELS = { create: "Creado", update: "Actualizado", delete: "Eliminado" };

const ENTITY_LABELS = {
  wine: "Vino",
  review: "Reseña",
  promotion: "Campaña",
  user: "Cuenta",
};

/**
 * Qué pasó, en una línea.
 *
 * ── POR QUÉ ES MÁS CORTA QUE ANTES ──────────────────────────────────────────
 * La versión anterior devolvía una oración completa ("Se eliminó la cuenta de
 * fulano@mail.com.") Y ADEMÁS la fila mostraba, arriba, un título con ese mismo
 * mail y una chapa que ya decía "Eliminado". El dato aparecía tres veces en la
 * misma tarjeta, cada vez con otras palabras.
 *
 * En una tabla, la acción vive en su columna y la entidad en la suya. Esta
 * función se queda sólo con lo que ninguna columna puede decir: QUÉ objeto
 * concreto se tocó, y —cuando cambió algo que no se ve— qué cambió.
 */
const describirLog = (log) => {
  if (log.entityType === "user") {
    const target = log.after?.targetEmail || log.before?.email || "una cuenta";
    if (log.action === "update" && log.after?.role) {
      const antes = log.before?.role === "admin" ? "administrador" : "usuario";
      const ahora = log.after.role === "admin" ? "administrador" : "usuario";
      return `${target} · ${antes} → ${ahora}`;
    }
    return target;
  }
  if (log.entityType === "review") return log.before?.wine || "un vino";
  if (log.entityType === "promotion") return log.after?.title || log.before?.title || "una campaña";
  return log.after?.name || log.before?.name || "un vino";
};

const FILTROS_ENTIDAD = [
  { value: "", label: "Todo" },
  { value: "wine", label: "Vinos" },
  { value: "review", label: "Reseñas" },
  { value: "promotion", label: "Campañas" },
  { value: "user", label: "Cuentas" },
];

const FILTROS_ACCION = [
  { value: "", label: "Todas" },
  { value: "create", label: "Altas" },
  { value: "update", label: "Ediciones" },
  { value: "delete", label: "Bajas" },
];

const POR_PAGINA = 30;

const hora = (d) =>
  new Date(d).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

/** La fecha como rótulo de grupo: hoy y ayer se nombran, el resto va con fecha. */
const rotuloDeDia = (d) => {
  const fecha = new Date(d);
  const hoy = new Date();
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  const mismoDia = (a, b) => a.toDateString() === b.toDateString();
  if (mismoDia(fecha, hoy)) return "Hoy";
  if (mismoDia(fecha, ayer)) return "Ayer";
  return fecha.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
};

/**
 * El historial de auditoría.
 *
 * Pagina, filtra por entidad y por acción, y busca por texto — el uso real de
 * un log es encontrar algo puntual ("¿quién le sacó el admin a fulano?"), no
 * leer todo en orden.
 *
 * Se dibuja como tabla y agrupado por día. Ver el comentario largo de
 * `.admin-table` en styles/AdminLayout.css: eran tarjetas de cuatro renglones
 * cada una, o sea ciento veinte renglones de scroll por página.
 */
const AdminActivityPage = () => {
  const [searchParams] = useSearchParams();
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState("");
  /* El Resumen enlaza acá con la acción ya elegida ("Bajas: 12" abre el
     registro filtrado por bajas). Se lee una vez, al montar: a partir de ahí
     manda lo que la persona toque en los filtros, no la URL con la que entró. */
  const [action, setAction] = useState(() => {
    const desdeUrl = new URLSearchParams(searchParams).get("accion") || "";
    return ["create", "update", "delete"].includes(desdeUrl) ? desdeUrl : "";
  });
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await getChangeLogs({ page, limit: POR_PAGINA, entityType, action, q: query });
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

  /* Las filas ya vienen ordenadas por fecha desde el server, así que agrupar es
     recorrer una vez y marcar dónde cambia el día. */
  const porDia = useMemo(() => {
    const grupos = [];
    logs.forEach((log) => {
      const dia = rotuloDeDia(log.createdAt);
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.dia === dia) ultimo.filas.push(log);
      else grupos.push({ dia, filas: [log] });
    });
    return grupos;
  }, [logs]);

  const hayFiltros = Boolean(query || entityType || action);

  return (
    <section>
      <div className="admin-section-head">
        <h1>Actividad</h1>
      </div>

      {/* Buscar es lo que de verdad se usa con un registro largo: los filtros
          acotan el TIPO de movimiento, pero no ayudan a encontrar "qué pasó con
          este vino" entre miles de filas. Busca por el admin que actuó y por el
          nombre/mail/título de lo afectado (ver `q` en el server). */}
      <div className="admin-search">
        <Icon name="search" size={16} />
        <input
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(1); }}
          placeholder="Buscar por admin, vino, mail…"
          aria-label="Buscar en el registro"
        />
      </div>

      {/* Dos preguntas distintas, cada una con su rótulo. Antes eran nueve
          pastillas en una fila corrida, separadas por una línea de 1px puesta
          con un `style` inline: se leían como una sola lista de opciones. */}
      <div className="admin-filters">
        <div className="admin-filter-group" role="group" aria-label="Filtrar por tipo">
          <span className="admin-filter-group__label">Tipo</span>
          {FILTROS_ENTIDAD.map((f) => (
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
        </div>

        <div className="admin-filter-group" role="group" aria-label="Filtrar por acción">
          <span className="admin-filter-group__label">Acción</span>
          {FILTROS_ACCION.map((f) => (
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
      </div>

      {!loading && error && <ErrorState title={error} onRetry={load} compact />}

      {!loading && !error && logs.length === 0 && (
        <p className="admin-empty-state">
          {hayFiltros
            ? "Ningún movimiento coincide con estos filtros."
            : "Todavía no hay movimientos registrados."}
        </p>
      )}

      {!error && (loading || logs.length > 0) && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Hora</th>
                <th scope="col">Acción</th>
                <th scope="col">Tipo</th>
                <th scope="col">Qué</th>
                <th scope="col">Admin</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 8 }, (_, i) => (
                    <tr key={`skel-${i}`} className="admin-table__skel">
                      <td colSpan={5}><span /></td>
                    </tr>
                  ))
                : porDia.map((grupo) => (
                    // El fragmento agrupa el rótulo del día con sus filas sin
                    // meter un elemento extra: <tbody> ya está abierto y
                    // cualquier div acá rompería la tabla.
                    <Fragment key={grupo.dia}>
                      <tr className="admin-table__day">
                        <td colSpan={5}>{grupo.dia}</td>
                      </tr>
                      {grupo.filas.map((log) => (
                        <tr key={log._id}>
                          <td className="admin-table__num">{hora(log.createdAt)}</td>
                          <td>
                            <span className={`admin-log-badge admin-log-badge--${log.action}`}>
                              {ACTION_LABELS[log.action] || String(log.action || "").toUpperCase()}
                            </span>
                          </td>
                          <td>{ENTITY_LABELS[log.entityType] || log.entityType}</td>
                          <td className="admin-table__desc admin-table__id">{describirLog(log)}</td>
                          <td>{log.actor?.email || "—"}</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminPager
        page={page}
        pages={pagination.pages}
        total={pagination.total}
        onChange={setPage}
        label="movimientos"
      />
    </section>
  );
};

export default AdminActivityPage;
