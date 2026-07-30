import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ConfirmModal from "../components/ConfirmModal";
import Icon from "../components/Icon";
import LoadingSkeleton from "../components/LoadingSkeleton";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import StarRating from "../components/StarRating";
import WineReviews from "../components/WineReviews";
import WineStructure from "../components/WineStructure";
import WineOpinion from "../components/WineOpinion";
import { useToast } from "../context/ToastContext";
import {
  getWineById,
  updateWine,
  deleteWine,
  adjustWineStock,
  openBottle,
  undoOpenBottle,
  getWineMoments,
  addWineMoment,
} from "../services/wineApi";
import { describeWine, getWinePrice, mercadoLibreUrl } from "../services/wineSearchApi";
import { wineDisplayName } from "../utils/wineIdentity";
import { shareWine } from "../utils/share";
import { WINE_TYPES, WINE_TYPE_LABELS, WINERIES, REGIONS, VARIETALS, STORES } from "../data/wineReference";
import { getCellarStatus } from "../utils/cellarStatus";
import { toUploadableDataUrl } from "../utils/image";
import WinePhoto from "../components/WinePhoto";
import Dropdown from "../components/Dropdown";
import "../styles/pages/WineDetailPage.css";

const OCCASIONS = [
  { value: "dinner", label: "Cena" },
  { value: "celebration", label: "Celebración" },
  { value: "gift", label: "Regalo" },
  { value: "tasting", label: "Degustación" },
  { value: "casual", label: "Casual" },
  { value: "other", label: "Otra" },
];

const EMOTIONS = [
  { value: "happy", label: "Feliz" },
  { value: "relaxed", label: "Relajado" },
  { value: "social", label: "Social" },
  { value: "thoughtful", label: "Reflexivo" },
  { value: "adventurous", label: "Aventurero" },
];

const EMPTY_MOMENT = {
  occasion: "",
  companions: "",
  place: "",
  emotion: "",
  foodPairing: "",
  notes: "",
  rating: 0,
  photos: [],
};

