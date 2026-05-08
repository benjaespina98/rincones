import { useState } from "react";
import LabelScanner from "../components/LabelScanner";
import { useWineCollection } from "../hooks/useWineCollection";
import { useWineWithImages } from "../hooks/useWineWithImages";
import { useToast } from "../context/ToastContext";
import "./WineCollectionPage.css";

const WineCollectionPage = () => {
  const { wines, loading, addWine, deleteWine, updateWine } = useWineCollection();
  const winesWithImages = useWineWithImages(wines);
  const { showSuccess, showError } = useToast();
  const [showScanner, setShowScanner] = useState(false);
  const [selectedWine, setSelectedWine] = useState(null);

  const handleScanComplete = async (ocrData) => {
    try {
      const newWine = await addWine(ocrData);
      showSuccess(`✓ ${newWine.name} agregado a tu bodega`);
      setShowScanner(false);
      setSelectedWine(newWine);
    } catch (error) {
      showError("Error al guardar el vino");
    }
  };

  const handleDeleteWine = (id) => {
    const wine = wines.find((w) => w.id === id);
    if (!wine) return;

    const confirmed = window.confirm(`¿Eliminar "${wine.name}" de tu bodega?`);
    if (!confirmed) return;

    deleteWine(id);
    if (selectedWine?.id === id) {
      setSelectedWine(null);
    }
    showSuccess(`${wine.name} eliminado`);
  };

  const handleRatingChange = (id, rating) => {
    updateWine(id, { rating });
  };

  const handleTastedToggle = (id, tasted) => {
    updateWine(id, { tasted });
    showSuccess(tasted ? `✓ Marcado como degustado` : `○ Desmarcado`);
  };

  if (loading) {
    return (
      <div className="wine-collection__loading">
        <p>Cargando tu bodega...</p>
      </div>
    );
  }

  return (
    <div className="wine-collection">
      <div className="wine-collection__header">
        <div>
          <h1>🍷 Mi Bodega</h1>
          <p className="wine-collection__subtitle">
            Tu colección personal de vinos de Argentina
          </p>
        </div>
        <button
          className="button button--primary"
          onClick={() => setShowScanner(!showScanner)}
          style={{ whiteSpace: "nowrap" }}
        >
          {showScanner ? "✕ Cerrar" : "📸 Escanear"}
        </button>
      </div>

      {showScanner && (
        <div className="wine-collection__scanner">
          <LabelScanner onCapture={handleScanComplete} />
        </div>
      )}

      <div className="wine-collection__stats">
        <div className="stat">
          <span className="stat__value">{wines.length}</span>
          <span className="stat__label">Vinos guardados</span>
        </div>
        <div className="stat">
          <span className="stat__value">{wines.filter((w) => w.tasted).length}</span>
          <span className="stat__label">Degustados</span>
        </div>
        <div className="stat">
          <span className="stat__value">
            {wines.length > 0
              ? (wines.reduce((sum, w) => sum + w.rating, 0) / wines.length).toFixed(1)
              : "-"}
          </span>
          <span className="stat__label">Promedio</span>
        </div>
      </div>

      {wines.length === 0 ? (
        <div className="wine-collection__empty">
          <div className="wine-collection__empty-icon">🍷</div>
          <h2>Tu bodega está vacía</h2>
          <p>
            Escanea las etiquetas de tus vinos favoritos para comenzar a organizar tu colección.
          </p>
          <button className="button button--primary" onClick={() => setShowScanner(true)}>
            Escanear mi primer vino
          </button>
        </div>
      ) : (
        <div className="wine-collection__grid">
          {winesWithImages.map((wine) => (
            <div
              key={wine.id}
              className={`wine-card ${selectedWine?.id === wine.id ? "wine-card--selected" : ""}`}
              onClick={() => setSelectedWine(wine)}
            >
              {wine.image && (
                <div className="wine-card__image-wrapper">
                  <img src={wine.image} alt={wine.name} className="wine-card__image" />
                </div>
              )}

              <div className="wine-card__content">
                <h3 className="wine-card__name">{wine.name}</h3>

                {wine.winery && (
                  <div className="wine-card__winery">
                    <span className="wine-card__winery-label">Bodega</span>
                    <p>{wine.winery}</p>
                  </div>
                )}

                <div className="wine-card__meta">
                  {wine.vintage && (
                    <div className="wine-card__detail">
                      <span className="label">Año</span>
                      <span>{wine.vintage}</span>
                    </div>
                  )}
                  {wine.varietal && (
                    <div className="wine-card__detail">
                      <span className="label">Varietal</span>
                      <span>{wine.varietal}</span>
                    </div>
                  )}
                </div>

                <div className="wine-card__footer">
                  <div className="wine-card__rating">
                    <div className="rating-selector">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          className={`star ${wine.rating >= star ? "star--active" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRatingChange(wine.id, star);
                          }}
                          title={`Calificar ${star} estrellas`}
                          type="button"
                        >
                          ⭐
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="wine-card__actions">
                    <button
                      className={`button button--compact ${wine.tasted ? "button--toggle-active" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTastedToggle(wine.id, !wine.tasted);
                      }}
                      title={wine.tasted ? "Marcado como degustado" : "Marcar como degustado"}
                      type="button"
                    >
                      ✓ {wine.tasted ? "Probado" : "No probado"}
                    </button>

                    <button
                      className="button button--compact"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteWine(wine.id);
                      }}
                      title="Eliminar vino"
                      style={{ color: "#e24448" }}
                      type="button"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedWine && (
        <div className="wine-collection__detail-modal" onClick={() => setSelectedWine(null)}>
          <div className="wine-detail-card" onClick={(e) => e.stopPropagation()}>
            <button
              className="wine-detail-card__close"
              onClick={() => setSelectedWine(null)}
              aria-label="Cerrar"
              type="button"
            >
              ✕
            </button>

            {selectedWine.image && (
              <img
                src={selectedWine.image}
                alt={selectedWine.name}
                className="wine-detail-card__image"
              />
            )}

            <div className="wine-detail-card__content">
              <h2>{selectedWine.name}</h2>
              {selectedWine.winery && (
                <p className="wine-detail-card__winery">{selectedWine.winery}</p>
              )}

              <div className="wine-detail-card__grid">
                {selectedWine.vintage && (
                  <div>
                    <span className="label">Año</span>
                    <p>{selectedWine.vintage}</p>
                  </div>
                )}
                {selectedWine.region && (
                  <div>
                    <span className="label">Región</span>
                    <p>{selectedWine.region}</p>
                  </div>
                )}
                {selectedWine.varietal && (
                  <div>
                    <span className="label">Varietal</span>
                    <p>{selectedWine.varietal}</p>
                  </div>
                )}
              </div>

              {selectedWine.notes && (
                <div className="wine-detail-card__notes">
                  <span className="label">Mis notas</span>
                  <p>{selectedWine.notes}</p>
                </div>
              )}

              {selectedWine.rawText && (
                <details className="wine-detail-card__ocr">
                  <summary>📝 Texto extraído (OCR)</summary>
                  <pre>{selectedWine.rawText}</pre>
                </details>
              )}

              <div className="wine-detail-card__actions">
                <button
                  className="button button--ghost"
                  onClick={() => handleDeleteWine(selectedWine.id)}
                  type="button"
                >
                  🗑️ Eliminar
                </button>
                <button 
                  className="button button--primary" 
                  onClick={() => setSelectedWine(null)}
                  type="button"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WineCollectionPage;
