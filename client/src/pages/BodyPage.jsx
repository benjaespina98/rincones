import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ConfirmModal from "../components/ConfirmModal";
import Icon from "../components/Icon";
import LoadingSkeleton from "../components/LoadingSkeleton";
import StarRating from "../components/StarRating";
import { useToast } from "../context/ToastContext";
import { useWineCollection } from "../hooks/useWineCollection";
import { useWishlist } from "../hooks/useWishlist";
import { WINE_TYPE_LABELS } from "../data/wineReference";
import { getCellarStatus } from "../utils/cellarStatus";
import "../styles/pages/BodyPage.css";

const FILTER_VALUES = new Set([
  "all",
  "favorites",
  "tasted",
  "nottasted",
  "lowstock",
  "cellarready",
  "red",
  "white",
  "rosé",
  "sparkling",
  "fortified",
]);

const normalizeSearchText = (value = "") =>
  String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

export default function BodyPage({ initialFilter = "all" }) {
  const navigate = useNavigate();
  const { addToast, removeToast, showSuccess, showError } = useToast();
  const {
    wines,
    loading,
    error,
    addWine,
    deleteWine,
    toggleFavorite,
    updateWineTasted,
    adjustStock,
  } = useWineCollection();

  const [filterType, setFilterType] = useState(
    FILTER_VALUES.has(initialFilter) ? initialFilter : "all"
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [varietalFilter, setVarietalFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [pendingActionId, setPendingActionId] = useState(null);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [convertingWish, setConvertingWish] = useState(null);
  const [convertDraft, setConvertDraft] = useState({ price: "", store: "", quantity: "1" });
  const undoTimerRef = useRef(null);
  const pendingDeleteToastRef = useRef("");

  const { wishes, loading: wishesLoading, removeWish, convertToWine } = useWishlist(
    (wine) => {
      showSuccess(`"${wine.name}" agregado a tu bodega`);
    }
  );

  useEffect(() => {
    if (FILTER_VALUES.has(initialFilter)) {
      setFilterType(initialFilter);
    }
  }, [initialFilter]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (error) showError(error);
  }, [error, showError]);

  const varietalOptions = useMemo(
    () => [...new Set(wines.map((wine) => wine.varietal).filter(Boolean))].sort(),
    [wines]
  );
  const regionOptions = useMemo(
    () => [...new Set(wines.map((wine) => wine.region).filter(Boolean))].sort(),
    [wines]
  );

  const filteredWines = useMemo(
    () =>
      wines.filter((wine) => {
        const normalizedSearch = normalizeSearchText(searchTerm);
        const matchesSearch =
          !normalizedSearch ||
          [wine.name, wine.region, wine.winery, wine.varietal, wine.notes]
            .map(normalizeSearchText)
            .some((field) => field.includes(normalizedSearch));

        if (!matchesSearch) return false;
        if (varietalFilter !== "all" && wine.varietal !== varietalFilter) return false;
        if (regionFilter !== "all" && wine.region !== regionFilter) return false;

        if (filterType === "all") return true;
        if (filterType === "tasted") return wine.tasted;
        if (filterType === "nottasted") return !wine.tasted;
        if (filterType === "favorites") return wine.favorite;
        if (filterType === "lowstock") return Number(wine.quantity) <= 1;
        if (filterType === "cellarready") return Number(wine.quantity) > 0 && getCellarStatus(wine).status === "peak";
        return wine.type === filterType;
      }),
    [wines, searchTerm, filterType, varietalFilter, regionFilter]
  );

  const sortedWines = useMemo(() => {
    return [...filteredWines].sort((a, b) => {
      if (sortBy === "rating") return (b.rating || 0) - (a.rating || 0);
      if (sortBy === "year") return (b.vintage || 0) - (a.vintage || 0);
      if (sortBy === "name") return a.name.localeCompare(b.name);
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  }, [filteredWines, sortBy]);

  const stats = {
    total: wines.length,
    favorites: wines.filter((wine) => wine.favorite).length,
    tasted: wines.filter((wine) => wine.tasted).length,
    lowStock: wines.filter((wine) => Number(wine.quantity) <= 1).length,
  };

  const activeFilterLabel =
    filterType === "all"
      ? "Todos"
      : filterType === "favorites"
        ? "Favoritos"
        : filterType === "tasted"
          ? "Probados"
          : filterType === "nottasted"
            ? "Pendientes"
            : filterType === "cellarready"
              ? "Listos para abrir"
              : filterType === "lowstock"
              ? "Stock bajo"
              : WINE_TYPE_LABELS[filterType] || filterType;

  const activeCharacteristicFilters = [
    varietalFilter !== "all" ? varietalFilter : null,
    regionFilter !== "all" ? regionFilter : null,
  ].filter(Boolean);

  const hasActiveFilters = filterType !== "all" || activeCharacteristicFilters.length > 0;

  const clearAllFilters = () => {
    setFilterType("all");
    setVarietalFilter("all");
    setRegionFilter("all");
  };

  const withPendingAction = async (id, action) => {
    setPendingActionId(id);
    try {
      await action();
    } catch {
      showError("No se pudo completar la acción. Intenta de nuevo.");
    } finally {
      setPendingActionId(null);
    }
  };

  const handleToggleFavorite = (wine) =>
    withPendingAction(wine._id, async () => {
      await toggleFavorite(wine._id, !wine.favorite);
      showSuccess(wine.favorite ? "Eliminado de favoritos" : "Agregado a favoritos");
    });

  const handleToggleTasted = (wine) =>
    withPendingAction(wine._id, async () => {
      await updateWineTasted(wine._id, !wine.tasted);
      showSuccess(wine.tasted ? "Marcado como no probado" : "Vino marcado como probado");
    });

  const handleAdjustQuantity = (wine, delta) => {
    if (delta < 0 && Number(wine.quantity) <= 0) return;
    withPendingAction(wine._id, async () => {
      await adjustStock(wine._id, delta);
      if (delta > 0) showSuccess(`Stock actualizado: ${wine.name}`);
    });
  };

  const restoreDeletedWine = async (wineToRestore, toastId) => {
    if (!wineToRestore) return;

    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }

    if (toastId) removeToast(toastId);

    try {
      await addWine({
        name: wineToRestore.name,
        winery: wineToRestore.winery,
        vintage: wineToRestore.vintage,
        region: wineToRestore.region,
        varietal: wineToRestore.varietal,
        notes: wineToRestore.notes,
        rating: wineToRestore.rating,
        tasted: wineToRestore.tasted,
        favorite: wineToRestore.favorite,
        quantity: wineToRestore.quantity,
        image: wineToRestore.image,
      });
      showSuccess(`"${wineToRestore.name}" restaurado`);
    } catch {
      showError("No se pudo restaurar el vino");
    }
  };

  const handleDeleteWine = async (id) => {
    const wineToDelete = wines.find((wine) => wine._id === id);
    setShowDeleteConfirm(null);
    if (!wineToDelete) return;

    try {
      await deleteWine(id);
    } catch {
      showError("No se pudo eliminar el vino");
      return;
    }

    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    if (pendingDeleteToastRef.current) {
      removeToast(pendingDeleteToastRef.current);
      pendingDeleteToastRef.current = "";
    }

    const toastId = addToast(`"${wineToDelete.name}" eliminado`, "warning", 8000, {
      label: "Deshacer",
      onClick: () => restoreDeletedWine(wineToDelete, toastId),
    });

    pendingDeleteToastRef.current = toastId;
    undoTimerRef.current = setTimeout(() => {
      undoTimerRef.current = null;
      pendingDeleteToastRef.current = "";
    }, 8000);
  };

  return (
    <div className="body-page">
      {(loading || wines.length > 0) && (
        <>
      <div className="stats-strip" role="group" aria-label="Resumen de tu bodega">
        <div className="stat">
          <span className="stat-number">{stats.total}</span>
          <span className="stat-label">Vinos</span>
        </div>
        <div className="stat">
          <span className="stat-number">{stats.favorites}</span>
          <span className="stat-label">Favoritos</span>
        </div>
        <div className="stat">
          <span className="stat-number">{stats.tasted}</span>
          <span className="stat-label">Probados</span>
        </div>
        <div className="stat">
          <span className="stat-number stat-number--warn">{stats.lowStock}</span>
          <span className="stat-label">Stock bajo</span>
        </div>
      </div>

      <div className="search-container">
        <span className="search-icon" aria-hidden="true"><Icon name="search" size={18} /></span>
        <input
          type="text"
          placeholder="Buscar por nombre, bodega, varietal o notas..."
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          className="search-input"
          aria-label="Buscar vino"
        />

        {searchTerm && (
          <button
            className="search-clear"
            onClick={() => setSearchTerm("")}
            type="button"
            aria-label="Limpiar búsqueda"
          >
            <Icon name="x" size={16} />
          </button>
        )}
      </div>

      <div className="controls">
        <select
          value={filterType}
          onChange={(event) => setFilterType(event.target.value)}
          className="filter-select"
          aria-label="Filtrar vinos"
        >
          <option value="all">Todos</option>
          <option value="favorites">Favoritos</option>
          <option value="tasted">Probados</option>
          <option value="nottasted">Pendientes</option>
          <option value="lowstock">Stock bajo</option>
          <option value="cellarready">Listos para abrir</option>
          <option value="red">Tintos</option>
          <option value="white">Blancos</option>
          <option value="rosé">Rosados</option>
          <option value="sparkling">Espumantes</option>
          <option value="fortified">Fortificados</option>
        </select>

        <select
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value)}
          className="sort-select"
          aria-label="Ordenar vinos"
        >
          <option value="recent">Recientes</option>
          <option value="rating">Rating</option>
          <option value="year">Año</option>
          <option value="name">Nombre</option>
        </select>
      </div>

      {(varietalOptions.length > 1 || regionOptions.length > 1) && (
        <div className="controls">
          {varietalOptions.length > 1 && (
            <select
              value={varietalFilter}
              onChange={(event) => setVarietalFilter(event.target.value)}
              className="filter-select"
              aria-label="Filtrar por varietal"
            >
              <option value="all">Todos los varietales</option>
              {varietalOptions.map((varietal) => (
                <option key={varietal} value={varietal}>{varietal}</option>
              ))}
            </select>
          )}

          {regionOptions.length > 1 && (
            <select
              value={regionFilter}
              onChange={(event) => setRegionFilter(event.target.value)}
              className="filter-select"
              aria-label="Filtrar por región"
            >
              <option value="all">Todas las regiones</option>
              {regionOptions.map((region) => (
                <option key={region} value={region}>{region}</option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="quick-filters" aria-label="Filtros rápidos de bodega">
        <button
          type="button"
          className={`quick-filter-chip ${filterType === "favorites" ? "quick-filter-chip--active" : ""}`}
          onClick={() => setFilterType(filterType === "favorites" ? "all" : "favorites")}
        >
          Favoritos ({stats.favorites})
        </button>
        <button
          type="button"
          className={`quick-filter-chip ${filterType === "nottasted" ? "quick-filter-chip--active" : ""}`}
          onClick={() => setFilterType(filterType === "nottasted" ? "all" : "nottasted")}
        >
          Pendientes ({wines.length - stats.tasted})
        </button>
        <button
          type="button"
          className={`quick-filter-chip ${filterType === "lowstock" ? "quick-filter-chip--active" : ""}`}
          onClick={() => setFilterType(filterType === "lowstock" ? "all" : "lowstock")}
        >
          Stock bajo ({stats.lowStock})
        </button>
        <button
          type="button"
          className={`quick-filter-chip ${filterType === "cellarready" ? "quick-filter-chip--active" : ""}`}
          onClick={() => setFilterType(filterType === "cellarready" ? "all" : "cellarready")}
        >
          Listos para abrir
        </button>
      </div>

      {hasActiveFilters && (
        <p className="active-filter-note">
          Mostrando:{" "}
          <strong>
            {[
              filterType !== "all" ? activeFilterLabel : null,
              ...activeCharacteristicFilters,
            ]
              .filter(Boolean)
              .join(" · ")}
          </strong>
          <button type="button" className="active-filter-note__clear" onClick={clearAllFilters}>
            Quitar filtros
          </button>
        </p>
      )}
        </>
      )}

      {loading && <LoadingSkeleton type="card" count={4} />}

      {!loading && sortedWines.length > 0 && (
        <div className="wines-grid">
          {sortedWines.map((wine) => {
            const isPending = pendingActionId === wine._id;
            return (
              <article
                key={wine._id}
                className={`wine-card ${isPending ? "wine-card--pending" : ""}`}
                onClick={() => navigate(`/vino/${wine._id}`)}
                role="link"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter") navigate(`/vino/${wine._id}`);
                }}
              >
                <div className="wine-image-wrapper">
                  {wine.image ? (
                    <img src={wine.image} alt={wine.name} className="wine-image-photo" loading="lazy" />
                  ) : (
                    <span className="wine-image" aria-hidden="true">🍷</span>
                  )}
                  <button
                    type="button"
                    className={`wine-fav-toggle ${wine.favorite ? "is-active" : ""}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleToggleFavorite(wine);
                    }}
                    disabled={isPending}
                    aria-label={wine.favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
                    title={wine.favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
                  >
                    <Icon name="heart" filled={wine.favorite} size={16} />
                  </button>
                  {wine.tasted && (
                    <span className="badge-tasted" aria-label="Probado" title="Probado">
                      <Icon name="check" size={16} />
                    </span>
                  )}
                  {Number(wine.quantity) <= 0 && (
                    <span className="badge-empty">Sin stock</span>
                  )}
                </div>

                <div className="wine-info">
                  <h3 className="wine-name" title={wine.name}>{wine.name}</h3>
                  <p className="wine-region">
                    {[wine.winery, wine.region].filter(Boolean).join(" · ") || "Sin datos de origen"}
                  </p>
                  <div className="wine-meta">
                    <span className="wine-type">{WINE_TYPE_LABELS[wine.type] || WINE_TYPE_LABELS.unknown}</span>
                    {wine.vintage && <span className="wine-year">{wine.vintage}</span>}
                  </div>
                  <div className="wine-details">
                    <div
                      className="wine-qty-controls"
                      aria-label={`Stock de ${wine.name}`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="qty-btn"
                        onClick={() => handleAdjustQuantity(wine, -1)}
                        disabled={isPending || Number(wine.quantity) <= 0}
                        aria-label="Restar una unidad"
                      >
                        <Icon name="minus" size={15} />
                      </button>
                      <span className="wine-qty">x{wine.quantity}</span>
                      <button
                        type="button"
                        className="qty-btn"
                        onClick={() => handleAdjustQuantity(wine, 1)}
                        disabled={isPending}
                        aria-label="Sumar una unidad"
                      >
                        <Icon name="plus" size={15} />
                      </button>
                    </div>
                    {!!wine.rating && <StarRating value={wine.rating} size="sm" />}
                  </div>
                </div>

                <div className="wine-actions" onClick={(event) => event.stopPropagation()}>
                  <button
                    className={`wine-action-btn ${wine.tasted ? "is-active" : ""}`}
                    onClick={() => handleToggleTasted(wine)}
                    type="button"
                    disabled={isPending}
                    aria-label={wine.tasted ? "Marcar como no probado" : "Marcar como probado"}
                    title={wine.tasted ? "Marcar como no probado" : "Marcar como probado"}
                  >
                    <Icon name={wine.tasted ? "check" : "circle"} size={16} />
                    {wine.tasted ? "Probado" : "Marcar probado"}
                  </button>

                  <button
                    className="wine-action-btn wine-action-btn--danger"
                    onClick={() => setShowDeleteConfirm(wine._id)}
                    type="button"
                    disabled={isPending}
                    aria-label="Eliminar vino"
                    title="Eliminar vino"
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {!loading && wines.length === 0 && (
        <div className="empty-state">
          <p className="empty-icon" aria-hidden="true">🍷</p>
          <p className="empty-title">Tu bodega está vacía</p>
          <p className="empty-subtitle">Escaneá la etiqueta de un vino para empezar tu colección.</p>
          <button type="button" className="empty-cta" onClick={() => navigate("/descubrir")}>
            Escanear mi primer vino
          </button>
        </div>
      )}

      {!loading && wines.length > 0 && sortedWines.length === 0 && (
        <div className="empty-state">
          <p className="empty-icon" aria-hidden="true">🔍</p>
          <p className="empty-title">Sin resultados</p>
          <p className="empty-subtitle">Probá limpiando la búsqueda o cambiando los filtros.</p>
          <button
            type="button"
            className="empty-cta"
            onClick={() => {
              setSearchTerm("");
              clearAllFilters();
            }}
          >
            Limpiar filtros
          </button>
        </div>
      )}

      {/* Sección Wishlist */}
      <section className="wishlist-section">
        <button
          type="button"
          className="wishlist-toggle"
          onClick={() => setWishlistOpen((o) => !o)}
        >
          <span>♡ Lista de deseos</span>
          {wishes.length > 0 && <span className="wishlist-badge">{wishes.length}</span>}
          <span className="wishlist-toggle__arrow">{wishlistOpen ? "▲" : "▼"}</span>
        </button>

        {wishlistOpen && (
          <div className="wishlist-body">
            {wishesLoading && <p className="wishlist-empty">Cargando...</p>}

            {!wishesLoading && wishes.length === 0 && (
              <div className="wishlist-empty">
                <p>Guardá vinos que querés comprar.</p>
                <button
                  type="button"
                  className="wishlist-add-btn"
                  onClick={() => navigate("/descubrir")}
                >
                  + Agregar desde escaneo
                </button>
              </div>
            )}

            {!wishesLoading && wishes.length > 0 && (
              <ul className="wishlist-list">
                {wishes.map((wish) => (
                  <li key={wish._id} className="wishlist-item">
                    {convertingWish === wish._id ? (
                      <div className="wishlist-convert-form">
                        <p className="wishlist-convert-title">Compraste: <strong>{wish.name}</strong></p>
                        <div className="wishlist-convert-fields">
                          <input
                            type="number"
                            placeholder="Precio"
                            min="0"
                            value={convertDraft.price}
                            onChange={(e) => setConvertDraft((d) => ({ ...d, price: e.target.value }))}
                            className="scan-edit-input"
                          />
                          <input
                            type="text"
                            placeholder="Tienda"
                            value={convertDraft.store}
                            onChange={(e) => setConvertDraft((d) => ({ ...d, store: e.target.value }))}
                            className="scan-edit-input"
                          />
                          <input
                            type="number"
                            placeholder="Cantidad"
                            min="1"
                            value={convertDraft.quantity}
                            onChange={(e) => setConvertDraft((d) => ({ ...d, quantity: e.target.value }))}
                            className="scan-edit-input"
                          />
                        </div>
                        <div className="result-actions">
                          <button
                            type="button"
                            className="btn-cancel"
                            onClick={() => setConvertingWish(null)}
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            className="btn-add"
                            onClick={async () => {
                              try {
                                await convertToWine(wish._id, {
                                  price: convertDraft.price ? parseFloat(convertDraft.price) : undefined,
                                  store: convertDraft.store || undefined,
                                  quantity: convertDraft.quantity ? parseInt(convertDraft.quantity) : 1,
                                });
                                setConvertingWish(null);
                                setConvertDraft({ price: "", store: "", quantity: "1" });
                              } catch {
                                showError("No se pudo agregar a la bodega");
                              }
                            }}
                          >
                            Agregar a bodega
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="wishlist-item__info">
                          <span className="wishlist-item__name">{wish.name}</span>
                          {wish.winery && <span className="wishlist-item__winery">{wish.winery}</span>}
                          {wish.type && wish.type !== "unknown" && (
                            <span className="wishlist-item__type">{WINE_TYPE_LABELS[wish.type]}</span>
                          )}
                        </div>
                        <div className="wishlist-item__actions">
                          <button
                            type="button"
                            className="wishlist-buy-btn"
                            onClick={() => {
                              setConvertingWish(wish._id);
                              setConvertDraft({ price: "", store: "", quantity: "1" });
                            }}
                          >
                            Ya lo compré
                          </button>
                          <button
                            type="button"
                            className="wishlist-remove-btn"
                            onClick={() => removeWish(wish._id)}
                            aria-label="Eliminar de la lista"
                          >
                            ✕
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <ConfirmModal
        isOpen={showDeleteConfirm !== null}
        title="¿Eliminar vino?"
        message={`Se quitará "${wines.find((wine) => wine._id === showDeleteConfirm)?.name || "este vino"}" de tu bodega. Podrás deshacer por unos segundos.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        isDangerous
        onConfirm={() => handleDeleteWine(showDeleteConfirm)}
        onCancel={() => setShowDeleteConfirm(null)}
      />
    </div>
  );
}
