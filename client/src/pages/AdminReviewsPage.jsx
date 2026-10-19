import { useCallback, useEffect, useState } from "react";
import { getReviews, deleteReview } from "../services/adminApi";
import { useToast } from "../context/ToastContext";
import ConfirmModal from "../components/ConfirmModal";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import StarRating from "../components/StarRating";
import Icon from "../components/Icon";
import { avatarColor } from "../utils/identity";
import "./AdminReviewsPage.css";

const RATING_FILTERS = [
  { value: "", label: "Todas" },
  { value: "2", label: "1-2 ★" },
  { value: "3", label: "3 ★ o menos" },
];

/**
 * Moderación de reseñas.
 *
 * Las reseñas son lo único que un usuario publica de cara al resto, así que es
 * lo único que puede necesitar moderación. Cada borrado queda registrado en el
 * log de cambios con quién lo hizo.
 */
const AdminReviewsPage = () => {
  const { showSuccess, showError } = useToast();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 0 });
  const [query, setQuery] = useState("");
  // Puntaje máximo a mostrar: "1-2 ★" busca lo que de verdad hay que revisar
  // primero, en vez de hacer scrollear todo en orden cronológico para
  // encontrarlo.
  const [maxRating, setMaxRating] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getReviews({ page, limit: 20, q: query, maxRating });
      setReviews(data.data);
      setPagination(data.pagination);
    } catch (err) {
      setError(err.response?.data?.message || "No se pudieron cargar las reseñas");
    } finally {
      setLoading(false);
    }
  }, [page, query, maxRating]);

  useEffect(() => {
    const t = setTimeout(load, query ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  const handleDelete = async () => {
    const review = confirmDelete;
    setConfirmDelete(null);
    if (!review) return;
    try {
      setBusyId(review._id);
      await deleteReview(review._id);
      showSuccess("Reseña eliminada");
      await load();
    } catch (err) {
      showError(err.response?.data?.message || "No se pudo eliminar la reseña");
    } finally {
      setBusyId(null);
    }
  };

  const formatDate = (d) =>
    d ? new Date(d).toLocaleDateString("es-AR", { year: "numeric", month: "short", day: "numeric" }) : "Sin fecha";

  return (
    <div className="admin-users">
      <header className="admin-reviews__header">
        <h1>Reseñas</h1>
      </header>

      <div className="admin-users__toolbar">
        <div className="admin-search">
          <Icon name="search" size={16} />
          <input
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder="Buscar por vino, autor o texto…"
            aria-label="Buscar reseñas"
          />
        </div>
        <div className="admin-reviews__rating-filter" role="group" aria-label="Filtrar por puntaje">
          {RATING_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`admin-chip ${maxRating === f.value ? "is-active" : ""}`}
              aria-pressed={maxRating === f.value}
              onClick={() => { setMaxRating(f.value); setPage(1); }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="admin-users__loading">Cargando reseñas…</p>}

      {!loading && error && (
        <ErrorState title="No se pudieron cargar las reseñas" onRetry={load} compact />
      )}

      {!loading && !error && reviews.length === 0 && (
        <EmptyState
          illustration="resenas"
          title={query || maxRating ? "Sin resultados" : "Todavía no hay reseñas"}
          hint={
            query
              ? `Ninguna reseña coincide con “${query}”.`
              : maxRating
                ? "No hay reseñas con este puntaje."
                : "Cuando los usuarios reseñen vinos, vas a poder moderarlas acá."
          }
          compact
        />
      )}

      {!loading && !error && reviews.length > 0 && (
        <ul className="admin-review-list">
          {reviews.map((r) => (
            <li key={r._id} className={`admin-review ${busyId === r._id ? "is-busy" : ""}`}>
              <div className="admin-review__head">
                <div className="admin-review__wine">
                  <span className="admin-review__name">{r.name}</span>
                  {r.winery && <span className="admin-review__winery">{r.winery}</span>}
                </div>
                <StarRating value={r.rating} size="sm" />
              </div>

              {r.text && <p className="admin-review__text">{r.text}</p>}

              <div className="admin-review__foot">
                <span className="admin-review__author">
                  {/* La inicial sobre el color del perfil, igual que en la
                      ficha del vino: el mismo dato no puede dibujarse de dos
                      formas según la pantalla. */}
                  <span
                    className={`admin-review__avatar avatar-color--${avatarColor(r.authorAvatar)}`}
                    aria-hidden="true"
                  >
                    {String(r.authorName || "?").trim().charAt(0).toUpperCase() || "?"}
                  </span>
                  {r.authorName || "Alguien"} · {formatDate(r.createdAt)}
                </span>
                <button
                  type="button"
                  className="admin-btn admin-btn--danger"
                  onClick={() => setConfirmDelete(r)}
                  disabled={busyId === r._id}
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pagination.pages > 1 && (
        <div className="admin-users__pagination">
          <button
            type="button"
            className="admin-btn"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Anterior
          </button>
          <span>Página {page} de {pagination.pages} · {pagination.total} en total</span>
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

      <ConfirmModal
        isOpen={confirmDelete !== null}
        title="¿Eliminar esta reseña?"
        message={
          confirmDelete
            ? `Se va a quitar la reseña de ${confirmDelete.authorName || "este usuario"} sobre "${confirmDelete.name}". Deja de verse para todos y queda registrado que la moderaste vos.`
            : ""
        }
        confirmText="Eliminar reseña"
        cancelText="Cancelar"
        isDangerous
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
};

export default AdminReviewsPage;
