import { useEffect, useMemo, useRef, useState } from "react";
import ConfirmModal from "../components/ConfirmModal";
import { useToast } from "../context/ToastContext";
import "../styles/pages/BodyPage.css";

const INITIAL_WINES = [
  {
    id: "1",
    name: "Catena Zapata Malbec Argentino",
    winery: "Catena Zapata",
    region: "Mendoza",
    type: "Tinto",
    year: 2015,
    quantity: 2,
    rating: 4.8,
    favorite: true,
    tasted: false,
    varietal: "Malbec",
    notes: "Intenso, frutado y ideal para carnes.",
    image: "🍷",
  },
  {
    id: "2",
    name: "Luigi Bosca Malbec",
    winery: "Luigi Bosca",
    region: "Luján de Cuyo",
    type: "Tinto",
    year: 2010,
    quantity: 1,
    rating: 4.9,
    favorite: true,
    tasted: true,
    varietal: "Malbec",
    notes: "Elegante, con taninos suaves y final largo.",
    image: "🍷",
  },
  {
    id: "3",
    name: "Rutini Cabernet Sauvignon",
    winery: "Rutini Wines",
    region: "Valle de Uco",
    type: "Tinto",
    year: 2019,
    quantity: 3,
    rating: 4.7,
    favorite: false,
    tasted: false,
    varietal: "Cabernet Sauvignon",
    notes: "Buena opción si buscás algo más estructurado.",
    image: "🍷",
  },
];

const FILTER_VALUES = new Set(["all", "favorites", "tasted", "nottasted", "lowstock", "tinto", "blanco"]);

