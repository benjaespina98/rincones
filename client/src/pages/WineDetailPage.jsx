import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ConfirmModal from "../components/ConfirmModal";
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
import { WINE_TYPES, WINE_TYPE_LABELS, WINERIES, REGIONS, VARIETALS } from "../data/wineReference";
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
      navigate("/");
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
          <button type="button" className="empty-cta" onClick={() => navigate("/")}>
            Volver a Mi Bodega
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wine-detail-page">
      <div className="wine-detail-hero">
        {wine.image ? (
          <img src={wine.image} alt={wine.name} className="wine-detail-hero__image" />
        ) : (
          <div className="wine-detail-hero__placeholder" aria-hidden="true">🍷</div>
        )}
        {wine.favorite && <span className="badge-favorite" title="Favorito">❤</span>}
        {wine.tasted && <span className="badge-tasted" title="Probado">✓</span>}
      </div>

      <div className="wine-detail-body">
        {!editing ? (
          <>
            <div className="wine-detail-titlebar">
              <h2 className="wine-detail-name">{wine.name}</h2>
              <button type="button" className="wine-detail-edit-btn" onClick={startEditing}>
                Editar
              </button>
            </div>
            <p className="wine-detail-subtitle">
              {[wine.winery, wine.region].filter(Boolean).join(" · ") || "Sin datos de origen"}
            </p>

            <div className="wine-detail-meta">
              <span className="wine-type">{WINE_TYPE_LABELS[wine.type] || WINE_TYPE_LABELS.unknown}</span>
              {wine.vintage && <span className="wine-year">{wine.vintage}</span>}
              {wine.varietal && <span className="wine-year">{wine.varietal}</span>}
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

            {wine.notes && (
              <div className="wine-detail-notes">
                <h3>Notas</h3>
                <p>{wine.notes}</p>
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
              <button type="button" className="qty-btn" disabled={pending || Number(wine.quantity) <= 0} onClick={() => handleAdjustQuantity(-1)}>
                −
              </button>
              <span className="wine-qty">x{wine.quantity}</span>
              <button type="button" className="qty-btn" disabled={pending} onClick={() => handleAdjustQuantity(1)}>
                +
              </button>
            </div>

            <button
              type="button"
              className={`btn-icon ${wine.favorite ? "active" : ""}`}
              disabled={pending}
              onClick={handleToggleFavorite}
              aria-label={wine.favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
            >
              {wine.favorite ? "❤" : "♡"}
            </button>

            <button
              type="button"
              className={`btn-icon ${wine.tasted ? "active" : ""}`}
              disabled={pending}
              onClick={handleToggleTasted}
              aria-label={wine.tasted ? "Marcar como no probado" : "Marcar como probado"}
            >
              {wine.tasted ? "✓" : "○"}
            </button>

            <button type="button" className="btn-delete" onClick={() => setShowDeleteConfirm(true)} aria-label="Eliminar vino">
              🗑
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
