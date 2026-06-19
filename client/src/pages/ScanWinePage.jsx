import { useState } from "react";
import LabelScanner from "../components/LabelScanner";
import { useToast } from "../context/ToastContext";
import { useWineCollection } from "../hooks/useWineCollection";
import { WINE_TYPES, WINERIES, REGIONS, VARIETALS } from "../data/wineReference";
import "../styles/pages/ScanWinePage.css";

const EMPTY_DRAFT = {
  label: "",
  winery: "",
  region: "",
  varietal: "",
  vintage: "",
  type: "unknown",
  notes: "",
  preview: "",
  rawText: "",
  ocrFailed: false,
};

const buildWinePayload = (draft) => ({
  name: draft.label?.trim() || "Vino sin nombre",
  winery: draft.winery?.trim() || "",
  vintage: draft.vintage ? Number.parseInt(draft.vintage, 10) : null,
  region: draft.region?.trim() || "",
  varietal: draft.varietal?.trim() || "",
  type: draft.type || "unknown",
  notes: draft.notes?.trim() || "",
  image: draft.preview || "",
  rawText: draft.rawText || "",
  quantity: 1,
});

export default function ScanWinePage() {
  const { showSuccess, showError } = useToast();
  const { wines, addWine } = useWineCollection();
  const [showScanner, setShowScanner] = useState(false);
  const [scanDraft, setScanDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const recentWines = [...wines]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 3);

  const handleCapture = (payload) => {
    setScanDraft({
      ...EMPTY_DRAFT,
      label: payload.label || "",
      vintage: payload.vintage || "",
      preview: payload.preview || "",
      rawText: payload.rawText || "",
      ocrFailed: Boolean(payload.ocrFailed),
    });
    setShowScanner(false);
  };

  const handleManualEntry = () => {
    setScanDraft({ ...EMPTY_DRAFT });
    setShowScanner(false);
  };

  const updateDraft = (field, value) => setScanDraft((prev) => ({ ...prev, [field]: value }));

  const handleSaveDraft = async () => {
    if (!scanDraft) return;

    const payload = buildWinePayload(scanDraft);
    if (!payload.name.trim()) {
      showError("Falta el nombre del vino");
      return;
    }

    try {
      setSaving(true);
      const createdWine = await addWine(payload);
      showSuccess(`"${createdWine.name}" agregado a tu bodega`);
      setScanDraft(null);
    } catch (error) {
      showError("No se pudo guardar el vino. Probá de nuevo.");
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelDraft = () => setScanDraft(null);

  return (
    <div className="scan-wine-page">
      {!scanDraft ? (
        <div className="scan-options">
          {!showScanner ? (
            <>
              <button
                className="btn-scan-large"
                onClick={() => setShowScanner(true)}
                type="button"
                aria-label="Escanear etiqueta de vino"
              >
                <span className="scan-icon">📸</span>
                <span className="scan-text">Escanear etiqueta</span>
                <span className="scan-hint">Foto o imagen de galería + lectura automática</span>
              </button>

              <button type="button" className="btn-manual-entry" onClick={handleManualEntry}>
                ✎ Agregar manualmente, sin escanear
              </button>
            </>
          ) : (
            <div className="scanner-shell">
              <LabelScanner onCapture={handleCapture} onCancel={() => setShowScanner(false)} />
            </div>
          )}

          {recentWines.length > 0 && (
            <div className="recent-section">
              <h3>Tus últimas incorporaciones</h3>
              <div className="recent-list">
                {recentWines.map((wine) => (
                  <div key={wine._id} className="recent-item">
                    <span className="recent-name">{wine.name}</span>
                    <span className="recent-date">
                      {wine.createdAt ? new Date(wine.createdAt).toLocaleDateString("es-AR") : ""}
                    </span>
                  </div>
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
              {scanDraft.ocrFailed && (
                <p className="scan-ocr-warning">
                  No pudimos leer la etiqueta automáticamente. Completá los datos a mano.
                </p>
              )}

              <div className="scan-edit-grid">
                <input
                  type="text"
                  className="scan-edit-input"
                  placeholder="Nombre del vino *"
                  value={scanDraft.label}
                  onChange={(event) => updateDraft("label", event.target.value)}
                />
                <input
                  type="text"
                  className="scan-edit-input"
                  placeholder="Bodega"
                  list="wine-wineries"
                  value={scanDraft.winery}
                  onChange={(event) => updateDraft("winery", event.target.value)}
                />
                <input
                  type="text"
                  className="scan-edit-input"
                  placeholder="Región"
                  list="wine-regions"
                  value={scanDraft.region}
                  onChange={(event) => updateDraft("region", event.target.value)}
                />
                <input
                  type="text"
                  className="scan-edit-input"
                  placeholder="Varietal"
                  list="wine-varietals"
                  value={scanDraft.varietal}
                  onChange={(event) => updateDraft("varietal", event.target.value)}
                />
                <input
                  type="number"
                  className="scan-edit-input"
                  placeholder="Año"
                  value={scanDraft.vintage}
                  onChange={(event) => updateDraft("vintage", event.target.value)}
                />
                <select
                  className="scan-edit-input"
                  value={scanDraft.type}
                  onChange={(event) => updateDraft("type", event.target.value)}
                  aria-label="Tipo de vino"
                >
                  <option value="unknown">Tipo de vino...</option>
                  {WINE_TYPES.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <textarea
                  className="scan-edit-textarea"
                  placeholder="Notas"
                  value={scanDraft.notes}
                  onChange={(event) => updateDraft("notes", event.target.value)}
                />
              </div>

              <datalist id="wine-wineries">
                {WINERIES.map((name) => <option key={name} value={name} />)}
              </datalist>
              <datalist id="wine-regions">
                {REGIONS.map((name) => <option key={name} value={name} />)}
              </datalist>
              <datalist id="wine-varietals">
                {VARIETALS.map((name) => <option key={name} value={name} />)}
              </datalist>

              <div className="result-actions">
                <button className="btn-cancel" onClick={handleCancelDraft} type="button" disabled={saving}>
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
