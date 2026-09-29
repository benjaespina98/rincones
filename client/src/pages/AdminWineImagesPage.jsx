import { useCallback, useEffect, useState } from "react";
import { browseWineImages, searchWineImages, setWineImage } from "../services/adminApi";
import { useToast } from "../context/ToastContext";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import WinePhoto from "../components/WinePhoto";
import ImagePicker from "../components/ImagePicker";
import AdminPager from "../components/AdminPager";
import Icon from "../components/Icon";
import "./AdminWineImagesPage.css";

/** Misma clave que arma el pool en el server (nombre + bodega + uva). Sólo
 * para identificar qué fila se está editando del lado del cliente — la
 * comparación real de "es el mismo vino" la hace siempre el server. */
const rowKey = (w) => `${w.name}|${w.winery}|${w.varietal}`.toLowerCase();

const PHOTO_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "no", label: "Sin foto" },
  { value: "yes", label: "Con foto" },
];

/**
 * Curación de fotos: tener a mano TODO lo que la app conoce —catálogo
 * argentino + cada vino que cualquier usuario haya cargado alguna vez— y ver
 * de un vistazo qué tiene foto puesta en el pool y qué no. Precargarla no
 * requiere tener el vino en una bodega personal: sólo escribe en el pool
 * compartido, lo mismo que aportaría cualquier usuario al cargar el suyo.
 *
 * ── DOS BUSCADORES, NO UNO ───────────────────────────────────────────────
 * El de arriba filtra el universo completo (catálogo + app) en memoria del
 * lado del server: instantáneo, sin costo de Gemini, y es lo que responde a
 * "¿qué tengo sin foto?". Para el caso raro que ni así aparece —un nombre
 * que hace falta que un modelo interprete—, "Buscar con IA" es un paso
 * aparte, explícito: no se dispara solo, porque ahí sí hay cuota de por
 * medio.
 */
