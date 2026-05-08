import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../context/ToastContext";
import { getWineSuggestions } from "../services/wineApi";
import "../styles/pages/SuggestionsPage.css";

const DEMO_SUGGESTIONS = [
  {
    id: "1",
    name: "Catena Zapata Malbec Argentino",
    region: "Mendoza",
    type: "Tinto",
    year: 2015,
    rating: 4.8,
    price: 150,
    image: "🍷",
    reason: "Basado en tus favoritos",
  },
  {
    id: "2",
    name: "Luigi Bosca Malbec",
    region: "Luján de Cuyo",
    type: "Tinto",
    year: 2010,
    rating: 4.9,
    price: 120,
    image: "🍷",
    reason: "Similar a vinos que ya elegiste",
  },
  {
    id: "3",
    name: "Rutini Cabernet Sauvignon",
    region: "Valle de Uco",
    type: "Tinto",
    year: 2019,
    rating: 4.7,
    price: 90,
    image: "🍷",
    reason: "Trending entre usuarios",
  },
];

export default function SuggestionsPage() {
  const { showSuccess } = useToast();
  const navigate = useNavigate();
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadSuggestions = async () => {
      try {
        setLoading(true);
        const data = await getWineSuggestions();
        if (!mounted) return;
        setSuggestions(data.length > 0 ? data : DEMO_SUGGESTIONS);
      } catch (error) {
        if (!mounted) return;
        setSuggestions(DEMO_SUGGESTIONS);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadSuggestions();

    return () => {
      mounted = false;
    };
  }, []);

  // Handlers
  const handleAddToCollection = (wine) => {
    showSuccess(`✓ "${wine.name}" agregado a tu bodega`);
    setSuggestions(suggestions.filter((w) => w.id !== wine.id));
  };

  const handleAddToFavorites = (wine) => {
    showSuccess(`❤️ "${wine.name}" agregado a favoritos`);
  };

  return (
    <div className="suggestions-page">
      <header className="page-header">
        <h1>✨ Sugerencias</h1>
        <p className="subtitle">Recomendaciones personalizadas para ti</p>
        <div className="suggestions-hero-cta">
          <button type="button" className="button button--primary" onClick={() => navigate("/descubrir")}>Escanear etiqueta</button>
          <button type="button" className="button button--ghost" onClick={() => navigate("/explorar")}>Ver recomendaciones IA</button>
        </div>
      </header>

      {/* Estado de Carga (Shneiderman: visibility) */}
      {loading ? (
        <div className="loading">
          <div className="loader"></div>
          <p>Cargando sugerencias...</p>
        </div>
      ) : suggestions.length > 0 ? (
        <div className="suggestions-container">
          {suggestions.map((wine) => (
            <div key={wine.id} className="suggestion-card">
              <div className="wine-image-wrapper">
                <div className="wine-image">{wine.image}</div>
              </div>

              <div className="wine-info">
                <h3 className="wine-name">{wine.name}</h3>
                <p className="wine-region">{wine.region}</p>

                <div className="wine-meta">
                  <span className="wine-type">{wine.type}</span>
                  <span className="wine-year">{wine.year}</span>
                  <span className="wine-price">${wine.price}</span>
                </div>

                <div className="wine-rating-reason">
                  <span className="wine-rating">⭐ {wine.rating}</span>
                  <span className="reason">{wine.reason}</span>
                </div>
              </div>

              <div className="wine-actions">
                <button
                  className="btn-favorite"
                  onClick={() => handleAddToFavorites(wine)}
                  type="button"
                  title="Agregar a favoritos"
                  aria-label="Agregar a favoritos"
                >
                  🤍
                </button>
                <button
                  className="btn-add"
                  onClick={() => handleAddToCollection(wine)}
                  type="button"
                  title="Agregar a bodega"
                  aria-label="Agregar a bodega"
                >
                  ➕ Agregar
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p className="empty-icon">🎯</p>
          <p className="empty-title">No hay sugerencias disponibles</p>
          <p className="empty-subtitle">Agrega vinos a tu bodega para obtener recomendaciones</p>
        </div>
      )}
    </div>
  );
}
