import { useState } from "react";
import { useToast } from "../context/ToastContext";
import ConfirmModal from "../components/ConfirmModal";
import { createWine } from "../services/wineApi";
import "../styles/pages/ScanWinePage.css";

export default function ScanWinePage() {
  const { showSuccess, showInfo } = useToast();
  const [searchText, setSearchText] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recentScans, setRecentScans] = useState([
    { id: "1", name: "Château Margaux 2015", date: "Hoy" },
    { id: "2", name: "Vega Sicilia 2010", date: "Ayer" },
    { id: "3", name: "Álvaro Palacios 2019", date: "Hace 2 días" },
  ]);

  // Handlers
  const handleScanClick = () => {
    setShowScanner(true);
    showInfo("📸 Funcionalidad OCR en desarrollo. Usa búsqueda manual");
    setTimeout(() => setShowScanner(false), 1500);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (!searchText.trim()) return;

    setLoading(true);
    // Simular búsqueda
    setTimeout(() => {
      setScanResult({
        name: searchText,
        region: "Desconocida",
        type: "Tinto",
        year: 2020,
        rating: 4.0,
        price: 0,
        image: "🍷",
      });
      setLoading(false);
      showSuccess("✓ Vino encontrado");
    }, 1000);
  };

  const handleAddWine = () => {
    // TODO: Conectar con API cuando esté lista
    // await createWine(scanResult);
    setShowConfirm(true);
  };

  const confirmAddWine = () => {
    showSuccess(`✓ "${scanResult.name}" agregado a tu bodega`);
    setRecentScans([
      {
        id: Date.now().toString(),
        name: scanResult.name,
        date: "Hoy",
      },
      ...recentScans.slice(0, 4),
    ]);
    setScanResult(null);
    setSearchText("");
    setShowConfirm(false);
  };

  const handleCancel = () => {
    setScanResult(null);
    setSearchText("");
  };

  const handleRecentScanClick = (scan) => {
    setSearchText(scan.name);
    setScanResult({
      name: scan.name,
      region: "Desconocida",
      type: "Tinto",
      year: 2020,
      rating: 4.0,
      price: 0,
      image: "🍷",
    });
  };

  return (
    <div className="scan-wine-page">
      <header className="page-header">
        <h1>✨ Descubrir</h1>
        <p className="subtitle">Agrega nuevos vinos a tu bodega</p>
      </header>

      {!scanResult ? (
        <div className="scan-options">
          {/* Botón Escanear Grande */}
          <div className="scan-section">
            <button
              className={`btn-scan-large ${showScanner ? "scanning" : ""}`}
              onClick={handleScanClick}
              type="button"
              aria-label="Escanear etiqueta de vino"
              title="Escanear etiqueta de vino"
            >
              <span className="scan-icon">📸</span>
              <span className="scan-text">Escanear Etiqueta</span>
              <span className="scan-hint">Con tu cámara</span>
            </button>
          </div>

          {/* Divisor */}
          <div className="divider">O</div>

          {/* Búsqueda Manual */}
          <div className="search-section">
            <h3>Busca el vino</h3>
            <form onSubmit={handleSearch} className="search-form">
              <input
                type="text"
                placeholder="Ej: Château Margaux, Rioja, etc."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="search-input"
                autoFocus
                disabled={loading}
              />
              <button
                type="submit"
                className="btn-search"
                disabled={!searchText.trim() || loading}
              >
                {loading ? "🔄 Buscando..." : "🔍 Buscar"}
              </button>
            </form>
          </div>

          {/* Escaneos Recientes */}
          {recentScans.length > 0 && (
            <div className="recent-section">
              <h3>Escaneos Recientes</h3>
              <div className="recent-list">
                {recentScans.map((scan) => (
                  <button
                    key={scan.id}
                    className="recent-item"
                    onClick={() => handleRecentScanClick(scan)}
                    type="button"
                  >
                    <span className="recent-name">{scan.name}</span>
                    <span className="recent-date">{scan.date}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Info Útil (Shneiderman: recognition) */}
          <div className="info-section">
            <div className="info-card">
              <span className="info-icon">💡</span>
              <p>
                Busca por nombre, región o productor. Si no lo encuentras,
                agrega manual más tarde.
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* Resultado del Escaneo */
        <div className="scan-result">
          <div className="result-card">
            <div className="wine-image-wrapper">
              <div className="wine-image">{scanResult.image}</div>
            </div>

            <div className="wine-info">
              <h2 className="wine-name">{scanResult.name}</h2>
              <p className="wine-region">{scanResult.region}</p>

              <div className="wine-meta">
                <span className="wine-type">{scanResult.type}</span>
                <span className="wine-year">{scanResult.year}</span>
              </div>

              {scanResult.rating && (
                <div className="wine-rating">
                  <span>⭐ {scanResult.rating}</span>
                </div>
              )}
            </div>

            <div className="result-actions">
              <button
                className="btn-cancel"
                onClick={handleCancel}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="btn-add"
                onClick={handleAddWine}
                type="button"
              >
                ✓ Agregar a Bodega
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmación (Shneiderman: error prevention) */}
      <ConfirmModal
        isOpen={showConfirm}
        title="Agregar vino"
        message={`¿Deseas agregar "${scanResult?.name}" a tu bodega?`}
        confirmText="Agregar"
        cancelText="Cancelar"
        onConfirm={confirmAddWine}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
