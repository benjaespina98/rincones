import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useWishlist } from "../hooks/useWishlist";
import { useToast } from "../context/ToastContext";
import { getFeaturedWines } from "../services/wineSearchApi";
import { DISCOVER_CONTENT } from "../data/discoverContent";
import { WINE_TYPE_LABELS } from "../data/wineReference";
import { successHaptic, tapHaptic } from "../utils/haptics";
import Icon from "../components/Icon";
import WinePhoto from "../components/WinePhoto";
import LoadingSkeleton from "../components/LoadingSkeleton";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import "../styles/pages/DiscoverPage.css";

const greeting = () => {
  const h = new Date().getHours();
  if (h < 6) return "Buenas noches";
  if (h < 13) return "Buen día";
  if (h < 20) return "Buenas tardes";
  return "Buenas noches";
};

export default function DiscoverPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addWish } = useWishlist();
  const { showError, showSuccess } = useToast();

  const [featured, setFeatured] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [addingId, setAddingId] = useState(null);
  const [addedIds, setAddedIds] = useState(() => new Set());
  // Vino del día = el primero de los destacados (rota por día en el server).
  // "Sorprendeme" cambia el foco a uno al azar del set.
  const [spotlightIdx, setSpotlightIdx] = useState(0);
  const [surprised, setSurprised] = useState(false);

  // Esta es la home: si falla, hay que decirlo. Antes el error se tragaba y la
  // pantalla quedaba con un carrusel vacío, sin explicación ni salida.
  const loadFeatured = useCallback(() => {
    let active = true;
    setLoading(true);
    setLoadFailed(false);
    getFeaturedWines()
      .then((w) => active && setFeatured(w))
      .catch(() => active && setLoadFailed(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => loadFeatured(), [loadFeatured]);

  const name = (user?.email || "").split("@")[0] || "";

  const submitSearch = (e) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    tapHaptic();
    navigate(`/agregar?q=${encodeURIComponent(q)}`);
  };

  const spotlight = featured[spotlightIdx] || null;

  const surpriseMe = () => {
    if (featured.length < 2) return;
    tapHaptic();
    let next = spotlightIdx;
    while (next === spotlightIdx) next = Math.floor(Math.random() * featured.length);
    setSpotlightIdx(next);
    setSurprised(true);
  };

  // "Quiero probar": guarda el vino en Guardados (no en la bodega). La bodega
  // es solo stock real y entra únicamente por escaneo.
  const handleWant = async (wine) => {
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
      successHaptic();
      showSuccess(`"${wine.name}" guardado en tu lista`);
    } catch {
      showError("No se pudo guardar el vino. Probá de nuevo.");
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="discover-page">
      <header className="discover-hero">
        <p className="discover-hero__greeting">{greeting()}{name ? `, ${name}` : ""} 👋</p>
        <h1 className="discover-hero__title">¿Qué vino descubrimos hoy?</h1>

        <form className="discover-search" onSubmit={submitSearch} role="search">
          <span className="discover-search__icon" aria-hidden="true">
            <Icon name="search" size={18} />
          </span>
          <input
            type="search"
            className="discover-search__input"
            placeholder="Buscá un vino: Catena, Rutini, Torrontés…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar un vino"
          />
          <button type="submit" className="discover-search__go" aria-label="Buscar">
            <Icon name="arrow-right" size={18} />
          </button>
        </form>
      </header>

      {/* Vino del día: skeleton mientras carga, para que no aparezca de golpe. */}
      {loading && <div className="spotlight spotlight--skeleton" aria-hidden="true" />}

      {/* Vino del día / Sorpresa: tarjeta destacada dinámica */}
      {!loading && spotlight && (
        <section className="spotlight" key={spotlight.id}>
          <button
            type="button"
            className="spotlight__open"
            onClick={() => navigate("/descubrir/vino", { state: { wine: spotlight } })}
            aria-label={`Ver detalle de ${spotlight.name}`}
          >
            <div className="spotlight__art">
              <WinePhoto src={spotlight.image} type={spotlight.type} alt={spotlight.name} artSize={140} />
            </div>
            <div className="spotlight__body">
              <span className="spotlight__kicker">
                {surprised ? "🎲 Una sorpresa" : "✦ Vino del día"}
              </span>
              <h2 className="spotlight__name">{spotlight.name}</h2>
              <p className="spotlight__meta">
                {spotlight.winery}{spotlight.region ? ` · ${spotlight.region}` : ""}
              </p>
              {(spotlight.varietal || spotlight.type) && (
                <span className="spotlight__tags">
                  {spotlight.type && spotlight.type !== "unknown" && (
                    <span className="wine-type-badge">{WINE_TYPE_LABELS[spotlight.type]}</span>
                  )}
                  {spotlight.varietal && <span className="spotlight__grape">{spotlight.varietal}</span>}
                </span>
              )}
            </div>
          </button>
          <div className="spotlight__actions">
            <button
              type="button"
              className={`spotlight__add ${addedIds.has(spotlight.id) ? "is-added" : ""}`}
              onClick={() => handleWant(spotlight)}
              disabled={addingId === spotlight.id || addedIds.has(spotlight.id)}
            >
              {addedIds.has(spotlight.id) ? (
                <><Icon name="check" size={16} /> Guardado</>
              ) : (
                <><Icon name="heart" size={16} /> Quiero probar</>
              )}
            </button>
            <button type="button" className="spotlight__surprise" onClick={surpriseMe}>
              🎲 Sorprendeme
            </button>
          </div>
        </section>
      )}

      {/* Recomendados del catálogo argentino */}
      <section className="discover-section">
        <div className="discover-section__head">
          <h2>Recomendados para vos</h2>
          <span className="discover-section__hint">Vinos argentinos para sumar</span>
        </div>

        {loading ? (
          <LoadingSkeleton type="list" count={3} />
        ) : loadFailed ? (
          <ErrorState
            title="No pudimos traer las recomendaciones"
            hint="Puede ser tu conexión. Probá de nuevo en un momento."
            onRetry={loadFeatured}
            compact
          />
        ) : featured.length === 0 ? (
          <EmptyState
            icon="search"
            title="No hay recomendaciones ahora"
            hint="Volvé más tarde o buscá un vino que tengas en mente."
            compact
          />
        ) : (
          <div className="discover-rail">
            {featured.map((wine) => (
              <article key={wine.id} className="discover-wine">
                <button
                  type="button"
                  className="discover-wine__open"
                  onClick={() => navigate("/descubrir/vino", { state: { wine } })}
                  aria-label={`Ver detalle de ${wine.name}`}
                >
                  <div className="discover-wine__art">
                    <WinePhoto src={wine.image} type={wine.type} alt={wine.name} artSize={92} />
                    {wine.type && wine.type !== "unknown" && (
                      <span className="discover-wine__type">{WINE_TYPE_LABELS[wine.type]}</span>
                    )}
                  </div>
                </button>
                <div className="discover-wine__body">
                  <button
                    type="button"
                    className="discover-wine__namebtn"
                    onClick={() => navigate("/descubrir/vino", { state: { wine } })}
                  >
                    <p className="discover-wine__name" title={wine.name}>{wine.name}</p>
                  </button>
                  <p className="discover-wine__winery">{wine.winery}</p>
                  {wine.varietal && <p className="discover-wine__grape">{wine.varietal}</p>}
                  {wine.region && (
                    <p className="discover-wine__region">
                      <Icon name="map-pin" size={12} /> {wine.region}
                    </p>
                  )}
                  <button
                    type="button"
                    className={`discover-wine__add ${addedIds.has(wine.id) ? "is-added" : ""}`}
                    onClick={() => handleWant(wine)}
                    disabled={addingId === wine.id || addedIds.has(wine.id)}
                  >
                    {addedIds.has(wine.id) ? (
                      <><Icon name="check" size={15} /> Guardado</>
                    ) : addingId === wine.id ? (
                      "Guardando…"
                    ) : (
                      <><Icon name="heart" size={15} /> Quiero probar</>
                    )}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Aprendé, explorá, comunidad */}
      <section className="discover-section">
        <div className="discover-section__head">
          <h2>Aprendé y explorá</h2>
          <span className="discover-section__hint">Contenido para saber más de vino</span>
        </div>

        <div className="discover-content">
          {DISCOVER_CONTENT.map((group) => (
            <div key={group.id} className="content-group">
              <span className="content-group__label" style={{ color: group.accent }}>
                {group.label}
              </span>
              <div className="content-group__items">
                {group.items.map((item) => (
                  <a
                    key={item.title}
                    className="content-card"
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => tapHaptic()}
                    style={{ "--accent-content": group.accent }}
                  >
                    <span className="content-card__icon">
                      <Icon name={group.icon} size={18} />
                    </span>
                    <div className="content-card__text">
                      <span className="content-card__title">{item.title}</span>
                      <span className="content-card__subtitle">{item.subtitle}</span>
                    </div>
                    <Icon name="arrow-right" size={16} className="content-card__arrow" />
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="discover-foot">Curado para vos · más contenido en camino.</p>
      </section>
    </div>
  );
}
