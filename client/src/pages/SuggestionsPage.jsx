import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRecommendations } from "../hooks/useRecommendations";
import { useWineCollection } from "../hooks/useWineCollection";
import { useToast } from "../context/ToastContext";
import { searchWines } from "../services/wineSearchApi";
import Icon from "../components/Icon";
import StarRating from "../components/StarRating";
import LoadingSkeleton from "../components/LoadingSkeleton";
import WinePhoto from "../components/WinePhoto";
import {
  WINE_TYPE_LABELS,
  FOOD_LABELS,
  MOOD_LABELS,
  FOOD_PAIRINGS,
} from "../data/wineReference";
import "../styles/pages/SuggestionsPage.css";

const FOOD_OPTIONS = Object.entries(FOOD_LABELS).map(([value, label]) => ({ value, label }));
const MOOD_OPTIONS = Object.entries(MOOD_LABELS).map(([value, label]) => ({ value, label }));

// Varietales típicos por estilo, para poder sugerir del catálogo argentino
// cuando la bodega del usuario todavía no tiene nada que coincida.
const MOOD_VARIETALS = {
  liviano: ["Pinot Noir", "Torrontés", "Sauvignon Blanc"],
  robusto: ["Malbec", "Cabernet Sauvignon", "Tannat"],
  festivo: ["Extra Brut", "Chardonnay"],
  cualquiera: ["Malbec", "Torrontés"],
};

