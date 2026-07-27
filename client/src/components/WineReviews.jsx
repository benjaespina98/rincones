import { useCallback, useEffect, useState } from "react";
import Icon from "./Icon";
import StarRating from "./StarRating";
import LoadingSkeleton from "./LoadingSkeleton";
import ErrorState from "./ErrorState";
import { useToast } from "../context/ToastContext";
import { getWineReviews, publishWineReview, deleteWineReview } from "../services/reviewApi";
import "./WineReviews.css";

/**
 * Reseñas de la comunidad para un vino.
 *
 * Distinción importante del producto: el rating con estrellas del vino y sus
 * notas son PRIVADOS. Una reseña es lo único que se publica, y sólo cuando el
 * usuario la escribe a propósito. Por eso el formulario dice explícitamente que
 * va a ser pública y con su nombre.
 */
export default function WineReviews({ name, winery = "" }) {
  const { showSuccess, showError } = useToast();

  const [state, setState] = useState({ summary: null, mine: null, reviews: [] });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!name) return;
    try {
      setLoading(true);
      setFailed(false);
      const data = await getWineReviews(name, winery);
      setState(data);
      setRating(data.mine?.rating || 0);
      setText(data.mine?.text || "");
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [name, winery]);

  useEffect(() => { load(); }, [load]);

  const publish = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (rating < 1) {
      showError("Elegí cuántas estrellas le das");
      return;
    }
    try {
      setSaving(true);
      await publishWineReview({ name, winery, rating, text });
      showSuccess(state.mine ? "Reseña actualizada" : "Reseña publicada");
      setEditing(false);
      await load();
    } catch (err) {
      showError(err?.response?.data?.message || "No se pudo publicar la reseña");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      setSaving(true);
      await deleteWineReview(name, winery);
      showSuccess("Reseña eliminada");
      setEditing(false);
      await load();
    } catch {
      showError("No se pudo eliminar la reseña");
    } finally {
      setSaving(false);
    }
  };

  const fmtDate = (d) =>
    d ? new Date(d).toLocaleDateString("es-AR", { month: "short", year: "numeric" }) : "";

  return (
    <section className="wine-reviews">
      <div className="wine-reviews__head">
        <h3><Icon name="chat" size={16} /> Lo que dice la comunidad</h3>
        {state.summary && (
          <div className="wine-reviews__summary">
            {/* StarRating ya imprime el número, no lo repetimos al lado. */}
            <StarRating value={state.summary.avg} size="sm" />
            <span className="wine-reviews__count">
              {state.summary.count} {state.summary.count === 1 ? "reseña" : "reseñas"}
            </span>
          </div>
        )}
      </div>

      {loading && <LoadingSkeleton type="inline" count={2} />}

      {!loading && failed && (
        <ErrorState
          title="No pudimos cargar las reseñas"
          hint="Probá de nuevo en un momento."
          onRetry={load}
          compact
        />
      )}

      {!loading && !failed && (
        <>
          {/* Tu reseña: publicar es explícito y se avisa que es pública. */}
          {!editing && !state.mine && (
            <button type="button" className="wine-reviews__cta" onClick={() => setEditing(true)}>
              <Icon name="pencil" size={15} /> Escribir mi reseña
            </button>
          )}

          {!editing && state.mine && (
            <article className="review-card review-card--mine">
              <div className="review-card__head">
                <span className="review-card__author">
                  <span className="review-card__avatar">{state.mine.authorAvatar || "🍷"}</span>
                  Tu reseña
                </span>
                <span className="review-card__date">{fmtDate(state.mine.updatedAt)}</span>
              </div>
              <StarRating value={state.mine.rating} size="sm" />
              {state.mine.text && <p className="review-card__text">{state.mine.text}</p>}
              <div className="review-card__actions">
                <button type="button" className="review-card__link" onClick={() => setEditing(true)}>
                  Editar
                </button>
                <button
                  type="button"
                  className="review-card__link review-card__link--danger"
                  onClick={remove}
                  disabled={saving}
                >
                  Eliminar
                </button>
              </div>
            </article>
          )}

          {editing && (
            <form className="review-form" onSubmit={publish}>
              <p className="review-form__notice">
                <Icon name="info" size={14} /> Tu reseña es <strong>pública</strong>: la va a ver
                quien busque este vino, con tu nombre. Tus notas privadas siguen siendo tuyas.
              </p>

              <div className="review-form__stars" role="group" aria-label="Tu puntuación">
                {[1, 2, 3, 4, 5].map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={`rating-input__star ${v <= rating ? "filled" : ""}`}
                    onClick={() => setRating(rating === v ? 0 : v)}
                    aria-label={`${v} ${v === 1 ? "estrella" : "estrellas"}`}
                    aria-pressed={v <= rating}
                    disabled={saving}
                  >
                    ★
                  </button>
                ))}
              </div>

              <textarea
                className="review-form__text"
                placeholder="¿A qué te supo? ¿Con qué lo tomaste? Contá lo que a vos te hubiera servido leer."
                aria-label="Tu reseña"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={1000}
                rows={4}
                disabled={saving}
              />
              <span className="review-form__counter">{text.length}/1000</span>

              <div className="review-form__actions">
                <button
                  type="button"
                  className="review-form__cancel"
                  onClick={() => {
                    setEditing(false);
                    setRating(state.mine?.rating || 0);
                    setText(state.mine?.text || "");
                  }}
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button type="submit" className="review-form__save" disabled={saving}>
                  {saving ? "Publicando…" : state.mine ? "Guardar cambios" : "Publicar reseña"}
                </button>
              </div>
            </form>
          )}

          {state.reviews.length > 0 && (
            <ul className="review-list">
              {state.reviews.map((r) => (
                <li key={r._id} className="review-card">
                  <div className="review-card__head">
                    <span className="review-card__author">
                      <span className="review-card__avatar">{r.authorAvatar || "🍷"}</span>
                      {r.authorName || "Alguien"}
                    </span>
                    <span className="review-card__date">{fmtDate(r.createdAt)}</span>
                  </div>
                  <StarRating value={r.rating} size="sm" />
                  {r.text && <p className="review-card__text">{r.text}</p>}
                </li>
              ))}
            </ul>
          )}

          {!state.summary && !editing && (
            <p className="wine-reviews__empty">
              Todavía nadie reseñó este vino. Si lo probaste, tu reseña puede ser la primera.
            </p>
          )}
        </>
      )}
    </section>
  );
}