export default function WineDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast, removeToast, showSuccess, showError } = useToast();

  const [wine, setWine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [loadFailed, setLoadFailed] = useState(false);

  const [moments, setMoments] = useState([]);
  const [momentsLoading, setMomentsLoading] = useState(true);
  const [momentsFailed, setMomentsFailed] = useState(false);
  const [showMomentForm, setShowMomentForm] = useState(false);
  const [momentDraft, setMomentDraft] = useState(EMPTY_MOMENT);
  const [savingMoment, setSavingMoment] = useState(false);

  // Ficha generada por IA (descripción, aromas, maridaje) — estilo Vivino.
  const [aiInfo, setAiInfo] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiFailed, setAiFailed] = useState(false);
  // Precio comunitario (promedio de lo que pagó la gente). `priceLoading` evita
  // afirmar "sin datos aún" mientras la petición sigue en vuelo.
  const [communityPrice, setCommunityPrice] = useState(null);
  const [priceLoading, setPriceLoading] = useState(true);

  const loadWine = useCallback(async () => {
    try {
      setLoading(true);
      setLoadFailed(false);
      const data = await getWineById(id);
      if (!data) {
        setNotFound(true);
      } else {
        setWine(data);
      }
    } catch (err) {
      // Un 404 sí es "no existe"; cualquier otra cosa (red caída, 500) es un
      // fallo de carga. Antes todo caía en "puede que ya lo hayas eliminado",
      // que es una atribución alarmante y falsa.
      if (err?.response?.status === 404) setNotFound(true);
      else setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadMoments = useCallback(async () => {
    try {
      setMomentsLoading(true);
      setMomentsFailed(false);
      const data = await getWineMoments(id);
      setMoments(data);
    } catch {
      setMomentsFailed(true);
    } finally {
      setMomentsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadWine();
    loadMoments();
  }, [loadWine, loadMoments]);

  // Traemos la ficha del vino (IA + cache) una vez que sabemos su nombre.
  const wineName = wine?.name;
  const wineWinery = wine?.winery;
  // La uva es parte de la identidad del vino para todo lo compartido (precio,
  // fotos, búsqueda en tiendas): el nombre visible ya no la incluye.
  const wineVarietal = wine?.varietal;

  // Extraído a callback para poder reintentar desde la UI sin recargar la página.
  const loadDescription = useCallback((force = false) => {
    if (!wineName) return undefined;

    // Si el vino ya trae la ficha persistida (se genera al crearlo), la usamos
    // y no gastamos una llamada por cada apertura del detalle.
    if (!force && wine?.description?.generatedAt) {
      setAiInfo(wine.description);
      setAiLoading(false);
      setAiFailed(false);
      return undefined;
    }

    let active = true;
    setAiLoading(true);
    setAiFailed(false);
    describeWine({
      name: wineName,
      winery: wineWinery,
      varietal: wine?.varietal,
      type: wine?.type,
      region: wine?.region,
      vintage: wine?.vintage,
    })
      .then((info) => {
        if (active) setAiInfo(info);
      })
      .catch(() => {
        if (active) setAiFailed(true);
      })
      .finally(() => {
        if (active) setAiLoading(false);
      });
    return () => {
      active = false;
    };
    // Sólo depende del vino (nombre+bodega); el resto son datos estables del mismo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wineName, wineWinery, wine?.description?.generatedAt]);

  useEffect(() => loadDescription(), [loadDescription]);

  useEffect(() => {
    if (!wineName) return undefined;
    let active = true;
    setPriceLoading(true);
    getWinePrice(wineName, wineWinery, wineVarietal)
      .then((p) => { if (active) setCommunityPrice(p); })
      .catch(() => { if (active) setCommunityPrice(null); })
      .finally(() => { if (active) setPriceLoading(false); });
    return () => {
      active = false;
    };
  }, [wineName, wineWinery, wineVarietal]);

  const applyUpdate = async (payload, successMessage) => {
    setPending(true);
    try {
      const updated = await updateWine(id, payload);
      setWine(updated);
      if (successMessage) showSuccess(successMessage);
    } catch {
      showError("No se pudo actualizar el vino");
    } finally {
      setPending(false);
    }
  };

  const handleToggleFavorite = () =>
    applyUpdate(
      { favorite: !wine.favorite },
      wine.favorite ? "Eliminado de favoritos" : "Agregado a favoritos"
    );

  // "Probado" dice si alguna vez lo tomaste. Es un dato de tu historial y no
  // mueve el stock: podés haber probado un vino que no era tuyo, o querer
  // corregir el dato sin que aparezca ni desaparezca una botella de tu cava.
  const handleToggleTasted = () =>
    applyUpdate(
      { tasted: !wine.tasted },
      wine.tasted ? "Marcado como no probado" : "Vino marcado como probado"
    );

  const handleAdjustQuantity = async (delta) => {
    if (delta < 0 && Number(wine.quantity) <= 0) return;
    setPending(true);
    try {
      const updated = await adjustWineStock(id, delta);
      setWine(updated);
    } catch {
      showError("No se pudo ajustar el stock");
    } finally {
      setPending(false);
    }
  };

  /**
   * Abrir una botella: la descuenta y deja el vino probado, en un solo paso.
   * Con deshacer al lado, igual que en la lista: cuesta una botella y se
   * dispara con un toque.
   */
  const handleOpenBottle = async () => {
    if (Number(wine.quantity) <= 0) return;
    const eraProbado = wine.tasted === true;
    const quedan = Math.max(0, Number(wine.quantity) - 1);
    setPending(true);
    try {
      const updated = await openBottle(id);
      setWine(updated);

      const mensaje =
        quedan === 0
          ? `Se terminó tu ${wineDisplayName(wine)}`
          : `Botella abierta · te ${quedan === 1 ? "queda 1" : `quedan ${quedan}`}`;

      const toastId = addToast(mensaje, "success", 8000, {
        label: "Deshacer",
        onClick: async () => {
          removeToast(toastId);
          try {
            setWine(await undoOpenBottle(id, eraProbado));
            showSuccess("Botella devuelta a tu bodega");
          } catch {
            showError("No se pudo deshacer");
          }
        },
      });
    } catch {
      showError("No se pudo registrar la botella");
    } finally {
      setPending(false);
    }
  };

  const startEditing = () => {
    setDraft({
      name: wine.name || "",
      winery: wine.winery || "",
      region: wine.region || "",
      varietal: wine.varietal || "",
      vintage: wine.vintage || "",
      type: wine.type || "unknown",
      notes: wine.notes || "",
      cellarLocation: wine.cellar?.location || "",
      drinkFrom: wine.cellar?.drinkFrom || "",
      drinkUntil: wine.cellar?.drinkUntil || "",
      price: wine.purchase?.price ?? "",
      store: wine.purchase?.store || "",
      purchasedAt: wine.purchase?.purchasedAt
        ? new Date(wine.purchase.purchasedAt).toISOString().split("T")[0]
        : "",
    });
    setEditing(true);
  };

  const updateDraftField = (field, value) => setDraft((prev) => ({ ...prev, [field]: value }));

  const handleSaveEdit = async () => {
    if (!draft.name.trim()) {
      showError("El nombre no puede estar vacío");
      return;
    }

    setSaving(true);
    try {
      const updated = await updateWine(id, {
        name: draft.name.trim(),
        winery: draft.winery.trim(),
        region: draft.region.trim(),
        varietal: draft.varietal.trim(),
        vintage: draft.vintage ? Number.parseInt(draft.vintage, 10) : null,
        type: draft.type,
        notes: draft.notes.trim(),
        cellarLocation: draft.cellarLocation?.trim() || undefined,
        drinkFrom: draft.drinkFrom ? parseInt(draft.drinkFrom) : undefined,
        drinkUntil: draft.drinkUntil ? parseInt(draft.drinkUntil) : undefined,
        price: draft.price !== "" ? parseFloat(draft.price) : undefined,
        store: draft.store?.trim() || undefined,
        purchasedAt: draft.purchasedAt || undefined,
      });
      setWine(updated);
      setEditing(false);
      showSuccess("Cambios guardados");
    } catch {
      showError("No se pudieron guardar los cambios");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setShowDeleteConfirm(false);
    try {
      await deleteWine(id);
      showSuccess(`"${wineDisplayName(wine)}" eliminado de tu bodega`);
      navigate("/bodega");
    } catch {
      showError("No se pudo eliminar el vino");
    }
  };

  const handleAddMoment = async (event) => {
    event.preventDefault();
    setSavingMoment(true);
    try {
      await addWineMoment(id, momentDraft);
      showSuccess("Momento agregado");
      setMomentDraft(EMPTY_MOMENT);
      setShowMomentForm(false);
      await Promise.all([loadWine(), loadMoments()]);
    } catch {
      showError("No se pudo guardar el momento");
    } finally {
      setSavingMoment(false);
    }
  };

  const occasionLabel = useMemo(
    () => (value) => OCCASIONS.find((o) => o.value === value)?.label || value,
    []
  );
  const emotionLabel = useMemo(
    () => (value) => EMOTIONS.find((e) => e.value === value)?.label || value,
    []
  );

  if (loading) {
    return (
      <div className="wine-detail-page">
        <LoadingSkeleton type="detail" />
      </div>
    );
  }

  // Fallo de carga ≠ vino inexistente: acá ofrecemos reintentar.
  if (loadFailed) {
    return (
      <div className="wine-detail-page">
        <ErrorState
          title="No pudimos cargar el vino"
          hint="Puede ser tu conexión. El vino sigue en tu bodega."
          onRetry={loadWine}
        />
      </div>
    );
  }

  if (notFound || !wine) {
    return (
      <div className="wine-detail-page">
        <EmptyState
          icon="bottle"
          title="No encontramos este vino"
          hint="Puede que ya lo hayas eliminado de tu bodega."
          actionLabel="Volver a mi bodega"
          onAction={() => navigate("/bodega")}
        />
      </div>
    );
  }

  return (
    <div className="wine-detail-page">
      <div className="wine-detail-hero">
        <div className="wine-detail-hero__placeholder">
          <WinePhoto src={wine.image} type={wine.type} alt={wineDisplayName(wine)} artSize={150} priority />
        </div>

        <div className="wine-detail-hero__badges">
          {wine.favorite && (
            <span className="hero-badge hero-badge--fav" title="Favorito">
              <Icon name="heart" filled size={15} />
            </span>
          )}
          {wine.tasted && (
            <span className="hero-badge hero-badge--tasted" title="Probado">
              <Icon name="check" size={16} />
            </span>
          )}
        </div>

        {!editing && (
          <div className="wine-detail-hero__actions">
            <button
              type="button"
              className="wine-detail-hero__icon-btn"
              onClick={async () => {
                const r = await shareWine(wine);
                if (r === "copied") showSuccess("Copiado al portapapeles");
              }}
              aria-label="Compartir vino"
              title="Compartir"
            >
              <Icon name="share" size={16} />
            </button>
            <button type="button" className="wine-detail-hero__icon-btn" onClick={startEditing} aria-label="Editar vino" title="Editar">
              <Icon name="pencil" size={16} />
            </button>
          </div>
        )}

        <div className="wine-detail-hero__overlay">
          <h1 className="wine-detail-hero__name">{wineDisplayName(wine)}</h1>
          <p className="wine-detail-hero__origin">
            {[wine.winery, wine.region].filter(Boolean).join(" · ") || "Sin datos de origen"}
          </p>
        </div>
      </div>

      <div className="wine-detail-body">
        {!editing ? (
          <>
            <div className="wine-detail-meta chip-row">
              <span className="chip chip--type">{WINE_TYPE_LABELS[wine.type] || WINE_TYPE_LABELS.unknown}</span>
              {wine.vintage && <span className="chip chip--year">{wine.vintage}</span>}
              {wine.varietal && <span className="chip chip--grape">{wine.varietal}</span>}
              {(() => {
                const cs = getCellarStatus(wine);
                if (!cs.label) return null;
                return (
                  <span className={`cellar-badge cellar-badge--${cs.status}`}>
                    <span className="cellar-dot" aria-hidden="true" /> {cs.label}
                  </span>
                );
              })()}
            </div>

            {/* Una sola calificación: puntuar ES tu opinión pública. Antes había
                dos widgets de estrellas en esta misma pantalla. */}
            <WineOpinion
              name={wine.name}
              winery={wine.winery}
              onRated={(value) => {
                // Se guarda también en el vino para que las estadísticas, los
                // filtros y el orden de Bodega sigan funcionando.
                setWine((w) => ({ ...w, rating: value }));
                updateWine(id, { rating: value }).catch(() => {});
              }}
            />

            {/* Opiniones de otros (el promedio y las reseñas ajenas). */}
            <WineReviews name={wine.name} winery={wine.winery} />

            {/* Ficha del vino (estilo Vivino): descripción, aromas, maridaje. */}
            {(aiLoading || aiInfo || aiFailed) && (
              <div className="wine-about">
                <div className="wine-about__head">
                  <h3><Icon name="sparkles" size={16} /> Sobre este vino</h3>
                  {aiInfo && !aiInfo.known && (
                    <span className="wine-about__tag" title="Descripción general del estilo, no del vino puntual">
                      aproximado
                    </span>
                  )}
                </div>

                {aiLoading && <LoadingSkeleton type="inline" count={3} />}

                {aiFailed && !aiLoading && (
                  <ErrorState
                    title="No pudimos generar la descripción"
                    hint="La ficha del vino se arma con IA y a veces tarda."
                    onRetry={() => loadDescription(true)}
                    compact
                  />
                )}

                {aiInfo && !aiLoading && (
                  <>
                    {aiInfo.summary && <p className="wine-about__summary">{aiInfo.summary}</p>}
                    {aiInfo.body && <p className="wine-about__body">{aiInfo.body}</p>}

                    <WineStructure structure={aiInfo.structure} />

                {aiInfo.profile?.length > 0 && (
                      <div className="wine-about__profile">
                        {aiInfo.profile.map((p) => (
                          <span key={p} className="wine-about__pill">{p}</span>
                        ))}
                      </div>
                    )}

                    {aiInfo.aromas?.length > 0 && (
                      <div className="wine-about__block">
                        <span className="wine-about__label">Aromas y sabores</span>
                        <div className="wine-about__chips">
                          {aiInfo.aromas.map((a) => (
                            <span key={a} className="wine-about__chip">{a}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {aiInfo.foodPairing?.length > 0 && (
                      <div className="wine-about__block">
                        <span className="wine-about__label">Marida con</span>
                        <div className="wine-about__chips">
                          {aiInfo.foodPairing.map((f) => (
                            <span key={f} className="wine-about__chip wine-about__chip--food"><Icon name="utensils" size={13} /> {f}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {(aiInfo.alcohol || aiInfo.serve) && (
                      <div className="wine-about__facts">
                        {aiInfo.alcohol && (
                          <span className="wine-about__fact">
                            <strong>{aiInfo.alcohol}%</strong> alcohol
                          </span>
                        )}
                        {aiInfo.serve && (
                          <span className="wine-about__fact">
                            <strong>{aiInfo.serve}</strong> servir
                          </span>
                        )}
                      </div>
                    )}

                    <p className="wine-about__disclaimer">Descripción orientativa generada con IA.</p>
                  </>
                )}
              </div>
            )}

            {/* Precio: comunitario (promedio) + link a MercadoLibre (siempre actual). */}
            <div className="wine-price">
              <div className="wine-price__row">
                <div className="wine-price__info">
                  <span className="wine-price__label">Precio de referencia</span>
                  {priceLoading ? (
                    <span className="wine-price__empty">Buscando precios…</span>
                  ) : communityPrice ? (
                    <span className="wine-price__value">
                      ${communityPrice.avg.toLocaleString("es-AR")} {communityPrice.currency}
                      <em> · promedio de {communityPrice.count} {communityPrice.count === 1 ? "persona" : "personas"}</em>
                    </span>
                  ) : (
                    <span className="wine-price__empty">
                      Sin datos aún. Cargá lo que pagaste (al editar el vino) y ayudás a la comunidad.
                    </span>
                  )}
                </div>
              </div>
              <a
                className="wine-price__meli"
                href={mercadoLibreUrl(wine.name, wine.winery, wine.varietal)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ver precios en MercadoLibre <Icon name="arrow-right" size={15} />
              </a>
            </div>

            {wine.notes && (
              <div className="wine-detail-notes">
                <h3>Tus notas <em>· privadas</em></h3>
                <p>{wine.notes}</p>
              </div>
            )}

            {(wine.cellar?.location || wine.cellar?.drinkFrom || wine.cellar?.drinkUntil) && (
              <div className="wine-detail-meta-section">
                <h3>Dónde lo guardás</h3>
                <div className="wine-meta-row">
                  {wine.cellar.location && (
                    <span className="wine-meta-chip"><Icon name="map-pin" size={13} /> {wine.cellar.location}</span>
                  )}
                  {(wine.cellar.drinkFrom || wine.cellar.drinkUntil) && (
                    <span className="wine-meta-chip">
                      <Icon name="calendar" size={13} /> {wine.cellar.drinkFrom || "—"} – {wine.cellar.drinkUntil || "—"}
                    </span>
                  )}
                </div>
              </div>
            )}

            {wine.purchase?.price > 0 && (
              <div className="wine-detail-meta-section">
                <h3>Cómo lo conseguiste</h3>
                <div className="wine-meta-row">
                  <span className="wine-meta-chip">
                    <Icon name="tag" size={13} /> ${wine.purchase.price.toLocaleString("es-AR")} {wine.purchase.currency || "ARS"}
                  </span>
                  {wine.purchase.store && (
                    <span className="wine-meta-chip"><Icon name="store" size={13} /> {wine.purchase.store}</span>
                  )}
                  {wine.purchase.purchasedAt && (
                    <span className="wine-meta-chip">
                      {new Date(wine.purchase.purchasedAt).toLocaleDateString("es-AR")}
                    </span>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="scan-edit-grid">
            <input
              type="text"
              className="scan-edit-input"
              placeholder="Nombre del vino *"
                aria-label="Nombre del vino"
              value={draft.name}
              onChange={(event) => updateDraftField("name", event.target.value)}
            />
            <input
              type="text"
              className="scan-edit-input"
              placeholder="Bodega"
                aria-label="Bodega (productor)"
              list="wine-wineries"
              value={draft.winery}
              onChange={(event) => updateDraftField("winery", event.target.value)}
            />
            <input
              type="text"
              className="scan-edit-input"
              placeholder="Región"
                aria-label="Región"
              list="wine-regions"
              value={draft.region}
              onChange={(event) => updateDraftField("region", event.target.value)}
            />
            <input
              type="text"
              className="scan-edit-input"
              placeholder="Varietal"
                aria-label="Varietal"
              list="wine-varietals"
              value={draft.varietal}
              onChange={(event) => updateDraftField("varietal", event.target.value)}
            />
            <input
              type="number"
              inputMode="numeric"
              min="1900"
              max={new Date().getFullYear()}
              aria-label="Año de cosecha"
              className="scan-edit-input"
              placeholder="Año"
              value={draft.vintage}
              onChange={(event) => updateDraftField("vintage", event.target.value)}
            />
            <Dropdown
              ariaLabel="Tipo de vino"
              value={draft.type}
              onChange={(v) => updateDraftField("type", v)}
              options={[
                { value: "unknown", label: "Tipo de vino…" },
                ...WINE_TYPES.map(({ value, label }) => ({ value, label })),
              ]}
            />
            <textarea
              className="scan-edit-textarea"
              placeholder="Notas"
                aria-label="Notas"
              value={draft.notes}
              onChange={(event) => updateDraftField("notes", event.target.value)}
            />

            <div className="scan-section-divider">
              <span>Bodega</span>
            </div>
            <input
              type="text"
              className="scan-edit-input"
              placeholder="Ubicación (ej: Estante A, Heladera)"
              value={draft.cellarLocation}
              onChange={(e) => updateDraftField("cellarLocation", e.target.value)}
            />
            <div className="scan-edit-grid scan-edit-grid--two">
              <input
                type="number"
                inputMode="numeric"
                min="1900"
                aria-label="Beber desde (año)"
                className="scan-edit-input"
                placeholder="Beber desde (año)"
                value={draft.drinkFrom}
                onChange={(e) => updateDraftField("drinkFrom", e.target.value)}
              />
              <input
                type="number"
                inputMode="numeric"
                min="1900"
                aria-label="Beber hasta (año)"
                className="scan-edit-input"
                placeholder="Beber hasta (año)"
                value={draft.drinkUntil}
                onChange={(e) => updateDraftField("drinkUntil", e.target.value)}
              />
            </div>

            <div className="scan-section-divider">
              <span>Datos de compra</span>
            </div>
            <input
              type="number"
              inputMode="decimal"
              aria-label="Precio pagado"
              className="scan-edit-input"
              placeholder="Precio"
              min="0"
              step="0.01"
              value={draft.price}
              onChange={(e) => updateDraftField("price", e.target.value)}
            />
            <input
              type="text"
              className="scan-edit-input"
              placeholder="Tienda o vinoteca"
              list="detail-stores"
              value={draft.store}
              onChange={(e) => updateDraftField("store", e.target.value)}
            />
            <input
              type="date"
              className="scan-edit-input"
              value={draft.purchasedAt}
              onChange={(e) => updateDraftField("purchasedAt", e.target.value)}
              aria-label="Fecha de compra"
            />

            <datalist id="wine-wineries">
              {WINERIES.map((name) => <option key={name} value={name} />)}
            </datalist>
            <datalist id="wine-regions">
              {REGIONS.map((name) => <option key={name} value={name} />)}
            </datalist>
            <datalist id="wine-varietals">
              {VARIETALS.map((name) => <option key={name} value={name} />)}
            </datalist>
            <datalist id="detail-stores">
              {STORES.map((name) => <option key={name} value={name} />)}
            </datalist>

            <div className="result-actions">
              <button className="btn-cancel" type="button" disabled={saving} onClick={() => setEditing(false)}>
                Cancelar
              </button>
              <button className="btn-add" type="button" disabled={saving} onClick={handleSaveEdit}>
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </div>
        )}

        {!editing && (
          <div className="wine-detail-actions">
            <div className="wine-qty-controls" role="group" aria-label="Botellas en tu bodega">
              <span className="wine-qty-controls__label" aria-hidden="true">Botellas</span>
              <button type="button" className="qty-btn" disabled={pending || Number(wine.quantity) <= 0} onClick={() => handleAdjustQuantity(-1)} aria-label="Quitar una botella" title="Quitar una botella (sin marcarla como tomada)">
                <Icon name="minus" size={16} />
              </button>
              <span className="wine-qty" aria-live="polite">{wine.quantity}</span>
              <button type="button" className="qty-btn" disabled={pending} onClick={() => handleAdjustQuantity(1)} aria-label="Sumar una botella" title="Sumá botellas si compraste más">
                <Icon name="plus" size={16} />
              </button>
            </div>

            {/* Abrir una botella es la acción; el "−" de al lado sigue siendo
                para lo otro (la regalaste, corregís el número) y por eso no
                toca tu historial de probados. */}
            {Number(wine.quantity) > 0 && (
              <button
                type="button"
                className="wine-detail-open"
                disabled={pending}
                onClick={handleOpenBottle}
              >
                <Icon name="bottle" size={17} />
                Abrí una botella
              </button>
            )}

            {/* Lo secundario se queda en íconos y en voz baja: una sola acción
                principal por pantalla. El `title` explica cada uno sin gastar
                ancho, que es lo que mantiene la barra prolija en un teléfono. */}
            <button
              type="button"
              className={`btn-icon ${wine.favorite ? "active" : ""}`}
              disabled={pending}
              onClick={handleToggleFavorite}
              title={wine.favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
              aria-label={wine.favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
            >
              <Icon name="heart" filled={wine.favorite} size={19} />
            </button>

            <button
              type="button"
              className={`btn-icon btn-icon--tasted ${wine.tasted ? "tasted-active" : ""}`}
              disabled={pending}
              onClick={handleToggleTasted}
              title={
                wine.tasted
                  ? "Ya lo probaste — tocá para desmarcarlo (no toca tu stock)"
                  : "Marcar que ya lo probaste (no toca tu stock)"
              }
              aria-label={wine.tasted ? "Marcar como no probado" : "Marcar como probado"}
            >
              <Icon name={wine.tasted ? "check" : "circle"} size={19} />
            </button>

            <button type="button" className="btn-delete" onClick={() => setShowDeleteConfirm(true)} title="Eliminar este vino de tu bodega" aria-label="Eliminar vino">
              <Icon name="trash" size={18} />
            </button>
          </div>
        )}

        <section className="wine-moments">
          <div className="wine-moments__header">
            <h3>Tus momentos con este vino</h3>
            {!showMomentForm && (
              <button type="button" className="wine-moments__add-btn" onClick={() => setShowMomentForm(true)}>
                + Agregar
              </button>
            )}
          </div>

          {showMomentForm && (
            <form className="moment-form" onSubmit={handleAddMoment}>
              <Dropdown
                ariaLabel="Ocasión"
                value={momentDraft.occasion}
                onChange={(v) => setMomentDraft((p) => ({ ...p, occasion: v }))}
                options={[
                  { value: "", label: "Ocasión…" },
                  ...OCCASIONS.map((o) => ({ value: o.value, label: o.label })),
                ]}
              />
              <Dropdown
                ariaLabel="Cómo te sentiste"
                value={momentDraft.emotion}
                onChange={(v) => setMomentDraft((p) => ({ ...p, emotion: v }))}
                options={[
                  { value: "", label: "¿Cómo te sentiste?" },
                  ...EMOTIONS.map((e) => ({ value: e.value, label: e.label })),
                ]}
              />
              <input
                type="text"
                placeholder="¿Con quién?"
                value={momentDraft.companions}
                onChange={(e) => setMomentDraft((p) => ({ ...p, companions: e.target.value }))}
              />
              <input
                type="text"
                placeholder="Lugar"
                aria-label="Lugar"
                value={momentDraft.place}
                onChange={(e) => setMomentDraft((p) => ({ ...p, place: e.target.value }))}
              />
              <input
                type="text"
                placeholder="Maridaje (qué comiste)"
                aria-label="Maridaje: qué comiste"
                value={momentDraft.foodPairing}
                onChange={(e) => setMomentDraft((p) => ({ ...p, foodPairing: e.target.value }))}
              />
              <textarea
                placeholder="Notas del momento"
                aria-label="Notas del momento"
                value={momentDraft.notes}
                onChange={(e) => setMomentDraft((p) => ({ ...p, notes: e.target.value }))}
              />

              {/* Fotos del momento (máx 2, privadas). */}
              <div className="moment-photos">
                <span className="moment-photos__label">Fotos <small>(máx 2 · privadas)</small></span>
                <div className="moment-photos__grid">
                  {momentDraft.photos.map((src, i) => (
                    <div key={i} className="moment-photos__item">
                      <img src={src} alt={`Foto ${i + 1}`} />
                      <button
                        type="button"
                        className="moment-photos__remove"
                        onClick={() => setMomentDraft((p) => ({ ...p, photos: p.photos.filter((_, j) => j !== i) }))}
                        aria-label="Quitar foto"
                      >
                        <Icon name="x" size={14} />
                      </button>
                    </div>
                  ))}
                  {momentDraft.photos.length < 2 && (
                    <label className="moment-photos__add">
                      <Icon name="camera" size={20} />
                      <span>Agregar</span>
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (!file) return;
                          try {
                            const url = await toUploadableDataUrl(file);
                            setMomentDraft((p) => ({ ...p, photos: [...p.photos, url].slice(0, 2) }));
                          } catch {
                            showError("No se pudo cargar la foto");
                          }
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>

              <div className="rating-input" role="group" aria-label="Calificar este momento">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`rating-input__star ${value <= momentDraft.rating ? "filled" : ""}`}
                    // Tocar la estrella ya puesta la saca: sin esto no había forma
                    // de volver a "sin calificar".
                    onClick={() =>
                      setMomentDraft((p) => ({ ...p, rating: p.rating === value ? 0 : value }))
                    }
                    aria-label={`Calificar con ${value} ${value === 1 ? "estrella" : "estrellas"}`}
                    aria-pressed={value <= momentDraft.rating}
                    disabled={savingMoment}
                  >
                    ★
                  </button>
                ))}
              </div>
              <div className="result-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowMomentForm(false)} disabled={savingMoment}>
                  Cancelar
                </button>
                <button type="submit" className="btn-add" disabled={savingMoment}>
                  {savingMoment ? "Guardando…" : "Guardar momento"}
                </button>
              </div>
            </form>
          )}

          {momentsLoading ? (
            <LoadingSkeleton type="inline" count={2} />
          ) : momentsFailed ? (
            <ErrorState
              title="No pudimos cargar tus momentos"
              hint="Están guardados. Probá de nuevo en un momento."
              onRetry={loadMoments}
              compact
            />
          ) : moments.length === 0 ? (
            !showMomentForm && (
              <EmptyState
                icon="calendar"
                title="Todavía no registraste ningún momento"
                hint="Anotá con quién y dónde lo tomaste: es lo que después te hace acordar del vino."
                actionLabel="Registrar el primero"
                onAction={() => setShowMomentForm(true)}
                compact
              />
            )
          ) : (
            <ul className="moment-list">
              {moments.map((moment) => (
                <li key={moment._id} className="moment-item">
                  <div className="moment-item__head">
                    <strong>{moment.occasion ? occasionLabel(moment.occasion) : "Momento"}</strong>
                    <span>{new Date(moment.consumedAt).toLocaleDateString("es-AR")}</span>
                  </div>
                  {!!moment.rating && <StarRating value={moment.rating} size="sm" />}
                  <div className="moment-item__meta">
                    {moment.place && <span><Icon name="map-pin" size={12} /> {moment.place}</span>}
                    {moment.companions && <span><Icon name="users" size={12} /> {moment.companions}</span>}
                    {moment.emotion && <span><Icon name="sparkle" size={12} /> {emotionLabel(moment.emotion)}</span>}
                  </div>
                  {moment.notes && <p className="moment-item__notes">{moment.notes}</p>}
                  {moment.photos?.length > 0 && (
                    <div className="moment-item__photos">
                      {moment.photos.map((src, i) => (
                        <a key={i} href={src} target="_blank" rel="noopener noreferrer">
                          <img src={src} alt={`Foto ${i + 1}`} loading="lazy" />
                        </a>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <ConfirmModal
        isOpen={showDeleteConfirm}
        title="¿Eliminar vino?"
        message={`Se quitará "${wineDisplayName(wine)}" de tu bodega.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        isDangerous
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
