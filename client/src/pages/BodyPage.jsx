import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ConfirmModal from "../components/ConfirmModal";
import LoadingSkeleton from "../components/LoadingSkeleton";
import StarRating from "../components/StarRating";
import { useToast } from "../context/ToastContext";
import { useWineCollection } from "../hooks/useWineCollection";
import { WINE_TYPE_LABELS } from "../data/wineReference";
import "../styles/pages/BodyPage.css";

const FILTER_VALUES = new Set([
  "all",
  "favorites",
  "tasted",
  "nottasted",
  "lowstock",
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
  const undoTimerRef = useRef(null);
  const pendingDeleteToastRef = useRef("");

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
          <span className="stat-number">{stats.lowStock}</span>
          <span className="stat-label">Stock bajo</span>
        </div>
      </div>

      <div className="search-container">
        <span className="search-icon" aria-hidden="true">⌕</span>
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
            ✕
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
          ❤ Favoritos ({stats.favorites})
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
          ⚠ Stock bajo ({stats.lowStock})
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
                  {wine.favorite && (
                    <span className="badge-favorite" aria-label="Favorito" title="Favorito">❤</span>
                  )}
                  {wine.tasted && (
                    <span className="badge-tasted" aria-label="Probado" title="Probado">✓</span>
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
                    {wine.varietal && <span className="wine-year">{wine.varietal}</span>}
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
                        −
                      </button>
                      <span className="wine-qty">x{wine.quantity}</span>
                      <button
                        type="button"
                        className="qty-btn"
                        onClick={() => handleAdjustQuantity(wine, 1)}
                        disabled={isPending}
                        aria-label="Sumar una unidad"
                      >
                        +
                      </button>
                    </div>
                    {!!wine.rating && <StarRating value={wine.rating} size="sm" />}
                  </div>
                </div>

                <div className="wine-actions" onClick={(event) => event.stopPropagation()}>
                  <button
                    className={`btn-icon ${wine.favorite ? "active" : ""}`}
                    onClick={() => handleToggleFavorite(wine)}
                    type="button"
                    disabled={isPending}
                    aria-label={wine.favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
                    title={wine.favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
                  >
                    {wine.favorite ? "❤" : "♡"}
                  </button>

                  <button
                    className={`btn-icon ${wine.tasted ? "active" : ""}`}
                    onClick={() => handleToggleTasted(wine)}
                    type="button"
                    disabled={isPending}
                    aria-label={wine.tasted ? "Marcar como no probado" : "Marcar como probado"}
                    title={wine.tasted ? "Marcar como no probado" : "Marcar como probado"}
                  >
                    {wine.tasted ? "✓" : "○"}
                  </button>

                  <button
                    className="btn-delete"
                    onClick={() => setShowDeleteConfirm(wine._id)}
                    type="button"
                    disabled={isPending}
                    aria-label="Eliminar vino"
                    title="Eliminar vino"
                  >
                    🗑
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
