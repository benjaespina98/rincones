import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import LabelScanner from "../components/LabelScanner";
import Icon from "../components/Icon";
import StarRating from "../components/StarRating";
import LoadingSkeleton from "../components/LoadingSkeleton";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import WinePhoto from "../components/WinePhoto";
import { useToast } from "../context/ToastContext";
import { useWineCollection } from "../hooks/useWineCollection";
import { createWish } from "../services/wishApi";
import { searchWines } from "../services/wineSearchApi";
import { WINE_TYPE_LABELS } from "../data/wineReference";
import { successHaptic } from "../utils/haptics";
import ScanReview from "../components/ScanReview";
import { matchCatalogWine } from "../services/wineSearchApi";
import "../styles/pages/ScanWinePage.css";

// Atajos rápidos por varietal para arrancar la búsqueda sin escribir.
const QUICK_VARIETALS = [
  "Malbec", "Cabernet Sauvignon", "Cabernet Franc", "Pinot Noir",
  "Bonarda", "Syrah", "Torrontés", "Chardonnay", "Sauvignon Blanc",
];

const toWinePayload = (draft) => ({
  name: draft.name?.trim() || "Vino sin nombre",
  winery: draft.winery?.trim() || "",
  line: draft.line?.trim() || "",
  region: draft.region?.trim() || "",
  varietal: draft.varietal?.trim() || "",
  vintage: draft.vintage ? Number.parseInt(draft.vintage, 10) : null,
  type: draft.type || "unknown",
  image: draft.image || "",
  quantity: 1,
});

