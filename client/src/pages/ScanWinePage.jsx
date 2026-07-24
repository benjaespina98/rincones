import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import LabelScanner from "../components/LabelScanner";
import Icon from "../components/Icon";
import StarRating from "../components/StarRating";
import LoadingSkeleton from "../components/LoadingSkeleton";
import WinePhoto from "../components/WinePhoto";
import { useToast } from "../context/ToastContext";
import { useWineCollection } from "../hooks/useWineCollection";
import { createWish } from "../services/wishApi";
import { searchWines } from "../services/wineSearchApi";
import { WINE_TYPE_LABELS } from "../data/wineReference";
import { successHaptic } from "../utils/haptics";
import "../styles/pages/ScanWinePage.css";

// Umbral de confianza para guardar sin preguntar. Por debajo pedimos confirmar
// el nombre, que es el único dato que realmente no podemos inventar.
const CONFIDENCE_THRESHOLD = 45;

// Atajos rápidos por varietal para arrancar la búsqueda sin escribir.
const QUICK_VARIETALS = [
  "Malbec", "Cabernet Sauvignon", "Cabernet Franc", "Pinot Noir",
  "Bonarda", "Syrah", "Torrontés", "Chardonnay", "Sauvignon Blanc",
];

const toWinePayload = (draft) => ({
  name: draft.name?.trim() || "Vino sin nombre",
  winery: draft.winery?.trim() || "",
  region: draft.region?.trim() || "",
  varietal: draft.varietal?.trim() || "",
  vintage: draft.vintage ? Number.parseInt(draft.vintage, 10) : null,
  type: draft.type || "unknown",
  image: draft.image || "",
  quantity: 1,
});

