import { useEffect, useState } from "react";
import LabelScanner from "../components/LabelScanner";
import Icon from "../components/Icon";
import LoadingSkeleton from "../components/LoadingSkeleton";
import { useToast } from "../context/ToastContext";
import { useWineCollection } from "../hooks/useWineCollection";
import { createWish } from "../services/wishApi";
import { searchWines } from "../services/wineSearchApi";
import { WINE_TYPES, WINE_TYPE_LABELS, WINERIES, REGIONS, VARIETALS, STORES } from "../data/wineReference";
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
  price: "",
  store: "",
  purchasedAt: "",
  quantity: "1",
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
  quantity: draft.quantity ? Number.parseInt(draft.quantity, 10) : 1,
  price: draft.price ? parseFloat(draft.price) : undefined,
  store: draft.store?.trim() || undefined,
  purchasedAt: draft.purchasedAt || undefined,
});

const buildWishPayload = (draft) => ({
  name: draft.label?.trim() || "Vino sin nombre",
  winery: draft.winery?.trim() || "",
  type: draft.type || "unknown",
  region: draft.region?.trim() || "",
  varietal: draft.varietal?.trim() || "",
  vintage: draft.vintage ? Number.parseInt(draft.vintage, 10) : undefined,
  notes: draft.notes?.trim() || "",
  source: draft.rawText ? "ocr" : "manual",
});