export default function ScanWinePage() {
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();
  const { addWine } = useWineCollection();

  const [showScanner, setShowScanner] = useState(false);
  // Lectura pendiente de revisión. SIEMPRE pasamos por acá tras una foto: es lo
  // que evita que un dato mal leído entre a la bodega sin que nadie lo vea.
  const [review, setReview] = useState(null);
  const [saving, setSaving] = useState(false);

  // Prefill desde la home Descubrí (?q=…): buscás allá y llegás acá con resultados.
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("q") || "");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [wishedIds, setWishedIds] = useState(() => new Set());
  // Cambia al tocar "Reintentar" y vuelve a disparar la búsqueda sin que el
  // usuario tenga que tocar el texto del buscador.
  const [retryToken, setRetryToken] = useState(0);

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
  }, [searchQuery, retryToken]);

  // Guarda el vino escaneado en la bodega y lleva directo a su ficha, que es
  // donde el usuario ve la descripción y puede editar/agregar momentos.
  const saveWine = async (draft) => {
    const created = await addWine(toWinePayload(draft));
    successHaptic();
    showSuccess(`"${created.name}" agregado a tu bodega`);
    navigate(`/vino/${created._id}`);
    return created;
  };

  // "Quiero probar": guarda un vino de la búsqueda en Guardados, aunque no lo
  // tengas todavía. La bodega es solo stock real y entra por escaneo.
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
        image: result.image || "",
        source: "search",
      });
      successHaptic();
      showSuccess(`"${result.name}" guardado en tu lista`);
    } catch {
      setWishedIds((prev) => {
        const n = new Set(prev);
        n.delete(result.id);
        return n;
      });
      showError("No se pudo guardar el vino en tu lista");
    }
  };

  // Tras la foto SIEMPRE mostramos la revisión. Enriquecemos con el catálogo,
  // pero sólo si hay una coincidencia confiable (el server aplica vetos duros):
  // antes se tomaba el primer resultado a ciegas y podía pisar región/uva/cosecha
  // con las de otra botella.
  const handleCapture = async (payload) => {
    setShowScanner(false);

    const values = {
      winery: payload.winery || "",
      line: payload.line || "",
      properName: payload.properName || "",
      varietal: payload.varietal || "",
      vintage: payload.vintage || "",
      region: payload.region || "",
      type: payload.type || "unknown",
    };
    const confidence = { ...(payload.confidence || {}) };

    let matchedFrom = null;
    if (values.winery || values.line || values.properName) {
      try {
        const match = await matchCatalogWine(values);
        if (match) {
          matchedFrom = match.source;
          // Sólo rellenamos huecos; nunca pisamos algo que se leyó con seguridad.
          for (const field of ["winery", "line", "varietal", "region", "type"]) {
            const current = values[field];
            const isEmpty = !current || (field === "type" && current === "unknown");
            if (isEmpty && match[field]) {
              values[field] = match[field];
              // Dato del catálogo: bueno, pero no leído de ESTA botella.
              confidence[field] = Math.max(confidence[field] || 0, 75);
            }
          }
        }
      } catch {
        // Sin enriquecimiento: revisamos lo que leyó el escáner.
      }
    }

    setReview({
      photo: payload.preview || "",
      source: payload.source || "",
      values,
      confidence,
      matchedFrom,
    });
  };

  // Carga manual: la misma pantalla de revisión, con todo vacío. Antes "Cargar a
  // mano" sólo dejaba escribir el nombre y el vino entraba con type "unknown".
  const startManual = () =>
    setReview({
      photo: "",
      source: "manual",
      values: { winery: "", line: "", properName: "", varietal: "", vintage: "", region: "", type: "unknown" },
      confidence: {},
      matchedFrom: null,
    });

  const handleConfirmReview = async (draft) => {
    if (!draft.name?.trim()) {
      showError("Escribí al menos la bodega o la línea del vino");
      return;
    }
    try {
      setSaving(true);
      await saveWine({ ...draft, image: review?.photo || "" });
      setReview(null);
    } catch {
      showError("No se pudo guardar el vino. Probá de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const handleWishReview = async (draft) => {
    if (!draft.name?.trim()) {
      showError("Escribí al menos la bodega o la línea del vino");
      return;
    }
    try {
      setSaving(true);
      await createWish({
        name: draft.name.trim(),
        winery: draft.winery || "",
        region: draft.region || "",
        varietal: draft.varietal || "",
        type: draft.type || "unknown",
        source: review?.source === "manual" ? "manual" : "ocr",
      });
      successHaptic();
      showSuccess(`"${draft.name.trim()}" guardado en tu lista`);
      setReview(null);
    } catch {
      showError("No se pudo guardar el vino en tu lista");
    } finally {
      setSaving(false);
    }
  };

  // --- Revisión de la lectura (siempre, tras foto o carga manual) ---
  if (review) {
    return (
      <div className="scan-wine-page">
        <ScanReview
          photo={review.photo}
          reading={review}
          matchedFrom={review.matchedFrom}
          saving={saving}
          onConfirm={handleConfirmReview}
          onWish={handleWishReview}
          onCancel={() => setReview(null)}
          onRescan={review.source === "manual" ? undefined : () => { setReview(null); setShowScanner(true); }}
        />
      </div>
    );
  }

  // --- Escáner abierto ---
  if (showScanner) {
    return (
      <div className="scan-wine-page">
        <div className="scanner-shell">
          <LabelScanner
            onCapture={handleCapture}
            onCancel={() => setShowScanner(false)}
            onManual={() => { setShowScanner(false); startManual(); }}
          />
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
            <ErrorState
              title="No pudimos completar la búsqueda"
              hint="Revisá tu conexión, o sacale una foto a la etiqueta."
              onRetry={() => setRetryToken((t) => t + 1)}
              compact
            />
          )}

          {!searchLoading && searched && !searchFailed && searchResults.length === 0 && (
            <EmptyState
              icon="search"
              title={`Sin resultados para “${searchQuery.trim()}”`}
              hint="Probá con el nombre de la bodega, o sacale una foto a la etiqueta y la leemos por vos."
              actionLabel="Escanear etiqueta"
              onAction={() => setShowScanner(true)}
              compact
            />
          )}

          {searchResults.length > 0 && (
            <ul className="wine-search__results">
              {searchResults.map((r) => (
                <li key={r.id} className="wine-result-card">
                  <button
                    type="button"
                    className="wine-result-card__open"
                    onClick={() => navigate("/descubrir/vino", { state: { wine: r } })}
                    aria-label={`Ver detalle de ${r.name}`}
                  >
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

                      <div className="wine-result-card__meta">
                        {r.varietal && <span className="wine-result-card__chip">{r.varietal}</span>}
                        {r.vintage && <span className="wine-result-card__chip">{r.vintage}</span>}
                        {r.region && (
                          <span className="wine-result-card__chip">
                            <Icon name="map-pin" size={13} /> {r.region}
                          </span>
                        )}
                      </div>

                      {r.rating > 0 && (
                        <div className="wine-result-card__rating">
                          <StarRating value={r.rating} size="sm" />
                          {r.reviewCount > 0 && (
                            <span className="wine-result-card__reviews">
                              ({r.reviewCount})
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </button>

                  <div className="wine-result-card__actions">
                    <button
                      type="button"
                      className={`wine-result-card__want ${wishedIds.has(r.id) ? "is-wished" : ""}`}
                      onClick={() => handleWishResult(r)}
                      disabled={wishedIds.has(r.id)}
                    >
                      {wishedIds.has(r.id) ? (
                        <><Icon name="check" size={16} /> Guardado</>
                      ) : (
                        <><Icon name="heart" size={16} /> Quiero probar</>
                      )}
                    </button>
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

        <button type="button" className="btn-manual-entry" onClick={startManual}>
          <Icon name="pencil" size={15} /> Cargar a mano
        </button>
      </div>
    </div>
  );
}
