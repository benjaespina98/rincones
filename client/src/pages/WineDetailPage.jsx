import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ConfirmModal from "../components/ConfirmModal";
import Icon from "../components/Icon";
import LoadingSkeleton from "../components/LoadingSkeleton";
import StarRating from "../components/StarRating";
import { useToast } from "../context/ToastContext";
import {
  getWineById,
  updateWine,
  deleteWine,
  adjustWineStock,
  getWineMoments,
  addWineMoment,
} from "../services/wineApi";
import { describeWine } from "../services/wineSearchApi";
import { WINE_TYPES, WINE_TYPE_LABELS, WINERIES, REGIONS, VARIETALS, STORES } from "../data/wineReference";
import { getCellarStatus } from "../utils/cellarStatus";
import WinePhoto from "../components/WinePhoto";
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
};

export default function WineDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();

  const [wine, setWine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [moments, setMoments] = useState([]);
  const [momentsLoading, setMomentsLoading] = useState(true);
  const [showMomentForm, setShowMomentForm] = useState(false);
  const [momentDraft, setMomentDraft] = useState(EMPTY_MOMENT);
  const [savingMoment, setSavingMoment] = useState(false);

  // Ficha generada por IA (descripción, aromas, maridaje) — estilo Vivino.
  const [aiInfo, setAiInfo] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiFailed, setAiFailed] = useState(false);

  const loadWine = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getWineById(id);
      if (!data) {
        setNotFound(true);
      } else {
        setWine(data);
      }
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadMoments = useCallback(async () => {
    try {
      setMomentsLoading(true);
      const data = await getWineMoments(id);
      setMoments(data);
    } catch {
      setMoments([]);
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
  useEffect(() => {
    if (!wineName) return;
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
  }, [wineName, wineWinery]);

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

  const handleToggleTasted = () =>
    applyUpdate(
      { tasted: !wine.tasted },
      wine.tasted ? "Marcado como no probado" : "Vino marcado como probado"
    );

  const handleRate = (value) => applyUpdate({ rating: value }, "Rating actualizado");

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
      showError("No se pudo guardar los cambios");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setShowDeleteConfirm(false);
    try {
      await deleteWine(id);
      showSuccess(`"${wine.name}" eliminado de tu bodega`);
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

  if (notFound || !wine) {
    return (
      <div className="wine-detail-page">
        <div className="empty-state">
          <p className="empty-icon" aria-hidden="true">🍷</p>
          <p className="empty-title">No encontramos este vino</p>
          <p className="empty-subtitle">Puede que ya lo hayas eliminado de tu bodega.</p>
          <button type="button" className="empty-cta" onClick={() => navigate("/bodega")}>
            Volver a Mi Bodega
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wine-detail-page">
      <div className="wine-detail-hero">
        <div className="wine-detail-hero__placeholder">
          <WinePhoto src={wine.image} type={wine.type} alt={wine.name} artSize={150} />
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
          <button type="button" className="wine-detail-hero__edit" onClick={startEditing} aria-label="Editar vino">
            <Icon name="pencil" size={16} />
          </button>
        )}

        <div className="wine-detail-hero__overlay">
          <h1 className="wine-detail-hero__name">{wine.name}</h1>
          <p className="wine-detail-hero__origin">
            {[wine.winery, wine.region].filter(Boolean).join(" · ") || "Sin datos de origen"}
          </p>
        </div>
      </div>

      <div className="wine-detail-body">
        {!editing ? (
          <>
            <div className="wine-detail-meta">
              <span className="wine-type">{WINE_TYPE_LABELS[wine.type] || WINE_TYPE_LABELS.unknown}</span>
              {wine.vintage && <span className="wine-year">{wine.vintage}</span>}
              {wine.varietal && <span className="wine-year">{wine.varietal}</span>}
              {(() => {
                const cs = getCellarStatus(wine);
                if (!cs.label) return null;
                return (
                  <span className={`cellar-badge cellar-badge--${cs.status}`}>
                    {cs.status === "peak" ? "🟢" : cs.status === "early" ? "🟡" : "🔴"} {cs.label}
                  </span>
                );
              })()}
            </div>

            <div className="wine-detail-rating">
              <span className="wine-detail-rating__label">Tu rating</span>
              <div className="rating-input" role="group" aria-label="Calificar vino">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`rating-input__star ${value <= (wine.rating || 0) ? "filled" : ""}`}
                    onClick={() => handleRate(value)}
                    disabled={pending}
                    aria-label={`Calificar con ${value} estrellas`}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>

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
                  <p className="wine-about__failed">
                    No pudimos cargar la descripción ahora. Probá reabrir el vino más tarde.
                  </p>
                )}

                {aiInfo && !aiLoading && (
                  <>
                    {aiInfo.summary && <p className="wine-about__summary">{aiInfo.summary}</p>}
                    {aiInfo.body && <p className="wine-about__body">{aiInfo.body}</p>}

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
                            <span key={f} className="wine-about__chip wine-about__chip--food">🍽 {f}</span>
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

            {wine.notes && (
              <div className="wine-detail-notes">
                <h3>Notas</h3>
                <p>{wine.notes}</p>
              </div>
            )}

            {(wine.cellar?.location || wine.cellar?.drinkFrom || wine.cellar?.drinkUntil) && (
              <div className="wine-detail-meta-section">
                <h3>Bodega</h3>
                <div className="wine-meta-row">
                  {wine.cellar.location && (
                    <span className="wine-meta-chip">📍 {wine.cellar.location}</span>
                  )}
                  {(wine.cellar.drinkFrom || wine.cellar.drinkUntil) && (
                    <span className="wine-meta-chip">
                      🗓 {wine.cellar.drinkFrom || "—"} – {wine.cellar.drinkUntil || "—"}
                    </span>
                  )}
                </div>
              </div>
            )}

            {wine.purchase?.price > 0 && (
              <div className="wine-detail-meta-section">
                <h3>Compra</h3>
                <div className="wine-meta-row">
                  <span className="wine-meta-chip">
                    💰 ${wine.purchase.price.toLocaleString("es-AR")} {wine.purchase.currency || "ARS"}
                  </span>
                  {wine.purchase.store && (
                    <span className="wine-meta-chip">🏪 {wine.purchase.store}</span>
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
              value={draft.name}
              onChange={(event) => updateDraftField("name", event.target.value)}
            />
            <input
              type="text"
              className="scan-edit-input"
              placeholder="Bodega"
              list="wine-wineries"
              value={draft.winery}
              onChange={(event) => updateDraftField("winery", event.target.value)}
            />
            <input
              type="text"
              className="scan-edit-input"
              placeholder="Región"
              list="wine-regions"
              value={draft.region}
              onChange={(event) => updateDraftField("region", event.target.value)}
            />
            <input
              type="text"
              className="scan-edit-input"
              placeholder="Varietal"
              list="wine-varietals"
              value={draft.varietal}
              onChange={(event) => updateDraftField("varietal", event.target.value)}
            />
            <input
              type="number"
              className="scan-edit-input"
              placeholder="Año"
              value={draft.vintage}
              onChange={(event) => updateDraftField("vintage", event.target.value)}
            />
            <select
              className="scan-edit-input"
              value={draft.type}
              onChange={(event) => updateDraftField("type", event.target.value)}
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
                className="scan-edit-input"
                placeholder="Beber desde (año)"
                value={draft.drinkFrom}
                onChange={(e) => updateDraftField("drinkFrom", e.target.value)}
              />
              <input
                type="number"
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
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </div>
        )}

        {!editing && (
          <div className="wine-detail-actions">
            <div className="wine-qty-controls" aria-label="Stock">
              <button type="button" className="qty-btn" disabled={pending || Number(wine.quantity) <= 0} onClick={() => handleAdjustQuantity(-1)} aria-label="Restar una unidad">
                <Icon name="minus" size={16} />
              </button>
              <span className="wine-qty">x{wine.quantity}</span>
              <button type="button" className="qty-btn" disabled={pending} onClick={() => handleAdjustQuantity(1)} aria-label="Sumar una unidad">
                <Icon name="plus" size={16} />
              </button>
            </div>

            <button
              type="button"
              className={`btn-icon ${wine.favorite ? "active" : ""}`}
              disabled={pending}
              onClick={handleToggleFavorite}
              aria-label={wine.favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
            >
              <Icon name="heart" filled={wine.favorite} size={19} />
            </button>

            <button
              type="button"
              className={`btn-icon ${wine.tasted ? "active" : ""}`}
              disabled={pending}
              onClick={handleToggleTasted}
              aria-label={wine.tasted ? "Marcar como no probado" : "Marcar como probado"}
            >
              <Icon name={wine.tasted ? "check" : "circle"} size={19} />
            </button>

            <button type="button" className="btn-delete" onClick={() => setShowDeleteConfirm(true)} aria-label="Eliminar vino">
              <Icon name="trash" size={18} />
            </button>
          </div>
        )}

        <section className="wine-moments">
          <div className="wine-moments__header">
            <h3>Momentos de degustación</h3>
            {!showMomentForm && (
              <button type="button" className="wine-moments__add-btn" onClick={() => setShowMomentForm(true)}>
                + Agregar
              </button>
            )}
          </div>

          {showMomentForm && (
            <form className="moment-form" onSubmit={handleAddMoment}>
              <select
                value={momentDraft.occasion}
                onChange={(e) => setMomentDraft((p) => ({ ...p, occasion: e.target.value }))}
                aria-label="Ocasión"
              >
                <option value="">Ocasión...</option>
                {OCCASIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select
                value={momentDraft.emotion}
                onChange={(e) => setMomentDraft((p) => ({ ...p, emotion: e.target.value }))}
                aria-label="Cómo te sentiste"
              >
                <option value="">¿Cómo te sentiste?</option>
                {EMOTIONS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
              </select>
              <input
                type="text"
                placeholder="¿Con quién?"
                value={momentDraft.companions}
                onChange={(e) => setMomentDraft((p) => ({ ...p, companions: e.target.value }))}
              />
              <input
                type="text"
                placeholder="Lugar"
                value={momentDraft.place}
                onChange={(e) => setMomentDraft((p) => ({ ...p, place: e.target.value }))}
              />
              <input
                type="text"
                placeholder="Maridaje (qué comiste)"
                value={momentDraft.foodPairing}
                onChange={(e) => setMomentDraft((p) => ({ ...p, foodPairing: e.target.value }))}
              />
              <textarea
                placeholder="Notas del momento"
                value={momentDraft.notes}
                onChange={(e) => setMomentDraft((p) => ({ ...p, notes: e.target.value }))}
              />
              <div className="rating-input" role="group" aria-label="Calificar este momento">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`rating-input__star ${value <= momentDraft.rating ? "filled" : ""}`}
                    onClick={() => setMomentDraft((p) => ({ ...p, rating: value }))}
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
                  {savingMoment ? "Guardando..." : "Guardar momento"}
                </button>
              </div>
            </form>
          )}

          {momentsLoading ? (
            <LoadingSkeleton type="inline" count={2} />
          ) : moments.length === 0 ? (
            !showMomentForm && <p className="wine-moments__empty">Todavía no registraste ningún momento con este vino.</p>
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
                    {moment.place && <span>📍 {moment.place}</span>}
                    {moment.companions && <span>👥 {moment.companions}</span>}
                    {moment.emotion && <span>🙂 {emotionLabel(moment.emotion)}</span>}
                  </div>
                  {moment.notes && <p className="moment-item__notes">{moment.notes}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <ConfirmModal
        isOpen={showDeleteConfirm}
        title="¿Eliminar vino?"
        message={`Se quitará "${wine.name}" de tu bodega.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        isDangerous
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
