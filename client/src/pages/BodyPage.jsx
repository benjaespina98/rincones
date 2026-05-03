import { useState, useEffect } from "react";
import ConfirmModal from "../components/ConfirmModal";
import { useToast } from "../context/ToastContext";
import { getWines, deleteWine, toggleWineFavorite, toggleWineTasted } from "../services/wineApi";
import "../styles/pages/BodyPage.css";

export default function BodyPage() {
  const [wines, setWines] = useState([
    {
      id: "1",
      name: "Château Margaux",
      region: "Burdeos",
      type: "Tinto",
      year: 2015,
      quantity: 2,
      rating: 4.8,
      favorite: true,
      tasted: false,
      image: "🍷",
    },
    {
      id: "2",
      name: "Vega Sicilia",
      region: "Ribera del Duero",
      type: "Tinto",
      year: 2010,
      quantity: 1,
      rating: 4.9,
      favorite: true,
      tasted: true,
      image: "🍷",
    },
    {
      id: "3",
      name: "Álvaro Palacios",
      region: "Priorat",
      type: "Tinto",
      year: 2019,
      quantity: 3,
      rating: 4.7,
      favorite: false,
      tasted: false,
      image: "🍷",
    },
  ]);

  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [deletedWine, setDeletedWine] = useState(null);
  const [toasts, setToasts] = useState([]);

  // Cargar vinos del servidor
  useEffect(() => {
    // TODO: Descomentar cuando el backend esté listo
    // const loadWines = async () => {
    //   setLoading(true);
    //   try {
    //     const data = await getWines();
    //     setWines(data);
    //   } catch (error) {
    //     addToast("Error al cargar vinos", "error");
    //   } finally {
    //     setLoading(false);
    //   }
    // };
    // loadWines();
  }, []);

  // Filtrado y búsqueda
  const filteredWines = wines.filter((w) => {
    const matchesSearch =
      w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.region.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;
    if (filterType === "all") return true;
    if (filterType === "tasted") return w.tasted;
    if (filterType === "favorites") return w.favorite;
    return w.type.toLowerCase() === filterType.toLowerCase();
  });

  // Ordenamiento
  const sortedWines = [...filteredWines].sort((a, b) => {
    if (sortBy === "rating") return b.rating - a.rating;
    if (sortBy === "year") return b.year - a.year;
    if (sortBy === "name") return a.name.localeCompare(b.name);
    return 0;
  });

  // Toast notifications
  const addToast = (message, type = "info", duration = 3000) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Handlers
  const handleToggleFavorite = (id) => {
    const wine = wines.find((w) => w.id === id);
    if (wine) {
      setWines(
        wines.map((w) => (w.id === id ? { ...w, favorite: !w.favorite } : w))
      );
      addToast(
        wine.favorite ? "Eliminado de favoritos" : "Agregado a favoritos",
        "success"
      );
    }
  };

  const handleToggleTasted = (id) => {
    const wine = wines.find((w) => w.id === id);
    if (wine) {
      setWines(wines.map((w) => (w.id === id ? { ...w, tasted: !w.tasted } : w)));
      addToast(
        wine.tasted ? "Marcado como no probado" : "¡Vino probado!",
        "success"
      );
    }
  };

  const handleDeleteWine = (id) => {
    const wineToDelete = wines.find((w) => w.id === id);
    setDeletedWine(wineToDelete);
    setWines(wines.filter((w) => w.id !== id));
    setShowDeleteConfirm(null);

    // Mostrar toast con opción de deshacer
    const toastId = addToast(
      `"${wineToDelete.name}" eliminado`,
      "info",
      5000
    );

    // Permitir deshacer por 5 segundos
    const undoTimer = setTimeout(() => {
      setDeletedWine(null);
    }, 5000);

    // Si el usuario hace click en "Deshacer", restaurar el vino
    const handleUndo = () => {
      clearTimeout(undoTimer);
      setWines((prev) => [...prev, wineToDelete]);
      setDeletedWine(null);
      removeToast(toastId);
      addToast(`"${wineToDelete.name}" restaurado`, "success");
    };

    // Guardar la función de deshacer en el estado
    if (deletedWine) {
      // Si ya hay un vino deletado, limpiar su timer
    }
  };

  const stats = {
    total: wines.length,
    favorites: wines.filter((w) => w.favorite).length,
    tasted: wines.filter((w) => w.tasted).length,
  };

  return (
    <div className="body-page">
      {/* Header con Stats */}
      <header className="page-header">
        <h1>🍷 Mi Bodega</h1>
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

      {/* Búsqueda */}
      <div className="search-container">
        <input
          type="text"
          placeholder="Buscar por nombre o región..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
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

      {/* Filtros y Sort */}
      <div className="controls">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="filter-select"
        >
          <option value="all">Todos</option>
          <option value="tasted">Probados</option>
          <option value="favorites">Favoritos</option>
          <option value="tinto">Tintos</option>
          <option value="blanco">Blancos</option>
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="sort-select"
        >
          <option value="recent">Recientes</option>
          <option value="rating">Rating</option>
          <option value="year">Año</option>
          <option value="name">Nombre</option>
        </select>
      </div>

      {/* Estado de Carga (Shneiderman: visibility of system state) */}
      {loading && (
        <div className="loading">
          <div className="loader"></div>
          <p>Cargando tu bodega...</p>
        </div>
      )}

      {/* Grid de Vinos */}
      {!loading && sortedWines.length > 0 ? (
        <div className="wines-grid">
          {sortedWines.map((wine) => (
            <div key={wine.id} className="wine-card">
              <div className="wine-image-wrapper">
                <div className="wine-image">{wine.image}</div>
                {wine.favorite && <span className="badge-favorite">❤️</span>}
                {wine.tasted && <span className="badge-tasted">✓</span>}
              </div>

              <div className="wine-info">
                <h3 className="wine-name">{wine.name}</h3>
                <p className="wine-region">{wine.region}</p>
                <div className="wine-meta">
                  <span className="wine-type">{wine.type}</span>
                  <span className="wine-year">{wine.year}</span>
                </div>
                <div className="wine-details">
                  <span className="wine-qty">x{wine.quantity}</span>
                  {wine.rating && (
                    <span className="wine-rating">⭐ {wine.rating}</span>
                  )}
                </div>
              </div>

              <div className="wine-actions">
                <button
                  className={`btn-icon ${wine.favorite ? "active" : ""}`}
                  onClick={() => handleToggleFavorite(wine.id)}
                  type="button"
                  aria-label={wine.favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
                  title={wine.favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
                >
                  {wine.favorite ? "❤️" : "🤍"}
                </button>
                <button
                  className={`btn-icon ${wine.tasted ? "active" : ""}`}
                  onClick={() => handleToggleTasted(wine.id)}
                  type="button"
                  aria-label={wine.tasted ? "Marcar como no probado" : "Marcar como probado"}
                  title={wine.tasted ? "Marcar como no probado" : "Marcar como probado"}
                >
                  {wine.tasted ? "✓" : "○"}
                </button>
                <button
                  className="btn-delete"
                  onClick={() => setShowDeleteConfirm(wine.id)}
                  type="button"
                  aria-label="Eliminar vino"
                  title="Eliminar vino"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : !loading && wines.length === 0 ? (
        <div className="empty-state">
          <p className="empty-icon">🍷</p>
          <p className="empty-title">Tu bodega está vacía</p>
          <p className="empty-subtitle">Comienza a agregar vinos</p>
        </div>
      ) : !loading && sortedWines.length === 0 ? (
        <div className="empty-state">
          <p className="empty-icon">🔍</p>
          <p className="empty-title">Sin resultados</p>
          <p className="empty-subtitle">Intenta con otros filtros</p>
        </div>
      ) : null}

      {/* Modal de Confirmación (Shneiderman: error prevention) */}
      <ConfirmModal
        isOpen={showDeleteConfirm !== null}
        title="¿Eliminar vino?"
        message={`Confirma para eliminar "${wines.find((w) => w.id === showDeleteConfirm)?.name || ''}" de tu bodega. Esta acción no se puede deshacer inmediatamente.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        isDangerous={true}
        onConfirm={() => {
          const wineId = showDeleteConfirm;
          handleDeleteWine(wineId);
        }}
        onCancel={() => setShowDeleteConfirm(null)}
      />

      {/* Toast Notifications (Shneiderman: feedback) */}
      <div className="toast-stack">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            duration={3000}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </div>
  );
}
