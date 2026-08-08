import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRecommendations } from "../hooks/useRecommendations";
import { useWishlist } from "../hooks/useWishlist";
import { useToast } from "../context/ToastContext";
import { searchWines, classifyDish } from "../services/wineSearchApi";
import { resolveFood } from "../data/foodSynonyms";
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

  // Lo que el usuario escribió, y cómo lo entendimos. `reading` es lo que se le
  // muestra de vuelta: nunca clasificamos su plato en silencio.
  const [query, setQuery] = useState("");
  const [reading, setReading] = useState(null);
  const [resolving, setResolving] = useState(false);

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
      // El mismo veto que aplica el server sobre tu bodega: si la comida define
      // tipos, el vino tiene que ser de alguno. Faltaba acá, y se notaba —
      // buscar "Malbec" para un asado devolvía también los Malbec BLANCOS, que
      // el server jamás habría recomendado. Los de tipo desconocido pasan: no
      // sabemos que estén mal.
      const tiposOk = FOOD_PAIRINGS[ctx.food]?.types || [];
      const sirve = (wine) =>
        tiposOk.length === 0 || !wine.type || wine.type === "unknown" || tiposOk.includes(wine.type);

      const seen = new Set();
      const merged = [];
      // Intercalamos los varietales para no llenar la lista con uno solo. Se
      // recorre más hondo que los 6 que se muestran porque ahora el veto de tipo
      // descarta resultados: quedándonos en 3 por uva, un par de blancos mal
      // devueltos dejaban la sección casi vacía.
      for (let i = 0; i < 6; i += 1) {
        for (const batch of batches) {
          const wine = batch[i];
          if (!wine || seen.has(wine.id)) continue;
          if (!sirve(wine)) continue;
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

  // Tocar un chip es la vía rápida y sigue siendo un solo toque: no pasa por
  // ninguna traducción ni espera a nadie.
  const handleFood = (value) => {
    setReading(null);
    setQuery("");
    applyContext({ food: context.food === value ? null : value });
  };

  /**
   * Lo que escribiste a mano.
   *
   * Dos escalones, y el orden importa: primero la tabla local, que resuelve al
   * instante lo que la gente come de verdad; sólo si no la reconoce le
   * preguntamos a la IA. Así "milanesa" no espera nada y "risotto de hongos"
   * espera una vez en la vida de la app (después queda cacheado para todos).
   */
  const handleDish = async (event) => {
    event.preventDefault();
    const texto = query.trim();
    if (texto.length < 3 || resolving) return;

    const local = resolveFood(texto);
    if (local) {
      setReading({ text: texto, food: local.food, note: "" });
      applyContext({ food: local.food });
      return;
    }

    setResolving(true);
    try {
      const data = await classifyDish(texto);
      if (data?.food) {
        setReading({ text: texto, food: data.food, note: data.note || "" });
        applyContext({ food: data.food });
      } else {
        showError("No se pudo interpretar ese plato. Probá con alguna de las opciones de abajo.");
      }
    } catch {
      showError("No se pudo interpretar ese plato. Probá con uno de los clásicos de abajo.");
    } finally {
      setResolving(false);
    }
  };

  const resetAll = () => {
    setQuery("");
    setReading(null);
    clearContext();
  };

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
        <h1>¿Qué descorchamos?</h1>
        <p>Contame qué vas a comer y te digo cuál abrir.</p>
      </header>

      <section className="context-selector">
        {/* Escribir lo que sea es la vía principal, y los chips el atajo: en una
            barra de diez categorías, la comida de esta noche casi nunca está.
            La tabla local responde al instante; la IA sólo entra en lo raro. */}
        <form className="dish-field" onSubmit={handleDish}>
          <Icon name="utensils" size={17} className="dish-field__icon" />
          <input
            type="text"
            className="dish-field__input"
            placeholder="Milanesas, sushi, lo que estés por cocinar…"
            aria-label="Qué vas a comer"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            enterKeyHint="search"
          />
          <button
            type="submit"
            className="dish-field__go"
            disabled={query.trim().length < 3 || resolving}
            aria-label="Buscar el vino para ese plato"
          >
            {resolving ? <span className="dish-field__spin" aria-hidden="true" /> : <Icon name="arrow-right" size={17} />}
          </button>
        </form>

        {/* Cómo lo entendimos. Va siempre que la respuesta no salga de un chip:
            si tradujimos "risotto de hongos" a Pasta, el usuario tiene derecho a
            verlo y a corregirlo. */}
        {reading && (
          <p className="dish-reading">
            <Icon name="sparkles" size={13} />
            <span>
              <em>{reading.text}</em> — para eso vamos a{" "}
              <strong>{FOOD_LABELS[reading.food] || reading.food}</strong>
              {reading.note && <span className="dish-reading__note">{reading.note}</span>}
            </span>
          </p>
        )}

        <div className="context-group">
          <span className="context-label">O elegí de acá</span>
          {/* Una sola fila con scroll horizontal: diez chips en dos o tres
              renglones son una pared, y acá son el camino corto, no el menú. */}
          <div className="chip-rail">
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
          <button type="button" className="clear-context-btn" onClick={resetAll}>
            Empezar de nuevo
          </button>
        )}
      </section>

      <section className="suggestions-results">
        {!hasContext && (
          <EmptyState
            icon="wine-glass"
            title="Contame qué vas a comer"
            hint="Escribilo arriba o elegí de la lista: te digo qué abrir de tu bodega, y qué buscar si todavía no lo tenés."
            compact
          />
        )}

        {loading && <LoadingSkeleton type="list" count={3} />}
        {error && !loading && (
          <ErrorState
            title="No se pudieron armar las sugerencias"
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
                title="Para ese plato no tengo nada que ofrecerte"
                hint="Probá con otra comida, o buscá una botella puntual desde Agregar."
                compact
              />
            )}

            {!discoverLoading && discover.length > 0 && (
              <>
                <p className="suggestions-results__label">
                  {cellarWines.length > 0
                    ? "Para descubrir — argentinos que te irían"
                    : "Para descubrir — no lo tenés, pero le va"}
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
                            {/* Sólo la nota del catálogo, que habla de ESTE vino.
                                No hay línea de respaldo: "una de las uvas que le
                                van a este plato" era verdad para los seis
                                resultados —el maridaje es la condición para
                                entrar a la lista—, así que no distinguía ninguno
                                y se leía como lo que era, relleno. Sin nota, la
                                tarjeta se queda con el nombre, la bodega y los
                                datos, que ya dicen bastante. */}
                            {wine.note && (
                              <span className="discover-card__reason">
                                <Icon name="sparkles" size={12} />
                                {wine.note}
                              </span>
                            )}
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
