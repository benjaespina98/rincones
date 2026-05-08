import { useState } from "react";
import { useNavigate } from "react-router-dom";
import LabelScanner from "../components/LabelScanner";
import { useWineCollection } from "../hooks/useWineCollection";
import { useWineWithImages } from "../hooks/useWineWithImages";
import { useToast } from "../context/ToastContext";
import "./HomePage.css";

const HomePage = () => {
  const navigate = useNavigate();
  const { wines, addWine, loading } = useWineCollection();
  const winesWithImages = useWineWithImages(wines);
  const { showSuccess, showError } = useToast();
  const [showScanner, setShowScanner] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const recentWines = winesWithImages.slice(0, 6);
  const filteredWines = winesWithImages.filter((w) =>
    w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    w.winery?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    w.varietal?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleScanComplete = async (ocrData) => {
    try {
      await addWine(ocrData);
      showSuccess(`✓ ${ocrData.name} agregado a tu bodega`);
      setShowScanner(false);
    } catch (error) {
      showError("Error al agregar el vino");
      console.error(error);
    }
  };

  return (
    <div className="home-page">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero__content">
          <h1>Bienvenido a Rincones</h1>
          <p>Descubre, colecciona y comparte tus vinos favoritos</p>
        </div>
      </section>

      {/* Scanner FAB */}
      {!showScanner && (
        <button
          className="home-page__fab"
          onClick={() => setShowScanner(true)}
          title="Escanear etiqueta"
          type="button"
        >
          📸
        </button>
      )}

      {/* Scanner Modal */}
      {showScanner && (
        <div className="home-page__scanner-modal">
          <div className="home-page__scanner-container">
            <button
              className="home-page__scanner-close"
              onClick={() => setShowScanner(false)}
              type="button"
              aria-label="Cerrar"
            >
              ✕
            </button>
            <LabelScanner onCapture={handleScanComplete} />
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="home-page__main">
        {/* Search Section */}
        <section className="home-page__search">
          <div className="search-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="M21 21l-4.35-4.35"></path>
            </svg>
            <input
              type="text"
              placeholder="Buscar vinos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-box__input"
            />
          </div>
        </section>

        {/* Activity / Quick Stats */}
        <section className="home-page__stats">
          <div className="stat-card">
            <span className="stat-card__number">{wines.length}</span>
            <span className="stat-card__label">Vinos en bodega</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__number">{wines.filter((w) => w.tasted).length}</span>
            <span className="stat-card__label">Degustados</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__number">
              {wines.length > 0
                ? (wines.reduce((sum, w) => sum + w.rating, 0) / wines.length).toFixed(1)
                : "—"}
            </span>
            <span className="stat-card__label">Promedio</span>
          </div>
        </section>

        {/* Results */}
        {searchQuery ? (
          // Search Results
          <section className="home-page__section">
            <h2>Resultados ({filteredWines.length})</h2>
            {filteredWines.length > 0 ? (
              <div className="wine-grid">
                {filteredWines.map((wine) => (
                  <div
                    key={wine._id}
                    className="wine-item"
                    onClick={() => navigate(`/bodega?wine=${wine._id}`)}
                    role="button"
                    tabIndex={0}
                  >
                    {wine.image && (
                      <div className="wine-item__image">
                        <img src={wine.image} alt={wine.name} />
                      </div>
                    )}
                    <div className="wine-item__info">
                      <h3>{wine.name}</h3>
                      {wine.winery && <p className="wine-item__winery">{wine.winery}</p>}
                      {wine.vintage && <small>{wine.vintage}</small>}
                    </div>
                    {wine.rating > 0 && (
                      <div className="wine-item__rating">⭐ {wine.rating}</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <p>No se encontraron vinos</p>
              </div>
            )}
          </section>
        ) : (
          <>
            {/* Recent Activity */}
            {recentWines.length > 0 && (
              <section className="home-page__section">
                <div className="section-header">
                  <h2>Actividad reciente</h2>
                  <button
                    className="section-header__link"
                    onClick={() => navigate("/bodega")}
                    type="button"
                  >
                    Ver todo →
                  </button>
                </div>
                <div className="wine-grid">
                  {recentWines.map((wine) => (
                    <div
                      key={wine._id}
                      className="wine-item"
                      onClick={() => navigate(`/bodega?wine=${wine._id}`)}
                      role="button"
                      tabIndex={0}
                    >
                      {wine.image && (
                        <div className="wine-item__image">
                          <img src={wine.image} alt={wine.name} />
                        </div>
                      )}
                      <div className="wine-item__info">
                        <h3>{wine.name}</h3>
                        {wine.winery && <p className="wine-item__winery">{wine.winery}</p>}
                        {wine.vintage && <small>{wine.vintage}</small>}
                      </div>
                      {wine.rating > 0 && (
                        <div className="wine-item__rating">⭐ {wine.rating}</div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Suggestions / Explore */}
            <section className="home-page__section">
              <h2>Explorar</h2>
              <div className="explore-grid">
                <div className="explore-card" onClick={() => navigate("/bodega")} role="button" tabIndex={0}>
                  <div className="explore-card__icon">🍷</div>
                  <h3>Mi bodega</h3>
                  <p>Administra tu colección</p>
                </div>
                <div className="explore-card" onClick={() => navigate("/mapa")} role="button" tabIndex={0}>
                  <div className="explore-card__icon">🗺️</div>
                  <h3>Lugares cercanos</h3>
                  <p>Descubre bodegas y vinotecas</p>
                </div>
                <div className="explore-card" onClick={() => navigate("/comunidad")} role="button" tabIndex={0}>
                  <div className="explore-card__icon">👥</div>
                  <h3>Comunidad</h3>
                  <p>Explora lugares compartidos</p>
                </div>
              </div>
            </section>

            {/* Empty State */}
            {wines.length === 0 && (
              <section className="home-page__empty">
                <div className="empty-state">
                  <div className="empty-state__icon">🍷</div>
                  <h2>Tu bodega está vacía</h2>
                  <p>Escanea tu primer vino para comenzar</p>
                  <button
                    className="button button--primary"
                    onClick={() => setShowScanner(true)}
                    type="button"
                  >
                    Escanear etiqueta
                  </button>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default HomePage;