export default function SuggestionsPage() {
  const navigate = useNavigate();
  const { wines, addWine } = useWineCollection();
  const { showError, addToast } = useToast();
  const { suggestions, loading, error, context, fetchSuggestions, clearContext } =
    useRecommendations();

  // Descubrimiento: vinos argentinos del catálogo, para cuando la bodega no alcanza.
  const [discover, setDiscover] = useState([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [addingId, setAddingId] = useState(null);
  const [addedIds, setAddedIds] = useState(() => new Set());

  const hasContext = Boolean(context.food || context.mood);

  const defaultWines = [...wines]
    .filter((w) => Number(w.quantity) > 0)
    .sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0))
    .slice(0, 3);

  const cellarWines = hasContext ? suggestions : defaultWines;

  // Buscamos en el catálogo los varietales que pegan con el contexto elegido.
  const loadDiscover = useCallback(async (ctx) => {
    const varietals = [
      ...(FOOD_PAIRINGS[ctx.food]?.varietals || []),
      ...(MOOD_VARIETALS[ctx.mood] || []),
    ];
    const queries = [...new Set(varietals)].slice(0, 3);
    if (queries.length === 0) {
      setDiscover([]);
      return;
    }

    setDiscoverLoading(true);
    try {
      const batches = await Promise.all(
        queries.map((q) => searchWines(q).catch(() => []))
      );
      const seen = new Set();
      const merged = [];
      // Intercalamos los varietales para no llenar la lista con uno solo.
      for (let i = 0; i < 3; i += 1) {
        for (const batch of batches) {
          const wine = batch[i];
          if (!wine || seen.has(wine.id)) continue;
          seen.add(wine.id);
          merged.push(wine);
        }
      }
      setDiscover(merged.slice(0, 6));
    } finally {
      setDiscoverLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasContext) {
      setDiscover([]);
      return;
    }
    loadDiscover(context);
  }, [context, hasContext, loadDiscover]);

  const applyContext = (patch) => {
    const next = { ...context, ...patch };
    if (next.food || next.mood) fetchSuggestions(next);
    else clearContext();
  };

  const handleFood = (value) =>
    applyContext({ food: context.food === value ? null : value });

  const handleMood = (value) =>
    applyContext({ mood: context.mood === value ? null : value });

  const handleAddDiscover = async (wine) => {
    if (addingId || addedIds.has(wine.id)) return;
    try {
      setAddingId(wine.id);
      const created = await addWine({
        name: wine.name,
        winery: wine.winery || "",
        region: wine.region || "",
        varietal: wine.varietal || "",
        type: wine.type || "unknown",
        image: wine.image || "",
        quantity: 1,
      });
      setAddedIds((prev) => new Set(prev).add(wine.id));
      addToast(`"${created.name}" agregado a tu bodega`, "success", 5000, {
        label: "Ver",
        onClick: () => navigate(`/vino/${created._id}`),
      });
    } catch {
      showError("No se pudo agregar el vino. Probá de nuevo.");
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="suggestions-page">
      <header className="sommelier-header">
        <h1>¿Qué abrimos hoy?</h1>
        <p>Elegí el contexto y te sugerimos qué tomar.</p>
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
            Elegí una comida o un estilo y te decimos qué abrir.
          </p>
        )}

        {loading && <LoadingSkeleton type="list" count={3} />}
        {error && <p className="suggestions-error">{error}</p>}

        {!loading && !error && cellarWines.length > 0 && (
          <>
            <p className="suggestions-results__label">
              {hasContext ? "De tu bodega" : "Destacados de tu bodega"}
            </p>
            <ul className="suggestions-list">
              {cellarWines.map((wine) => (
                <li
                  key={wine._id}
                  className="suggestion-card"
                  onClick={() => navigate(`/vino/${wine._id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && navigate(`/vino/${wine._id}`)}
                >
                  <div className="suggestion-card__image">
                    <WinePhoto src={wine.image} type={wine.type} alt={wine.name} artSize={92} />
                  </div>

                  <div className="suggestion-card__body">
                    <p className="suggestion-card__name">{wine.name}</p>
                    {wine.winery && <p className="suggestion-card__winery">{wine.winery}</p>}
                    <div className="suggestion-card__meta">
                      {wine.type && wine.type !== "unknown" && (
                        <span className="wine-type-badge">{WINE_TYPE_LABELS[wine.type]}</span>
                      )}
                      {wine.varietal && (
                        <span className="suggestion-card__varietal">{wine.varietal}</span>
                      )}
                      <span className="suggestion-card__stock">x{wine.quantity}</span>
                    </div>
                    {wine.rating > 0 && <StarRating value={wine.rating} size="sm" />}
                    {wine.matchReason && (
                      <p className="suggestion-card__reason">
                        <Icon name="sparkles" size={13} /> {wine.matchReason}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Descubrimiento: no dejamos la pantalla vacía cuando la bodega no alcanza. */}
        {hasContext && !loading && (
          <>
            {discoverLoading && <LoadingSkeleton type="list" count={3} />}

            {!discoverLoading && discover.length > 0 && (
              <>
                <p className="suggestions-results__label">
                  {cellarWines.length > 0
                    ? "Para descubrir — vinos argentinos"
                    : "No tenés nada que pegue, pero probá estos"}
                </p>
                <ul className="discover-list">
                  {discover.map((wine) => (
                    <li key={wine.id} className="discover-card">
                      <div className="discover-card__body">
                        <p className="discover-card__name">{wine.name}</p>
                        <p className="discover-card__winery">{wine.winery}</p>
                        <div className="discover-card__meta">
                          {wine.type && wine.type !== "unknown" && (
                            <span className="wine-type-badge">{WINE_TYPE_LABELS[wine.type]}</span>
                          )}
                          {wine.region && (
                            <span className="discover-card__chip">
                              <Icon name="map-pin" size={12} /> {wine.region}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        className={`discover-card__add ${addedIds.has(wine.id) ? "is-added" : ""}`}
                        onClick={() => handleAddDiscover(wine)}
                        disabled={addingId === wine.id || addedIds.has(wine.id)}
                        aria-label={`Agregar ${wine.name} a mi bodega`}
                      >
                        {addedIds.has(wine.id) ? (
                          <Icon name="check" size={16} />
                        ) : (
                          <Icon name="plus" size={16} />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
