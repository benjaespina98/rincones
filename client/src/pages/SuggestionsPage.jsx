import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRecommendations } from "../hooks/useRecommendations";
import { useWishlist } from "../hooks/useWishlist";
import { useToast } from "../context/ToastContext";
import { searchWines } from "../services/wineSearchApi";
import { wineKey } from "../utils/text";
import Icon from "../components/Icon";
import StarRating from "../components/StarRating";
import LoadingSkeleton from "../components/LoadingSkeleton";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import WinePhoto from "../components/WinePhoto";
import {
  WINE_TYPE_LABELS,
  FOOD_LABELS,
  FOOD_PAIRINGS,
} from "../data/wineReference";
import "../styles/pages/SuggestionsPage.css";

const FOOD_OPTIONS = Object.entries(FOOD_LABELS).map(([value, label]) => ({ value, label }));

export default function SuggestionsPage() {
  const navigate = useNavigate();
  const { addWish } = useWishlist();
  const { showError, showSuccess } = useToast();
  const { suggestions, loading, error, context, fetchSuggestions, clearContext } =
    useRecommendations();

  // Descubrimiento: vinos argentinos del catálogo, para cuando la bodega no alcanza.
  const [discover, setDiscover] = useState([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [addingId, setAddingId] = useState(null);
  const [addedIds, setAddedIds] = useState(() => new Set());

  // Abre el detalle del vino de catálogo (no está en la bodega): le pasamos el
  // vino por router state para que la ficha no tenga que volver a buscarlo.
  const openCatalog = (wine) => navigate("/descubrir/vino", { state: { wine } });

  const hasContext = Boolean(context.food);

  // Sin contexto no mostramos nada de la bodega: el Sommelier sugiere solo
  // cuando elegís con qué vas a comer. Si entre las sugerencias hay vinos que
  // ya tenés, aparecen ahí (eso está bien), pero no se listan por defecto.
  // Memoizado porque alimenta el efecto que trae "Para descubrir": sin esto,
  // cada render creaba un array nuevo y la búsqueda se relanzaba en loop.
  const cellarWines = useMemo(() => (hasContext ? suggestions : []), [hasContext, suggestions]);

  // Buscamos en el catálogo los varietales que pegan con el contexto elegido.
  const loadDiscover = useCallback(async (ctx, yaLosTengo = new Set()) => {
    const varietals = [...(FOOD_PAIRINGS[ctx.food]?.varietals || [])];
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
          // "Para descubrir" es justamente lo que NO tenés: mostrar acá un vino
          // que ya está arriba en "De tu bodega" es decir dos veces lo mismo.
          if (yaLosTengo.has(wineKey(wine))) continue;
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
    loadDiscover(context, new Set(cellarWines.map(wineKey)));
  }, [context, hasContext, loadDiscover, cellarWines]);

  const applyContext = (patch) => {
    const next = { ...context, ...patch };
    if (next.food) fetchSuggestions(next);
    else clearContext();
  };

  const handleFood = (value) =>
    applyContext({ food: context.food === value ? null : value });

  // "Quiero probar": guarda el vino en Guardados (no en la bodega).
  const handleWantDiscover = async (wine) => {
    if (addingId || addedIds.has(wine.id)) return;
    try {
      setAddingId(wine.id);
      await addWish({
        name: wine.name,
        winery: wine.winery || "",
        region: wine.region || "",
        varietal: wine.varietal || "",
        type: wine.type || "unknown",
        image: wine.image || "",
        source: "recomendación",
      });
      setAddedIds((prev) => new Set(prev).add(wine.id));
      showSuccess(`"${wine.name}" guardado en tu lista`);
    } catch {
      showError("No se pudo guardar el vino. Probá de nuevo.");
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

        {hasContext && (
          <button type="button" className="clear-context-btn" onClick={clearContext}>
            Empezar de nuevo
          </button>
        )}
      </section>

      <section className="suggestions-results">
        {!hasContext && (
          <EmptyState
            icon="wine-glass"
            title="Contanos qué vas a comer"
            hint="Elegí un plato arriba y te decimos qué abrir de tu bodega — y qué probar si todavía no lo tenés."
            compact
          />
        )}

        {loading && <LoadingSkeleton type="list" count={3} />}
        {error && !loading && (
          <ErrorState
            title="No pudimos armar las sugerencias"
            hint="Probá de nuevo; si sigue, elegí otra comida."
            onRetry={() => fetchSuggestions(context)}
            compact
          />
        )}

        {!loading && !error && cellarWines.length > 0 && (
          <>
            <p className="suggestions-results__label">De tu bodega</p>
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
                    <div className="suggestion-card__meta chip-row">
                      {wine.type && wine.type !== "unknown" && (
                        <span className="chip chip--type">{WINE_TYPE_LABELS[wine.type]}</span>
                      )}
                      {wine.varietal && (
                        <span className="chip chip--grape">{wine.varietal}</span>
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

            {/* Si no hay nada de la bodega NI del catálogo, la pantalla quedaba
                literalmente en blanco después de elegir la comida. */}
            {!discoverLoading && discover.length === 0 && cellarWines.length === 0 && !error && (
              <EmptyState
                icon="search"
                title="No encontramos nada para ese plato"
                hint="Probá con otra comida, o buscá un vino puntual desde Agregar."
                compact
              />
            )}

            {!discoverLoading && discover.length > 0 && (
              <>
                <p className="suggestions-results__label">
                  {cellarWines.length > 0
                    ? "Para descubrir — vinos argentinos"
                    : "Para descubrir — todavía no lo tenés"}
                </p>
                <ul className="discover-list">
                  {discover.map((wine) => (
                    <li key={wine.id} className="discover-card">
                      <div className="discover-card__row">
                        <button
                          type="button"
                          className="discover-card__main"
                          onClick={() => openCatalog(wine)}
                        >
                          <span className="discover-card__thumb">
                            <WinePhoto src={wine.image} type={wine.type} alt={wine.name} artSize={48} />
                          </span>
                          <span className="discover-card__body">
                            <span className="discover-card__name">{wine.name}</span>
                            <span className="discover-card__winery">{wine.winery}</span>
                            <span className="discover-card__meta chip-row">
                              {wine.type && wine.type !== "unknown" && (
                                <span className="chip chip--type">{WINE_TYPE_LABELS[wine.type]}</span>
                              )}
                              {wine.varietal && (
                                <span className="chip">{wine.varietal}</span>
                              )}
                              {wine.vintage && (
                                <span className="chip">{wine.vintage}</span>
                              )}
                              {wine.region && (
                                <span className="chip">
                                  <Icon name="map-pin" size={12} /> {wine.region}
                                </span>
                              )}
                            </span>
                          </span>
                          <Icon name="arrow-right" size={18} className="discover-card__caret" />
                        </button>

                        <button
                          type="button"
                          className={`discover-card__add ${addedIds.has(wine.id) ? "is-added" : ""}`}
                          onClick={() => handleWantDiscover(wine)}
                          disabled={addingId === wine.id || addedIds.has(wine.id)}
                          aria-label={`Guardar ${wine.name} en tu lista`}
                          title="Quiero probar"
                        >
                          {addedIds.has(wine.id) ? <Icon name="check" size={16} /> : <Icon name="heart" size={16} />}
                        </button>
                      </div>
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
