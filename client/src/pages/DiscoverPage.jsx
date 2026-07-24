import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useWineCollection } from "../hooks/useWineCollection";
import { useToast } from "../context/ToastContext";
import { getFeaturedWines } from "../services/wineSearchApi";
import { DISCOVER_CONTENT } from "../data/discoverContent";
import { WINE_TYPE_LABELS } from "../data/wineReference";
import { successHaptic, tapHaptic } from "../utils/haptics";
import Icon from "../components/Icon";
import WinePhoto from "../components/WinePhoto";
import LoadingSkeleton from "../components/LoadingSkeleton";
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
  const { addWine } = useWineCollection();
  const { showError, addToast } = useToast();

  const [featured, setFeatured] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [addingId, setAddingId] = useState(null);
  const [addedIds, setAddedIds] = useState(() => new Set());

  useEffect(() => {
    let active = true;
    getFeaturedWines()
      .then((w) => active && setFeatured(w))
      .catch(() => active && setFeatured([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const name = (user?.email || "").split("@")[0] || "";

  const submitSearch = (e) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    tapHaptic();
    navigate(`/agregar?q=${encodeURIComponent(q)}`);
  };

  const handleAdd = async (wine) => {
    if (addingId || addedIds.has(wine.id)) return;
    try {
      setAddingId(wine.id);
      const created = await addWine({
        name: wine.name,
        winery: wine.winery || "",
        region: wine.region || "",
        varietal: wine.varietal || "",
        type: wine.type || "unknown",
        quantity: 1,
      });
      setAddedIds((prev) => new Set(prev).add(wine.id));
      successHaptic();
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

      {/* Recomendados del catálogo argentino */}
      <section className="discover-section">
        <div className="discover-section__head">
          <h2>Recomendados para vos</h2>
          <span className="discover-section__hint">Vinos argentinos para sumar</span>
        </div>

        {loading ? (
          <LoadingSkeleton type="list" count={3} />
        ) : (
          <div className="discover-rail">
            {featured.map((wine) => (
              <article key={wine.id} className="discover-wine">
                <div className="discover-wine__art">
                  <WinePhoto src={wine.image} type={wine.type} alt={wine.name} artSize={92} />
                  {wine.type && wine.type !== "unknown" && (
                    <span className="discover-wine__type">{WINE_TYPE_LABELS[wine.type]}</span>
                  )}
                </div>
                <div className="discover-wine__body">
                  <p className="discover-wine__name" title={wine.name}>{wine.name}</p>
                  <p className="discover-wine__winery">{wine.winery}</p>
                  {wine.region && (
                    <p className="discover-wine__region">
                      <Icon name="map-pin" size={12} /> {wine.region}
                    </p>
                  )}
                  <button
                    type="button"
                    className={`discover-wine__add ${addedIds.has(wine.id) ? "is-added" : ""}`}
                    onClick={() => handleAdd(wine)}
                    disabled={addingId === wine.id || addedIds.has(wine.id)}
                  >
                    {addedIds.has(wine.id) ? (
                      <><Icon name="check" size={15} /> En tu bodega</>
                    ) : addingId === wine.id ? (
                      "Agregando…"
                    ) : (
                      <><Icon name="plus" size={15} /> Agregar</>
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