export default function ScanWinePage() {
  const navigate = useNavigate();
  const { showSuccess, showError, addToast } = useToast();
  const { addWine } = useWineCollection();

  const [showScanner, setShowScanner] = useState(false);
  // Sólo se usa cuando la lectura fue dudosa: pedimos confirmar el nombre.
  const [pending, setPending] = useState(null);
  const [saving, setSaving] = useState(false);

  // Prefill desde la home Descubrí (?q=…): buscás allá y llegás acá con resultados.
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("q") || "");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [addingId, setAddingId] = useState(null);
  const [addedIds, setAddedIds] = useState(() => new Set());
  const [wishedIds, setWishedIds] = useState(() => new Set());

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearched(false);
      setSearchFailed(false);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchWines(q);
        setSearchResults(results);
        setSearchFailed(false);
      } catch {
        // Distinguimos "no hay resultados" de "no pudimos buscar": antes ambos
        // casos mostraban el mismo mensaje y escondían fallas de red.
        setSearchResults([]);
        setSearchFailed(true);
      } finally {
        setSearched(true);
        setSearchLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Guarda y avisa. La edición vive en la ficha del vino, así que el toast
  // ofrece ir directo ahí en lugar de abrir un formulario acá.
  const saveWine = async (draft) => {
    const created = await addWine(toWinePayload(draft));
    successHaptic();
    addToast(`"${created.name}" agregado a tu bodega`, "success", 5000, {
      label: "Editar",
      onClick: () => navigate(`/vino/${created._id}`),
    });
    return created;
  };

  const handleAddResult = async (result) => {
    if (addingId || addedIds.has(result.id)) return;
    try {
      setAddingId(result.id);
      await saveWine(result);
      setAddedIds((prev) => new Set(prev).add(result.id));
    } catch {
      showError("No se pudo agregar el vino. Probá de nuevo.");
    } finally {
      setAddingId(null);
    }
  };

  // "Lo quiero": guarda un vino de la búsqueda en la lista de deseos, aunque no
  // lo tengas todavía. Es el flujo "me gusta / lo quiero comprar".
  const handleWishResult = async (result) => {
    if (wishedIds.has(result.id)) return;
    try {
      setWishedIds((prev) => new Set(prev).add(result.id));
      await createWish({
        name: result.name || "Vino sin nombre",
        winery: result.winery || "",
        region: result.region || "",
        varietal: result.varietal || "",
        type: result.type || "unknown",
        source: "search",
      });
      successHaptic();
      showSuccess(`"${result.name}" agregado a tu lista de deseos`);
    } catch {
      setWishedIds((prev) => {
        const n = new Set(prev);
        n.delete(result.id);
        return n;
      });
      showError("No se pudo agregar a la lista de deseos");
    }
  };

  const handleCapture = async (payload) => {
    setShowScanner(false);
    const detected = (payload.label || "").trim();

    // Completamos huecos con el catálogo antes de guardar, así el vino entra
    // con bodega/región/tipo aunque la etiqueta se haya leído a medias.
    let match = null;
    if (detected.length >= 3) {
      try {
        [match] = await searchWines(detected);
      } catch {
        // Sin enriquecimiento: guardamos lo que leyó el escáner.
      }
    }

    const draft = {
      name: detected || match?.name || "",
      winery: payload.winery || match?.winery || "",
      region: payload.region || match?.region || "",
      varietal: payload.varietal || match?.varietal || "",
      vintage: payload.vintage || match?.vintage || "",
      type: payload.type && payload.type !== "unknown" ? payload.type : match?.type || "unknown",
      image: payload.preview || match?.image || "",
    };

    const confident =
      !payload.ocrFailed &&
      draft.name.length >= 3 &&
      (payload.confidence == null || payload.confidence >= CONFIDENCE_THRESHOLD);

    if (!confident) {
      setPending(draft);
      return;
    }

    try {
      setSaving(true);
      await saveWine(draft);
    } catch {
      showError("No se pudo guardar el vino. Probá de nuevo.");
      setPending(draft);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmPending = async () => {
    if (!pending?.name.trim()) {
      showError("Falta el nombre del vino");
      return;
    }
    try {
      setSaving(true);
      await saveWine(pending);
      setPending(null);
    } catch {
      showError("No se pudo guardar el vino. Probá de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const handleWishPending = async () => {
    if (!pending?.name.trim()) {
      showError("Falta el nombre del vino");
      return;
    }
    try {
      setSaving(true);
      await createWish({
        name: pending.name.trim(),
        winery: pending.winery || "",
        region: pending.region || "",
        varietal: pending.varietal || "",
        type: pending.type || "unknown",
        source: "ocr",
      });
      showSuccess(`"${pending.name.trim()}" agregado a tu lista de deseos`);
      setPending(null);
    } catch {
      showError("No se pudo agregar a la lista de deseos");
    } finally {
      setSaving(false);
    }
  };

  // --- Confirmación de lectura dudosa ---
  if (pending) {
    return (
      <div className="scan-wine-page">
        <div className="scan-confirm">
          <div className="scan-confirm__media">
            {pending.image ? (
              <img src={pending.image} alt="Etiqueta escaneada" />
            ) : (
              <span aria-hidden="true">🍷</span>
            )}
          </div>

          <p className="scan-confirm__title">¿Cómo se llama este vino?</p>
          <p className="scan-confirm__hint">
            {pending.manual
              ? "Con el nombre alcanza para empezar. El resto lo completás después si querés."
              : "No pudimos leer la etiqueta con claridad. Confirmá el nombre y listo — el resto lo completás después."}
          </p>

          <input
            type="text"
            className="scan-confirm__input"
            placeholder="Nombre del vino"
            value={pending.name}
            onChange={(e) => setPending((p) => ({ ...p, name: e.target.value }))}
            aria-label="Nombre del vino"
            autoFocus
          />

          {(pending.winery || pending.region) && (
            <div className="scan-confirm__meta">
              {pending.winery && <span className="scan-confirm__chip">{pending.winery}</span>}
              {pending.region && (
                <span className="scan-confirm__chip">
                  <Icon name="map-pin" size={13} /> {pending.region}
                </span>
              )}
            </div>
          )}

          <div className="result-actions result-actions--column">
            <button type="button" className="btn-add" onClick={handleConfirmPending} disabled={saving}>
              {saving ? "Guardando…" : "Agregar a mi bodega"}
            </button>
            <button type="button" className="btn-wish" onClick={handleWishPending} disabled={saving}>
              ♡ A la lista de deseos
            </button>
            <button
              type="button"
              className="btn-cancel"
              onClick={() => setPending(null)}
              disabled={saving}
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Escáner abierto ---
  if (showScanner) {
    return (
      <div className="scan-wine-page">
        <div className="scanner-shell">
          <LabelScanner onCapture={handleCapture} onCancel={() => setShowScanner(false)} />
        </div>
      </div>
    );
  }

  // --- Vista principal: buscar o escanear ---
  return (
    <div className="scan-wine-page">
      <div className="scan-options">
        <section className="wine-search">
          <div className="wine-search__input-wrap">
            <span className="wine-search__icon" aria-hidden="true">
              <Icon name="search" size={18} />
            </span>
            <input
              type="text"
              className="wine-search__input"
              placeholder="Buscá un vino: Catena, Rutini, Torrontés…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Buscar vino"
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

          {/* Atajos por varietal cuando todavía no buscaste nada. */}
          {!searchQuery && !searched && (
            <div className="wine-search__chips">
              <span className="wine-search__chips-label">Buscá por varietal</span>
              <div className="wine-search__chips-row">
                {QUICK_VARIETALS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="wine-search__chip"
                    onClick={() => setSearchQuery(v)}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          )}

          {searchLoading && <LoadingSkeleton type="list" count={3} />}

          {!searchLoading && searched && searchFailed && (
            <p className="wine-search__empty">
              No pudimos completar la búsqueda. Probá de nuevo o escaneá la etiqueta.
            </p>
          )}

          {!searchLoading && searched && !searchFailed && searchResults.length === 0 && (
            <p className="wine-search__empty">
              Sin resultados. Probá otro nombre o escaneá la etiqueta.
            </p>
          )}

          {searchResults.length > 0 && (
            <ul className="wine-search__results">
              {searchResults.map((r) => (
                <li key={r.id} className="wine-result-card">
                  <div className="wine-result-card__media">
                    <WinePhoto src={r.image} type={r.type} alt={r.name} artSize={92} />
                    {r.type && r.type !== "unknown" && (
                      <span className="wine-result-card__type">{WINE_TYPE_LABELS[r.type]}</span>
                    )}
                  </div>

                  <div className="wine-result-card__body">
                    <p className="wine-result-card__name" title={r.name}>{r.name}</p>
                    <p className="wine-result-card__winery">
                      {r.winery || "Bodega no especificada"}
                    </p>

                    {(r.region || r.vintage) && (
                      <div className="wine-result-card__meta">
                        {r.region && (
                          <span className="wine-result-card__chip">
                            <Icon name="map-pin" size={13} /> {r.region}
                          </span>
                        )}
                        {r.vintage && <span className="wine-result-card__chip">{r.vintage}</span>}
                      </div>
                    )}

                    {r.rating > 0 && (
                      <div className="wine-result-card__rating">
                        <StarRating value={r.rating} size="sm" />
                      </div>
                    )}

                    <div className="wine-result-card__actions">
                      <button
                        type="button"
                        className={`wine-result-card__add ${addedIds.has(r.id) ? "is-added" : ""}`}
                        onClick={() => handleAddResult(r)}
                        disabled={addingId === r.id || addedIds.has(r.id)}
                      >
                        {addedIds.has(r.id) ? (
                          <><Icon name="check" size={16} /> En tu bodega</>
                        ) : addingId === r.id ? (
                          "Agregando…"
                        ) : (
                          <><Icon name="plus" size={16} /> Agregar</>
                        )}
                      </button>
                      <button
                        type="button"
                        className={`wine-result-card__wish ${wishedIds.has(r.id) ? "is-wished" : ""}`}
                        onClick={() => handleWishResult(r)}
                        disabled={wishedIds.has(r.id)}
                        aria-label={wishedIds.has(r.id) ? "En tu lista de deseos" : "Agregar a la lista de deseos"}
                        title={wishedIds.has(r.id) ? "En tu lista de deseos" : "Lo quiero (lista de deseos)"}
                      >
                        <Icon name="heart" filled={wishedIds.has(r.id)} size={16} />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="scan-divider"><span>o</span></div>

        <button
          className="btn-scan-large"
          onClick={() => setShowScanner(true)}
          type="button"
          aria-label="Escanear etiqueta de vino"
          disabled={saving}
        >
          <span className="scan-icon"><Icon name="camera" size={26} /></span>
          <span className="scan-text">{saving ? "Guardando…" : "Escanear etiqueta"}</span>
          <span className="scan-hint">Sacá una foto y lo agregamos solo</span>
        </button>

        <button
          type="button"
          className="btn-manual-entry"
          onClick={() =>
            setPending({
              name: "",
              winery: "",
              region: "",
              varietal: "",
              vintage: "",
              type: "unknown",
              image: "",
              manual: true,
            })
          }
        >
          <Icon name="pencil" size={15} /> Cargar a mano
        </button>
      </div>
    </div>
  );
}
