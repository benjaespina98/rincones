import { useNavigate } from "react-router-dom";
import { useRecommendations } from "../hooks/useRecommendations";
import { useWineCollection } from "../hooks/useWineCollection";
import { WINE_TYPE_LABELS, FOOD_LABELS, MOOD_LABELS } from "../data/wineReference";
import StarRating from "../components/StarRating";
import LoadingSkeleton from "../components/LoadingSkeleton";
import "../styles/pages/SuggestionsPage.css";

const FOOD_OPTIONS = Object.entries(FOOD_LABELS).map(([value, label]) => ({ value, label }));
const MOOD_OPTIONS = Object.entries(MOOD_LABELS).map(([value, label]) => ({ value, label }));

export default function SuggestionsPage() {
  const navigate = useNavigate();
  const { wines } = useWineCollection();
  const { suggestions, loading, error, context, fetchSuggestions, clearContext } = useRecommendations();

  const hasContext = context.food || context.mood;

  const handleFood = (value) => {
    const newFood = context.food === value ? null : value;
    const newCtx = { ...context, food: newFood };
    if (newCtx.food || newCtx.mood) {
      fetchSuggestions(newCtx);
    } else {
      clearContext();
    }
  };

  const handleMood = (value) => {
    const newMood = context.mood === value ? null : value;
    const newCtx = { ...context, mood: newMood };
    if (newCtx.food || newCtx.mood) {
      fetchSuggestions(newCtx);
    } else {
      clearContext();
    }
  };

  const defaultWines = [...wines]
    .filter((w) => Number(w.quantity) > 0)
    .sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0))
    .slice(0, 3);

  const displayWines = hasContext ? suggestions : defaultWines;

  return (
    <div className="suggestions-page">
      <header className="page-header">
        <span className="section-eyebrow">Sommelier personal</span>
        <h1>¿Qué abrimos hoy?</h1>
        <p className="subtitle">Elegí el contexto y te sugiero de tu bodega</p>
      </header>

      <section className="context-selector">
        <div className="context-group">
          <span className="context-label">¿Con qué vas a comer?</span>
          <div className="chip-row">
            {FOOD_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={`context-chip ${context.food === value ? "context-chip--active" : ""}`}
                onClick={() => handleFood(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="context-group">
          <span className="context-label">¿Qué estilo buscás?</span>
          <div className="chip-row">
            {MOOD_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={`context-chip ${context.mood === value ? "context-chip--active" : ""}`}
                onClick={() => handleMood(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {hasContext && (
          <button type="button" className="clear-context-btn" onClick={clearContext}>
            Quitar filtros
          </button>
        )}
      </section>

      <section className="suggestions-results">
        {!hasContext && (
          <p className="suggestions-hint">
            Seleccioná una opción arriba para personalizar las sugerencias.
          </p>
        )}

        {loading && <LoadingSkeleton type="list" count={3} />}

        {error && <p className="suggestions-error">{error}</p>}

        {!loading && !error && displayWines.length === 0 && (
          <div className="suggestions-empty">
            <p className="empty-icon">🍷</p>
            <p className="empty-title">Sin resultados para este contexto</p>
            <p className="empty-subtitle">
              No tenés vinos con stock que coincidan. ¿Querés agregar uno?
            </p>
            <button
              type="button"
              className="empty-cta"
              onClick={() => navigate("/descubrir")}
            >
              Agregar vino
            </button>
          </div>
        )}

        {!loading && !error && displayWines.length > 0 && (
          <p className="suggestions-results__label">
            {hasContext ? "Sugerencias para vos" : "Destacados de tu bodega"}
          </p>
        )}

        {!loading && !error && displayWines.length > 0 && (
          <ul className="suggestions-list">
            {displayWines.map((wine) => (
              <li
                key={wine._id}
                className="suggestion-card"
                onClick={() => navigate(`/vino/${wine._id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && navigate(`/vino/${wine._id}`)}
              >
                <div className="suggestion-card__image">
                  {wine.image
                    ? <img src={wine.image} alt={wine.name} />
                    : <span aria-hidden="true">🍷</span>
                  }
                </div>

                <div className="suggestion-card__body">
                  <p className="suggestion-card__name">{wine.name}</p>
                  {wine.winery && (
                    <p className="suggestion-card__winery">{wine.winery}</p>
                  )}
                  <div className="suggestion-card__meta">
                    {wine.type && wine.type !== "unknown" && (
                      <span className="wine-type-badge">
                        {WINE_TYPE_LABELS[wine.type]}
                      </span>
                    )}
                    {wine.varietal && (
                      <span className="suggestion-card__varietal">{wine.varietal}</span>
                    )}
                    <span className="suggestion-card__stock">x{wine.quantity}</span>
                  </div>
                  {wine.rating > 0 && <StarRating value={wine.rating} size="sm" />}
                  {wine.matchReason && (
                    <p className="suggestion-card__reason">
                      <span aria-hidden="true">✨</span> {wine.matchReason}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
