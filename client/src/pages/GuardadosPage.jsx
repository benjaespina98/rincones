import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import WinePhoto from "../components/WinePhoto";
import LoadingSkeleton from "../components/LoadingSkeleton";
import { useToast } from "../context/ToastContext";
import { useWishlist } from "../hooks/useWishlist";
import { WINE_TYPE_LABELS } from "../data/wineReference";
import "../styles/pages/GuardadosPage.css";

// Guardados = vinos que querés probar / favoritos, que todavía NO tenés en la
// bodega. La bodega (stock real) solo entra por escaneo, así que acá no se crea
// stock: se guarda el deseo, se marca favorito, y "Ya lo tengo" te lleva a
// escanear la botella.
export default function GuardadosPage() {
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();
  const { wishes, loading, removeWish, toggleWishFavorite } = useWishlist();
  const [filter, setFilter] = useState("all"); // all | favorites
  const [busyId, setBusyId] = useState(null);

  const visible = useMemo(
    () => (filter === "favorites" ? wishes.filter((w) => w.favorite) : wishes),
    [wishes, filter]
  );
  const favCount = useMemo(() => wishes.filter((w) => w.favorite).length, [wishes]);

  const openDetail = (wish) =>
    navigate("/descubrir/vino", {
      state: {
        wine: {
          name: wish.name,
          winery: wish.winery,
          region: wish.region,
          varietal: wish.varietal,
          type: wish.type,
          image: wish.image,
          vintage: wish.vintage,
        },
      },
    });

  const handleFav = async (wish) => {
    try {
      setBusyId(wish._id);
      await toggleWishFavorite(wish._id, !wish.favorite);
    } catch {
      showError("No se pudo actualizar el favorito");
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (wish) => {
    try {
      await removeWish(wish._id);
      showSuccess(`"${wish.name}" quitado de Guardados`);
    } catch {
      showError("No se pudo quitar el vino");
    }
  };

  return (
    <div className="guardados-page">
      <header className="guardados-header">
        <h1>Guardados</h1>
        <p>Vinos que querés probar. Cuando consigas uno, escanealo para sumarlo a tu bodega.</p>
      </header>

      <div className="guardados-filters">
        <button
          type="button"
          className={`guardados-chip ${filter === "all" ? "is-active" : ""}`}
          onClick={() => setFilter("all")}
        >
          Todos {wishes.length > 0 && <span className="guardados-chip__count">{wishes.length}</span>}
        </button>
        <button
          type="button"
          className={`guardados-chip ${filter === "favorites" ? "is-active" : ""}`}
          onClick={() => setFilter("favorites")}
        >
          <Icon name="heart" filled size={13} /> Favoritos
          {favCount > 0 && <span className="guardados-chip__count">{favCount}</span>}
        </button>
      </div>

      {loading && <LoadingSkeleton type="list" count={4} />}

      {!loading && visible.length === 0 && (
        <div className="guardados-empty">
          <span className="guardados-empty__icon"><Icon name="heart" size={30} /></span>
          <p className="guardados-empty__title">
            {filter === "favorites" ? "Todavía no marcaste favoritos" : "Sin vinos guardados"}
          </p>
          <p className="guardados-empty__hint">
            Buscá o descubrí vinos y tocá <strong>Quiero probar</strong> para guardarlos acá.
          </p>
          <button type="button" className="guardados-empty__cta" onClick={() => navigate("/")}>
            <Icon name="sparkles" size={16} /> Descubrir vinos
          </button>
        </div>
      )}

      {!loading && visible.length > 0 && (
        <ul className="guardados-list">
          {visible.map((wish) => (
            <li key={wish._id} className="guardados-card">
              <button type="button" className="guardados-card__main" onClick={() => openDetail(wish)}>
                <span className="guardados-card__thumb">
                  <WinePhoto src={wish.image} type={wish.type} alt={wish.name} artSize={64} />
                </span>
                <span className="guardados-card__body">
                  <span className="guardados-card__name">{wish.name}</span>
                  {wish.winery && <span className="guardados-card__winery">{wish.winery}</span>}
                  <span className="guardados-card__meta">
                    {wish.type && wish.type !== "unknown" && (
                      <span className="wine-type-badge">{WINE_TYPE_LABELS[wish.type]}</span>
                    )}
                    {wish.varietal && <span className="guardados-card__chip">{wish.varietal}</span>}
                    {wish.vintage && <span className="guardados-card__chip">{wish.vintage}</span>}
                  </span>
                </span>
                <Icon name="arrow-right" size={18} className="guardados-card__caret" />
              </button>

              <div className="guardados-card__actions">
                <button
                  type="button"
                  className={`guardados-fav ${wish.favorite ? "is-active" : ""}`}
                  onClick={() => handleFav(wish)}
                  disabled={busyId === wish._id}
                  aria-label={wish.favorite ? "Quitar de favoritos" : "Marcar favorito"}
                  title="Favorito"
                >
                  <Icon name="heart" filled={wish.favorite} size={17} />
                </button>
                <button
                  type="button"
                  className="guardados-have"
                  onClick={() => navigate("/agregar")}
                  title="Ya lo tengo: escanealo para sumarlo a tu bodega"
                >
                  <Icon name="camera" size={15} /> Ya lo tengo
                </button>
                <button
                  type="button"
                  className="guardados-remove"
                  onClick={() => handleRemove(wish)}
                  aria-label={`Quitar ${wish.name} de Guardados`}
                  title="Quitar"
                >
                  <Icon name="x" size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