export default function ScanWinePage() {
  const { showSuccess, showError } = useToast();
  const { wines, addWine } = useWineCollection();
  const [showScanner, setShowScanner] = useState(false);
  const [scanDraft, setScanDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savingWish, setSavingWish] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const recentWines = [...wines]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 3);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearched(false);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchWines(q);
        setSearchResults(results);
        setSearched(true);
      } catch {
        setSearchResults([]);
        setSearched(true);
      } finally {
        setSearchLoading(false);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectResult = (result) => {
    setScanDraft({
      ...EMPTY_DRAFT,
      label: result.name || "",
      winery: result.winery || "",
      region: result.region || "",
      type: result.type || "unknown",
      preview: result.image || "",
    });
    setSearchQuery("");
    setSearchResults([]);
    setSearched(false);
  };

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

    // Enriquecer con datos reales: usamos el nombre leído por OCR para buscar
    // el vino en Open Food Facts y completar sólo los campos que quedaron vacíos.
    const detectedName = (payload.label || "").trim();
    if (detectedName.length >= 3) {
      searchWines(detectedName)
        .then(([match]) => {
          if (!match) return;
          setScanDraft((prev) => {
            if (!prev) return prev;
            const filledSomething =
              (!prev.winery && match.winery) ||
              (!prev.region && match.region) ||
              (!prev.preview && match.image) ||
              (prev.type === "unknown" && match.type !== "unknown");
            if (!filledSomething) return prev;
            return {
              ...prev,
              winery: prev.winery || match.winery || "",
              region: prev.region || match.region || "",
              type: prev.type !== "unknown" ? prev.type : match.type || "unknown",
              preview: prev.preview || match.image || "",
            };
          });
          showSuccess("Completamos datos desde Open Food Facts");
        })
        .catch(() => {});
    }
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

  const handleSaveWish = async () => {
    if (!scanDraft) return;
    const payload = buildWishPayload(scanDraft);
    if (!payload.name.trim()) {
      showError("Falta el nombre del vino");
      return;
    }
    try {
      setSavingWish(true);
      await createWish(payload);
      showSuccess(`"${payload.name}" agregado a tu lista de deseos`);
      setScanDraft(null);
    } catch {
      showError("No se pudo agregar a la lista de deseos");
    } finally {
      setSavingWish(false);
    }
  };

  const handleCancelDraft = () => setScanDraft(null);

  return (
    <div className="scan-wine-page">
      {!scanDraft ? (
        <div className="scan-options">
          {!showScanner ? (
            <>
              <section className="wine-search">
                <span className="section-eyebrow">Buscar vino conocido</span>
                <div className="wine-search__input-wrap">
                  <span className="wine-search__icon" aria-hidden="true">
                    <Icon name="search" size={18} />
                  </span>
                  <input
                    type="text"
                    className="wine-search__input"
                    placeholder="Ej: Catena Malbec, Rutini, Luigi Bosca..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Buscar vino conocido"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      className="wine-search__clear"
                      onClick={() => setSearchQuery("")}
                      aria-label="Limpiar búsqueda"
                    >
                      <Icon name="x" size={16} />
                    </button>
                  )}
                </div>

                {searchLoading && <LoadingSkeleton type="list" count={3} />}

                {!searchLoading && searched && searchResults.length === 0 && (
                  <p className="wine-search__empty">
                    Sin resultados. Probá otro nombre o escaneá la etiqueta.
                  </p>
                )}

                {searchResults.length > 0 && (
                  <>
                    <ul className="wine-search__results">
                      {searchResults.map((r) => (
                        <li key={r.id} className="wine-search-card">
                          <div className="wine-search-card__img">
                            {r.image ? (
                              <img src={r.image} alt={r.name} loading="lazy" />
                            ) : (
                              <span aria-hidden="true">🍷</span>
                            )}
                          </div>
                          <div className="wine-search-card__body">
                            <p className="wine-search-card__name">{r.name}</p>
                            {r.winery && (
                              <p className="wine-search-card__winery">{r.winery}</p>
                            )}
                            <div className="wine-search-card__meta">
                              {r.type && r.type !== "unknown" && (
                                <span className="wine-type-badge">{WINE_TYPE_LABELS[r.type]}</span>
                              )}
                              {r.region && (
                                <span className="wine-search-card__region">{r.region}</span>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="wine-search-card__add"
                            onClick={() => handleSelectResult(r)}
                            aria-label={`Cargar ${r.name}`}
                            title="Cargar datos"
                          >
                            <Icon name="plus" size={18} />
                          </button>
                        </li>
                      ))}
                    </ul>
                    <p className="wine-search__source">
                      Fuente:{" "}
                      {searchResults[0].source === "openfoodfacts"
                        ? "Open Food Facts"
                        : "catálogo demo"}
                    </p>
                  </>
                )}
              </section>

              <div className="scan-divider"><span>o</span></div>

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
                <Icon name="pencil" size={15} /> Agregar manualmente, sin escanear
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
                  onChange={(e) => updateDraft("label", e.target.value)}
                />
                <input
                  type="text"
                  className="scan-edit-input"
                  placeholder="Bodega"
                  list="scan-wineries"
                  value={scanDraft.winery}
                  onChange={(e) => updateDraft("winery", e.target.value)}
                />
                <input
                  type="text"
                  className="scan-edit-input"
                  placeholder="Región"
                  list="scan-regions"
                  value={scanDraft.region}
                  onChange={(e) => updateDraft("region", e.target.value)}
                />
                <input
                  type="text"
                  className="scan-edit-input"
                  placeholder="Varietal"
                  list="scan-varietals"
                  value={scanDraft.varietal}
                  onChange={(e) => updateDraft("varietal", e.target.value)}
                />
                <input
                  type="number"
                  className="scan-edit-input"
                  placeholder="Año"
                  value={scanDraft.vintage}
                  onChange={(e) => updateDraft("vintage", e.target.value)}
                />
                <select
                  className="scan-edit-input"
                  value={scanDraft.type}
                  onChange={(e) => updateDraft("type", e.target.value)}
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
                  onChange={(e) => updateDraft("notes", e.target.value)}
                />
              </div>

              <div className="scan-section-divider">
                <span>Datos de compra <small>(opcional)</small></span>
              </div>

              <div className="scan-edit-grid scan-edit-grid--purchase">
                <input
                  type="number"
                  className="scan-edit-input"
                  placeholder="Precio"
                  min="0"
                  step="0.01"
                  value={scanDraft.price}
                  onChange={(e) => updateDraft("price", e.target.value)}
                />
                <input
                  type="text"
                  className="scan-edit-input"
                  placeholder="Tienda o vinoteca"
                  list="scan-stores"
                  value={scanDraft.store}
                  onChange={(e) => updateDraft("store", e.target.value)}
                />
                <input
                  type="date"
                  className="scan-edit-input"
                  value={scanDraft.purchasedAt}
                  onChange={(e) => updateDraft("purchasedAt", e.target.value)}
                  aria-label="Fecha de compra"
                />
                <input
                  type="number"
                  className="scan-edit-input"
                  placeholder="Cantidad de botellas"
                  min="1"
                  value={scanDraft.quantity}
                  onChange={(e) => updateDraft("quantity", e.target.value)}
                />
              </div>

              <datalist id="scan-wineries">
                {WINERIES.map((n) => <option key={n} value={n} />)}
              </datalist>
              <datalist id="scan-regions">
                {REGIONS.map((n) => <option key={n} value={n} />)}
              </datalist>
              <datalist id="scan-varietals">
                {VARIETALS.map((n) => <option key={n} value={n} />)}
              </datalist>
              <datalist id="scan-stores">
                {STORES.map((n) => <option key={n} value={n} />)}
              </datalist>

              <div className="result-actions result-actions--column">
                <button className="btn-add" onClick={handleSaveDraft} type="button" disabled={saving || savingWish}>
                  {saving ? "Guardando..." : "Agregar a bodega"}
                </button>
                <button className="btn-wish" onClick={handleSaveWish} type="button" disabled={saving || savingWish}>
                  {savingWish ? "Guardando..." : "♡ Agregar a lista de deseos"}
                </button>
                <button className="btn-cancel" onClick={handleCancelDraft} type="button" disabled={saving || savingWish}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
