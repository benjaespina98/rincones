import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import WinePhoto from "../components/WinePhoto";
import Segmented from "../components/Segmented";
import LoadingSkeleton from "../components/LoadingSkeleton";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
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
  const { wishes, loading, error, removeWish, toggleWishFavorite, reload } = useWishlist();
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
      {/* El topbar ya dice "Guardados": repetirlo acá gastaba la línea más
          visible de la pantalla en información que el usuario ya tiene. Las
          otras pestañas usan ese lugar para decir algo útil, ésta no. */}
      {/* Sólo el número. El subtítulo explicaba el mecanismo completo de la
          pantalla ("cuando consigas uno, escaneálo para sumarlo a tu bodega") y
          eso ya lo dice el botón "Ya lo tengo" que hay en cada fila. Con la
          lista vacía el número no aporta, así que ahí no hay encabezado: el
          estado vacío de abajo es el que habla. */}
      {wishes.length > 0 && (
        <header className="guardados-header">
          <h2>{wishes.length} {wishes.length === 1 ? "vino guardado" : "vinos guardados"}</h2>
        </header>
      )}

      <Segmented
        ariaLabel="Qué guardados ver"
        value={filter}
        onChange={setFilter}
        options={[
          { id: "all", label: "Todos", count: wishes.length },
          {
            id: "favorites",
            label: (
              <>
                <Icon name="heart" filled={filter === "favorites"} size={13} /> Favoritos
              </>
            ),
            count: favCount,
          },
        ]}
      />

      {loading && <LoadingSkeleton type="list" count={4} />}

      {!loading && error && (
        <ErrorState
          title="No se pudieron cargar tus guardados"
          hint="Tus vinos siguen ahí. Revisá tu conexión y probá de nuevo."
          onRetry={reload}
        />
      )}

      {!loading && !error && visible.length === 0 && (
        <EmptyState
          icon="heart"
          title={
            filter === "favorites"
              ? "Todavía no marcaste favoritos"
              : "Todavía no guardaste ningún vino"
          }
          // Una línea, y sólo la que dice qué hacer. El texto largo explicaba
          // el producto entero ("cuando veas uno en Descubrí o en el Sommelier,
          // tocá 'Quiero probar' y aparece acá"): eso lo tiene que resolver el
          // botón de abajo, que lleva justo ahí.
          hint={
            filter === "favorites"
              ? "Marcá con el corazón los que quieras tener a mano."
              : "Guardá los vinos que quieras probar y quedan acá."
          }
          actionLabel={filter === "favorites" ? undefined : "Descubrir vinos"}
          onAction={filter === "favorites" ? undefined : () => navigate("/")}
          // La otra puerta: quien ya tiene la botella en la mano no viene a
          // anotarla, viene a cargarla.
          secondaryLabel={filter === "favorites" ? "Ver todos los guardados" : "Escanear una etiqueta"}
          onSecondary={
            filter === "favorites" ? () => setFilter("all") : () => navigate("/agregar")
          }
        />
      )}

      {!loading && !error && visible.length > 0 && (
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
                  <span className="guardados-card__meta chip-row">
                    {wish.type && wish.type !== "unknown" && (
                      <span className="chip chip--type">{WINE_TYPE_LABELS[wish.type]}</span>
                    )}
                    {wish.varietal && <span className="chip">{wish.varietal}</span>}
                    {wish.vintage && <span className="chip">{wish.vintage}</span>}
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
                  title="Escanear la etiqueta y sumarlo a tu bodega"
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
