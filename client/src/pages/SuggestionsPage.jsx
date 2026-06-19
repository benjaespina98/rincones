import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../context/ToastContext";
import { getWineSuggestions, toggleWineFavorite } from "../services/wineApi";
import { WINE_TYPE_LABELS } from "../data/wineReference";
import LoadingSkeleton from "../components/LoadingSkeleton";
import "../styles/pages/SuggestionsPage.css";

export default function SuggestionsPage() {
  const { showSuccess, showError } = useToast();
  const navigate = useNavigate();
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState(null);

  useEffect(() => {
    let mounted = true;

    const loadSuggestions = async () => {
      try {
        setLoading(true);
        const data = await getWineSuggestions();
        if (!mounted) return;
        setSuggestions(data);
      } catch (error) {
        if (!mounted) return;
        setSuggestions([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadSuggestions();
    return () => {
      mounted = false;
    };
  }, []);

  const handleToggleFavorite = async (wine) => {
    setPendingId(wine._id);
    try {
      await toggleWineFavorite(wine._id, !wine.favorite);
      setSuggestions((prev) =>
        prev.map((item) => (item._id === wine._id ? { ...item, favorite: !item.favorite } : item))
      );
      showSuccess(wine.favorite ? "Eliminado de favoritos" : "Agregado a favoritos");
    } catch {
      showError("No se pudo actualizar el favorito");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="suggestions-page">
      <header className="page-header">
        <h1>✨ Destacados de tu bodega</h1>
        <p className="subtitle">Tus mejores rankeados y favoritos, para volver a elegirlos</p>
      </header>

      {loading ? (
        <LoadingSkeleton type="card" count={3} />
      ) : suggestions.length > 0 ? (
        <div className="suggestions-container">
          {suggestions.map((wine) => (
            <div
              key={wine._id}
              className="suggestion-card"
              onClick={() => navigate(`/vino/${wine._id}`)}
              role="link"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter") navigate(`/vino/${wine._id}`);
              }}
            >
              <div className="wine-image-wrapper">
                {wine.image ? (
                  <img src={wine.image} alt={wine.name} className="suggestion-card__photo" />
                ) : (
                  <div className="wine-image" aria-hidden="true">🍷</div>
                )}
              </div>

              <div className="wine-info">
                <h3 className="wine-name">{wine.name}</h3>
                <p className="wine-region">
                  {[wine.winery, wine.region].filter(Boolean).join(" · ") || "Sin datos de origen"}
                </p>

                <div className="wine-meta">
                  <span className="wine-type">{WINE_TYPE_LABELS[wine.type] || WINE_TYPE_LABELS.unknown}</span>
                  {wine.vintage && <span className="wine-year">{wine.vintage}</span>}
                </div>

                <div className="wine-rating-reason">
                  {!!wine.rating && <span className="wine-rating">⭐ {wine.rating}</span>}
                  <span className="reason">{wine.reason}</span>
                </div>
              </div>

              <div className="wine-actions" onClick={(event) => event.stopPropagation()}>
                <button
                  className={`btn-favorite ${wine.favorite ? "btn-favorite--active" : ""}`}
                  onClick={() => handleToggleFavorite(wine)}
                  type="button"
                  disabled={pendingId === wine._id}
                  title={wine.favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
                  aria-label={wine.favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
                >
                  {wine.favorite ? "❤" : "🤍"}
                </button>
                <button
                  className="btn-add"
                  onClick={() => navigate(`/vino/${wine._id}`)}
                  type="button"
                >
                  Ver detalle
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p className="empty-icon">🎯</p>
          <p className="empty-title">Todavía no hay destacados</p>
          <p className="empty-subtitle">
            Agregá vinos a tu bodega y calificalos para que aparezcan acá.
          </p>
          <button type="button" className="button button--primary" onClick={() => navigate("/descubrir")}>
            Escanear etiqueta
          </button>
        </div>
      )}
    </div>
  );
}