const AdminWineImagesPage = () => {
  const { showSuccess, showError } = useToast();

  const [query, setQuery] = useState("");
  const [hasPhotoFilter, setHasPhotoFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [aiResults, setAiResults] = useState(null); // null = todavía no se pidió
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  // Sólo una fila editable a la vez (sirve para las dos listas): simplifica
  // el estado y evita mandar dos fotos "en vuelo" para el mismo vino.
  const [editingKey, setEditingKey] = useState(null);
  const [draftImage, setDraftImage] = useState("");
  const [savingKey, setSavingKey] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const { data, pagination: p } = await browseWineImages({
        q: query,
        hasPhoto: hasPhotoFilter,
        page,
      });
      setResults(data);
      setPagination(p);
    } catch (err) {
      setError(err.response?.data?.message || "No se pudo cargar el catálogo");
    } finally {
      setLoading(false);
    }
  }, [query, hasPhotoFilter, page]);

  useEffect(() => {
    const t = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  // Escribir o cambiar el filtro vuelve a la página 1 — quedarse en la 5 de
  // una búsqueda que ahora tiene 2 páginas mostraría "no hay resultados"
  // sobre una lista que en realidad sí los tiene.
  useEffect(() => {
    setPage(1);
  }, [query, hasPhotoFilter]);

  // Un resultado de IA de la búsqueda anterior ya no responde a lo que hay
  // escrito ahora: se descarta en cuanto cambia el texto.
  useEffect(() => {
    setAiResults(null);
    setAiError("");
  }, [query]);

  const buscarConIA = async () => {
    const q = query.trim();
    if (q.length < 2) return;
    try {
      setAiLoading(true);
      setAiError("");
      const { data } = await searchWineImages(q);
      setAiResults(data);
    } catch (err) {
      setAiError(err.response?.data?.message || "No se pudo buscar");
    } finally {
      setAiLoading(false);
    }
  };

  const startEdit = (w) => {
    setEditingKey(rowKey(w));
    setDraftImage(w.poolImage || "");
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setDraftImage("");
  };

  const save = async (w) => {
    const key = rowKey(w);
    if (!draftImage.trim()) return;
    try {
      setSavingKey(key);
      const { data } = await setWineImage({
        name: w.name,
        winery: w.winery,
        varietal: w.varietal,
        image: draftImage,
      });
      // La misma fila puede vivir en las dos listas (universo + IA): se
      // actualizan las dos en vez de forzar un recargado completo.
      const actualizar = (r) => (rowKey(r) === key ? { ...r, poolImage: data.image } : r);
      setResults((prev) => prev.map(actualizar));
      setAiResults((prev) => (prev ? prev.map(actualizar) : prev));
      showSuccess(`Foto guardada para ${w.name}`);
      cancelEdit();
    } catch (err) {
      showError(err.response?.data?.message || "No se pudo guardar la foto");
    } finally {
      setSavingKey(null);
    }
  };

  const renderRow = (w) => {
    const key = rowKey(w);
    const isEditing = editingKey === key;
    const isSaving = savingKey === key;
    return (
      <li key={key} className={`admin-wineimg__row ${isSaving ? "is-busy" : ""}`}>
        <div className="admin-wineimg__main">
          <WinePhoto
            src={w.poolImage || w.catalogImage}
            type={w.type}
            artSize={40}
            className="admin-wineimg__thumb"
          />
          <div className="admin-wineimg__info">
            <span className="admin-wineimg__name">{w.name}</span>
            <span className="admin-wineimg__meta">
              {[w.winery, w.varietal].filter(Boolean).join(" · ") || "Sin más datos"}
            </span>
          </div>
          <span
            className={`admin-wineimg__badge ${w.poolImage ? "is-set" : ""}`}
            title={w.poolImage ? "Ya tiene foto en el pool" : "Todavía sin foto en el pool"}
          >
            {w.poolImage ? "En el pool" : "Sin foto"}
          </span>
          {!isEditing && (
            <button type="button" className="admin-btn" onClick={() => startEdit(w)}>
              {w.poolImage ? "Cambiar" : "Agregar foto"}
            </button>
          )}
        </div>

        {isEditing && (
          <div className="admin-wineimg__editor">
            <ImagePicker
              label="Foto del pool"
              value={draftImage}
              onChange={setDraftImage}
              hint="Cámara, galería o un enlace. Se guarda para todos los que busquen este vino."
              disabled={isSaving}
            />
            <div className="admin-wineimg__editor-actions">
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                onClick={cancelEdit}
                disabled={isSaving}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                onClick={() => save(w)}
                disabled={isSaving || !draftImage.trim()}
              >
                <Icon name="check" size={14} />
                {isSaving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="admin-wineimg">
      <header className="admin-wineimg__header">
        <h1>Fotos</h1>
        <p className="admin-wineimg__lead">
          Todo lo que Rincones conoce: el catálogo argentino y cada vino que cargó algún usuario.
          Elegí una foto y queda puesta para cualquiera que busque ese vino — no hace falta
          tenerlo en una bodega.
        </p>
      </header>

      <div className="admin-search">
        <Icon name="search" size={16} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrá por nombre, bodega o uva…"
          aria-label="Filtrar vinos"
        />
      </div>

      <div className="admin-chip-row">
        {PHOTO_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={`admin-chip ${hasPhotoFilter === f.value ? "is-active" : ""}`}
            aria-pressed={hasPhotoFilter === f.value}
            onClick={() => setHasPhotoFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && <p className="admin-wineimg__status">Cargando vinos…</p>}

      {!loading && error && <ErrorState title="No se pudo cargar" onRetry={load} compact />}

      {!loading && !error && results.length === 0 && (
        <EmptyState
          illustration="busqueda"
          title="Sin resultados"
          hint={
            query
              ? `Nada en el catálogo o en la app coincide con "${query}".`
              : "No hay vinos para este filtro."
          }
          compact
        />
      )}

      {!loading && !error && results.length > 0 && (
        <>
          <ul className="admin-wineimg__list">{results.map(renderRow)}</ul>
          <AdminPager
            page={page}
            pages={pagination.pages}
            total={pagination.total}
            onChange={setPage}
            label="vinos"
          />
        </>
      )}

      {/* Respaldo: sólo aparece con algo escrito, y nunca se dispara solo. */}
      {query.trim().length >= 2 && (
        <div className="admin-wineimg__ai">
          {aiResults === null && !aiLoading && (
            <button type="button" className="admin-btn admin-btn--ghost" onClick={buscarConIA}>
              <Icon name="sparkle" size={14} />
              ¿No está? Buscar con IA en todo el catálogo
            </button>
          )}

          {aiLoading && <p className="admin-wineimg__status">Buscando con IA…</p>}

          {!aiLoading && aiError && <ErrorState title="No se pudo buscar" onRetry={buscarConIA} compact />}

          {!aiLoading && aiResults && aiResults.length === 0 && (
            <EmptyState illustration="busqueda" title="La IA tampoco lo encontró" compact />
          )}

          {!aiLoading && aiResults && aiResults.length > 0 && (
            <>
              <h2 className="admin-wineimg__ai-title">Encontrado por IA</h2>
              <ul className="admin-wineimg__list">{aiResults.map(renderRow)}</ul>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminWineImagesPage;