export default function BodyPage({ initialFilter = "all" }) {
  const { addToast, removeToast, showSuccess } = useToast();
  const [wines, setWines] = useState(INITIAL_WINES);
  const [loading] = useState(false);
  const [filterType, setFilterType] = useState(
    FILTER_VALUES.has(initialFilter) ? initialFilter : "all"
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const undoTimerRef = useRef(null);
  const pendingDeleteToastRef = useRef("");

  const normalizeSearchText = (value = "") =>
    String(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  useEffect(() => {
    if (FILTER_VALUES.has(initialFilter)) {
      setFilterType(initialFilter);
    }
  }, [initialFilter]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
    };
  }, []);

  const filteredWines = useMemo(
    () =>
      wines.filter((wine) => {
        const normalizedSearch = normalizeSearchText(searchTerm);
        const matchesSearch =
          !normalizedSearch ||
          normalizeSearchText(wine.name).includes(normalizedSearch) ||
          normalizeSearchText(wine.region).includes(normalizedSearch) ||
          normalizeSearchText(wine.winery).includes(normalizedSearch) ||
          normalizeSearchText(wine.varietal).includes(normalizedSearch) ||
          normalizeSearchText(wine.notes).includes(normalizedSearch);

        if (!matchesSearch) {
          return false;
        }

        if (filterType === "all") return true;
        if (filterType === "tasted") return wine.tasted;
        if (filterType === "nottasted") return !wine.tasted;
        if (filterType === "favorites") return wine.favorite;
        if (filterType === "lowstock") return Number(wine.quantity) <= 1;
        return wine.type.toLowerCase() === filterType.toLowerCase();
      }),
    [wines, searchTerm, filterType]
  );

  const sortedWines = useMemo(() => {
    return [...filteredWines].sort((a, b) => {
      if (sortBy === "rating") return b.rating - a.rating;
      if (sortBy === "year") return b.year - a.year;
      if (sortBy === "name") return a.name.localeCompare(b.name);
      return 0;
    });
  }, [filteredWines, sortBy]);

  const handleToggleFavorite = (id) => {
    const wine = wines.find((w) => w.id === id);
    if (!wine) return;

    setWines((prev) => prev.map((w) => (w.id === id ? { ...w, favorite: !w.favorite } : w)));
    showSuccess(wine.favorite ? "Eliminado de favoritos" : "Agregado a favoritos");
  };

  const handleToggleTasted = (id) => {
    const wine = wines.find((w) => w.id === id);
    if (!wine) return;

    setWines((prev) => prev.map((w) => (w.id === id ? { ...w, tasted: !w.tasted } : w)));
    showSuccess(wine.tasted ? "Marcado como no probado" : "Vino marcado como probado");
  };

  const handleAdjustQuantity = (id, delta) => {
    const wine = wines.find((item) => item.id === id);
    if (!wine) return;

    setWines((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const nextQuantity = Math.max(0, Number(item.quantity || 0) + delta);
        return { ...item, quantity: nextQuantity };
      })
    );

    if (delta > 0) {
      showSuccess(`Stock actualizado: ${wine.name}`);
    }
  };

  const restoreDeletedWine = (wineToRestore, toastId) => {
    if (!wineToRestore) {
      return;
    }

    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }

    setWines((prev) => {
      const exists = prev.some((wine) => wine.id === wineToRestore.id);
      if (exists) return prev;
      return [wineToRestore, ...prev];
    });

    if (toastId) {
      removeToast(toastId);
    }

    showSuccess(`"${wineToRestore.name}" restaurado`);
  };

  const handleDeleteWine = (id) => {
    const wineToDelete = wines.find((wine) => wine.id === id);
    if (!wineToDelete) {
      setShowDeleteConfirm(null);
      return;
    }

    setWines((prev) => prev.filter((wine) => wine.id !== id));
    setShowDeleteConfirm(null);

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
          : filterType.charAt(0).toUpperCase() + filterType.slice(1);

  return (
    <div className="body-page">
      <header className="page-header">
        <h1>Mi Bodega</h1>
        <p className="subtitle">Vista actual: {activeFilterLabel}</p>

        <div className="stats-container">
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
        </div>
      </header>

      <div className="search-container">
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
          <option value="tinto">Tintos</option>
          <option value="blanco">Blancos</option>
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

      <div className="quick-filters" aria-label="Filtros rápidos de bodega">
        <button
          type="button"
          className={`quick-filter-chip ${filterType === "favorites" ? "quick-filter-chip--active" : ""}`}
          onClick={() => setFilterType("favorites")}
        >
          Favoritos ({stats.favorites})
        </button>
        <button
          type="button"
          className={`quick-filter-chip ${filterType === "nottasted" ? "quick-filter-chip--active" : ""}`}
          onClick={() => setFilterType("nottasted")}
        >
          Pendientes ({wines.length - stats.tasted})
        </button>
        <button
          type="button"
          className={`quick-filter-chip ${filterType === "lowstock" ? "quick-filter-chip--active" : ""}`}
          onClick={() => setFilterType("lowstock")}
        >
          Stock bajo ({stats.lowStock})
        </button>
      </div>

      {loading && (
        <div className="loading">
          <div className="loader"></div>
          <p>Cargando tu bodega...</p>
        </div>
      )}

      {!loading && sortedWines.length > 0 ? (
        <div className="wines-grid">
          {sortedWines.map((wine) => (
            <article key={wine.id || wine._id} className="wine-card">
              <div className="wine-image-wrapper">
                <div className="wine-image">{wine.image}</div>
                {wine.favorite && <span className="badge-favorite">❤</span>}
                {wine.tasted && <span className="badge-tasted">✓</span>}
              </div>

              <div className="wine-info">
                <h3 className="wine-name">{wine.name}</h3>
                <p className="wine-region">{wine.region}</p>
                <div className="wine-meta">
                  <span className="wine-type">{wine.type}</span>
                  <span className="wine-year">{wine.year}</span>
                  {wine.varietal && <span className="wine-year">{wine.varietal}</span>}
                </div>
                <div className="wine-details">
                  <div className="wine-qty-controls" aria-label={`Stock de ${wine.name}`}>
                    <button type="button" className="qty-btn" onClick={() => handleAdjustQuantity(wine.id, -1)}>
                      −
                    </button>
                    <span className="wine-qty">x{wine.quantity}</span>
                    <button type="button" className="qty-btn" onClick={() => handleAdjustQuantity(wine.id, 1)}>
                      +
                    </button>
                  </div>
                  {!!wine.rating && <span className="wine-rating">★ {wine.rating}</span>}
                </div>
              </div>

              <div className="wine-actions">
                <button
                  className={`btn-icon ${wine.favorite ? "active" : ""}`}
                  onClick={() => handleToggleFavorite(wine.id || wine._id)}
                  type="button"
                  aria-label={wine.favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
                  title={wine.favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
                >
                  {wine.favorite ? "❤" : "♡"}
                </button>

                <button
                  className={`btn-icon ${wine.tasted ? "active" : ""}`}
                  onClick={() => handleToggleTasted(wine.id || wine._id)}
                  type="button"
                  aria-label={wine.tasted ? "Marcar como no probado" : "Marcar como probado"}
                  title={wine.tasted ? "Marcar como no probado" : "Marcar como probado"}
                >
                  {wine.tasted ? "✓" : "○"}
                </button>

                <button
                  className="btn-delete"
                  onClick={() => setShowDeleteConfirm(wine.id || wine._id)}
                  type="button"
                  aria-label="Eliminar vino"
                  title="Eliminar vino"
                >
                  🗑
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : !loading && wines.length === 0 ? (
        <div className="empty-state">
          <p className="empty-icon">🍷</p>
          <p className="empty-title">Tu bodega está vacía</p>
          <p className="empty-subtitle">Comienza agregando vinos para activar sugerencias.</p>
        </div>
      ) : !loading && sortedWines.length === 0 ? (
        <div className="empty-state">
          <p className="empty-icon">🔍</p>
          <p className="empty-title">Sin resultados</p>
          <p className="empty-subtitle">Prueba limpiando búsqueda o cambiando filtros.</p>
        </div>
      ) : null}

      <ConfirmModal
        isOpen={showDeleteConfirm !== null}
        title="¿Eliminar vino?"
        message={`Se quitará "${wines.find((wine) => wine.id === showDeleteConfirm)?.name || "este vino"}" de tu bodega. Podrás deshacer por unos segundos.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        isDangerous
        onConfirm={() => handleDeleteWine(showDeleteConfirm)}
        onCancel={() => setShowDeleteConfirm(null)}
      />
    </div>
  );
}
