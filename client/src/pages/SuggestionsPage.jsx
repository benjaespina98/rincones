import { useState, useEffect } from "react";
import { useToast } from "../context/ToastContext";
import { getWineSuggestions, createWine } from "../services/wineApi";
import "../styles/pages/SuggestionsPage.css";

export default function SuggestionsPage() {
  const { showSuccess, showError } = useToast();
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Descomentar cuando el backend esté listo
    // const loadSuggestions = async () => {
    //   setLoading(true);
    //   try {
    //     const data = await getWineSuggestions();
    //     setSuggestions(data);
    //   } catch (error) {
    //     addToast("Error al cargar sugerencias", "error");
    //   } finally {
    //     setLoading(false);
    //   }
    // };
    // loadSuggestions();

    // Datos de demo mientras el backend no está listo
    const timeout = setTimeout(() => {
      setSuggestions([
        {
          id: "1",
          name: "Château Margaux 2015",
          region: "Burdeos",
          type: "Tinto",
          year: 2015,
          rating: 4.8,
          price: 150,
          image: "🍷",
          reason: "Basado en tus favoritos",
        },
        {
          id: "2",
          name: "Vega Sicilia Unico 2010",
          region: "Ribera del Duero",
          type: "Tinto",
          year: 2010,
          rating: 4.9,
          price: 200,
          image: "🍷",
          reason: "Similar a Álvaro Palacios",
        },
        {
          id: "3",
          name: "Álvaro Palacios Terroir 2019",
          region: "Priorat",
          type: "Tinto",
          year: 2019,
          rating: 4.7,
          price: 85,
          image: "🍷",
          reason: "Trending entre usuarios",
        },
        {
          id: "4",
          name: "Marqués de Murrieta Reserva 2015",
          region: "Rioja",
          type: "Tinto",
          year: 2015,
          rating: 4.6,
          price: 65,
          image: "🍷",
          reason: "Nuevo en base datos",
        },
        {
          id: "5",
          name: "Pichon Longueville 2012",
          region: "Burdeos",
          type: "Tinto",
          year: 2012,
          rating: 4.5,
          price: 95,
          image: "🍷",
          reason: "Recomendación del Sommelier",
        },
        {
          id: "6",
          name: "Cono Sur Pinot Noir 2021",
          region: "Valle del Casablanca",
          type: "Tinto",
          year: 2021,
          rating: 4.3,
          price: 25,
          image: "🍷",
          reason: "Mejor relación precio",
        },
      ]);
      setLoading(false);
    }, 500);

    return () => clearTimeout(timeout);
  }, []);

  // Handlers
  const handleAddToCollection = (wine) => {
    // TODO: Conectar con API cuando esté lista
    // await createWine(wine);
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
