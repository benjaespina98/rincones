import { useState } from "react";
import LabelScanner from "../components/LabelScanner";
import { useToast } from "../context/ToastContext";
import { createWine } from "../services/wineApi";
import "../styles/pages/ScanWinePage.css";

const buildWinePayload = (draft) => ({
  name: draft.label?.trim() || draft.searchText?.trim() || "Vino sin nombre",
  winery: draft.winery?.trim() || "",
  vintage: draft.vintage ? Number.parseInt(draft.vintage, 10) : null,
  region: draft.region?.trim() || "",
  varietal: draft.varietal?.trim() || "",
  notes: draft.notes?.trim() || draft.rawText?.trim() || "",
  image: draft.preview || "",
  rawText: draft.rawText || draft.notes || "",
  rating: draft.rating ? Number.parseInt(draft.rating, 10) : 0,
  tasted: Boolean(draft.tasted),
});

export default function ScanWinePage() {
  const { showSuccess, showError, showInfo } = useToast();
  const [showScanner, setShowScanner] = useState(false);
  const [scanDraft, setScanDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [recentScans, setRecentScans] = useState([
    { id: "1", name: "Catena Zapata Malbec Argentino", date: "Hoy" },
    { id: "2", name: "Luigi Bosca Malbec", date: "Ayer" },
    { id: "3", name: "Rutini Cabernet Sauvignon", date: "Hace 2 días" },
  ]);

  const handleOpenScanner = () => {
    setShowScanner(true);
    showInfo("Tomá una foto de la etiqueta y completá los datos antes de guardar.");
  };

  const handleCapture = (payload) => {
    setScanDraft({
      label: payload.label || "",
      vintage: payload.vintage || "",
      notes: payload.notes || "",
      preview: payload.preview || "",
      rawText: payload.notes || "",
      winery: "",
      region: "",
      varietal: "",
      rating: 0,
      tasted: false,
      searchText: payload.label || "",
    });
    setShowScanner(false);
  };

  const handleSaveDraft = async () => {
    if (!scanDraft) {
      return;
    }

    const payload = buildWinePayload(scanDraft);
    if (!payload.name.trim()) {
      showError("Falta el nombre del vino");
      return;
    }

    try {
      setSaving(true);
      const createdWine = await createWine(payload);
      showSuccess(`✓ ${createdWine.name} agregado a tu bodega`);
      setRecentScans((prev) => [
        { id: Date.now().toString(), name: createdWine.name, date: "Hoy" },
        ...prev.slice(0, 4),
      ]);
      setScanDraft(null);
    } catch (error) {
      showError("No se pudo guardar el vino");
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelDraft = () => {
    setScanDraft(null);
  };

  const handleRecentScanClick = (scan) => {
    setScanDraft({
      label: scan.name,
      vintage: "",
      notes: "",
      preview: "",
      rawText: "",
      winery: "",
      region: "",
      varietal: "",
      rating: 0,
      tasted: false,
      searchText: scan.name,
    });
  };

  return (
    <div className="scan-wine-page">
      <header className="page-header">
        <h1>Descubrir</h1>
        <p className="subtitle">Escaneá, revisá y guardá vinos sin salir del flujo.</p>
      </header>

      {!scanDraft ? (
        <div className="scan-options">
          <div className="scan-section">
            {!showScanner ? (
              <button
                className="btn-scan-large"
                onClick={handleOpenScanner}
                type="button"
                aria-label="Escanear etiqueta de vino"
                title="Escanear etiqueta de vino"
              >
                <span className="scan-icon">📸</span>
                <span className="scan-text">Escanear etiqueta</span>
                <span className="scan-hint">Se analiza la foto y se guarda el draft</span>
              </button>
            ) : (
              <div className="scanner-shell">
                <LabelScanner onCapture={handleCapture} />
                <button className="btn-cancel" onClick={() => setShowScanner(false)} type="button">
                  Cancelar
                </button>
              </div>
            )}
          </div>

          <div className="divider">O</div>

          <div className="info-section">
            <div className="info-card">
              <span className="info-icon">💡</span>
              <p>
                Si el OCR no detecta bien la etiqueta, completá el nombre y el año antes de guardar.
              </p>
            </div>
          </div>

          {recentScans.length > 0 && (
            <div className="recent-section">
              <h3>Escaneos recientes</h3>
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
        </div>
      ) : (
        <div className="scan-result">
          <div className="result-card">
            <div className="wine-image-wrapper">
              {scanDraft.preview ? (
                <img src={scanDraft.preview} alt="Etiqueta escaneada" className="scan-preview" />
              ) : (
                <div className="wine-image">🍷</div>
              )}
            </div>

            <div className="wine-info">
              <h2 className="wine-name">{scanDraft.label || "Vino sin nombre"}</h2>
              <p className="wine-region">
                {scanDraft.region || scanDraft.winery || "Completá los datos para guardarlo"}
              </p>

              <div className="wine-meta">
                <span className="wine-type">{scanDraft.varietal || "Sin varietal"}</span>
                <span className="wine-year">{scanDraft.vintage || "Sin año"}</span>
              </div>

              <div className="scan-edit-grid">
                <input
                  type="text"
                  className="scan-edit-input"
                  placeholder="Nombre del vino"
                  value={scanDraft.label}
                  onChange={(event) => setScanDraft((prev) => ({ ...prev, label: event.target.value }))}
                />
                <input
                  type="text"
                  className="scan-edit-input"
                  placeholder="Bodega"
                  value={scanDraft.winery}
                  onChange={(event) => setScanDraft((prev) => ({ ...prev, winery: event.target.value }))}
                />
                <input
                  type="text"
                  className="scan-edit-input"
                  placeholder="Región"
                  value={scanDraft.region}
                  onChange={(event) => setScanDraft((prev) => ({ ...prev, region: event.target.value }))}
                />
                <input
                  type="text"
                  className="scan-edit-input"
                  placeholder="Varietal"
                  value={scanDraft.varietal}
                  onChange={(event) => setScanDraft((prev) => ({ ...prev, varietal: event.target.value }))}
                />
                <input
                  type="text"
                  className="scan-edit-input"
                  placeholder="Año"
                  value={scanDraft.vintage}
                  onChange={(event) => setScanDraft((prev) => ({ ...prev, vintage: event.target.value }))}
                />
                <textarea
                  className="scan-edit-textarea"
                  placeholder="Notas"
                  value={scanDraft.notes}
                  onChange={(event) => setScanDraft((prev) => ({ ...prev, notes: event.target.value }))}
                />
              </div>

              <div className="result-actions">
                <button className="btn-cancel" onClick={handleCancelDraft} type="button">
                  Cancelar
                </button>
                <button className="btn-add" onClick={handleSaveDraft} type="button" disabled={saving}>
                  {saving ? "Guardando..." : "Agregar a bodega"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
