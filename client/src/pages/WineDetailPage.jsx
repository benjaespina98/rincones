import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ConfirmModal from "../components/ConfirmModal";
import Icon from "../components/Icon";
import LoadingSkeleton from "../components/LoadingSkeleton";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import StarRating from "../components/StarRating";
import WineReviews from "../components/WineReviews";
import WineAbout from "../components/WineAbout";
import WineOpinion from "../components/WineOpinion";
import WineIdentity from "../components/WineIdentity";
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
import { WINE_TYPES, WINERIES, REGIONS, VARIETALS, STORES } from "../data/wineReference";
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
          <WinePhoto src={wine.image} type={wine.type} alt={wineDisplayName(wine)} artSize={220} fit="contain" priority />
        </div>

        {/* Sin medallas sobre la foto: "favorito" y "probado" ya están, con su
            palabra y a un toque de distancia, en la misma pantalla y sin scrollear.
            Eran los mismos dos estados dichos dos veces, y arriba en una versión
            que no se podía tocar. */}

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
          {/* Sólo la región acá. La bodega bajó a la ficha de datos, donde tiene su
              rótulo y se lee sin competir con la foto. Si no hay región no se
              anuncia el hueco: la ficha de abajo ya ofrece completar los datos. */}
          {wine.region && <p className="wine-detail-hero__origin">{wine.region}</p>}
        </div>
      </div>

      <div className="wine-detail-body">
        {!editing ? (
          <>
            {/* Quién lo hace, de dónde es, de qué uva y de qué año — con rótulos y
                no como cuatro pastillas de colores del mismo peso. La bodega es el
                dato que más ubica un vino y era el único que faltaba. */}
            <WineIdentity wine={wine} onEdit={startEditing} />

            {/* Las acciones, arriba de todo. Estaban novenas de once: para abrir
                una botella había que bajar 2364px, casi tres pantallas, pasando
                por la descripción de IA, el precio y tres bloques de datos. */}
            <div className="wine-detail-actions">
              <div className="wine-qty-controls" role="group" aria-label="Botellas en tu bodega">
                <span className="wine-qty-controls__label" aria-hidden="true">Botellas</span>
                <button type="button" className="qty-btn" disabled={pending || Number(wine.quantity) <= 0} onClick={() => handleAdjustQuantity(-1)} aria-label="Quitar una botella">
                  <Icon name="minus" size={16} />
                </button>
                {/* Ver BodyPage: el `key` va en el span interno para que la
                    región viva no se desmonte y siga anunciando. */}
                <span className="wine-qty" aria-live="polite">
                  <span key={wine.quantity} className="wine-qty__n">{wine.quantity}</span>
                </span>
                <button type="button" className="qty-btn" disabled={pending} onClick={() => handleAdjustQuantity(1)} aria-label="Sumar una botella">
                  <Icon name="plus" size={16} />
                </button>
              </div>

              {/* Abrir es la acción; el "−" de al lado es para corregir el número
                  (la regalaste, la contaste mal) y por eso no toca tu historial. */}
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

              {/* Los mismos chips que en la bodega: mismo texto, mismo color,
                  mismo comportamiento. La misma acción con dos caras obliga a
                  aprender la app dos veces. */}
              <div className="wine-detail-toggles">
                <button
                  type="button"
                  className={`toggle-chip ${wine.tasted ? "is-on" : ""}`}
                  disabled={pending}
                  onClick={handleToggleTasted}
                  aria-pressed={wine.tasted}
                >
                  <Icon name={wine.tasted ? "check" : "circle"} size={14} />
                  {wine.tasted ? "Probado" : "Sin probar"}
                </button>

                <button
                  type="button"
                  className={`toggle-chip ${wine.favorite ? "is-on is-on--fav" : ""}`}
                  disabled={pending}
                  onClick={handleToggleFavorite}
                  aria-pressed={wine.favorite}
                  aria-label={wine.favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
                >
                  <Icon name="heart" filled={wine.favorite} size={14} />
                  Favorito
                </button>
              </div>
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

            {wine.notes && (
              <div className="wine-detail-notes">
                <h3>Notas</h3>
                <p>{wine.notes}</p>
              </div>
            )}

            {/* Dónde lo guardás y cómo lo conseguiste eran dos bloques con título,
                de 132px cada uno, para mostrar entre uno y cuatro chips. Es un solo
                renglón de datos: cada ícono ya dice qué es y ninguno necesita que
                se lo presente con un encabezado. La ventana de guarda no está acá
                porque ya la dice el bloque de arriba. */}
            {(wine.cellar?.location || wine.purchase?.price > 0) && (
              <div className="wine-meta-row">
                {wine.cellar?.location && (
                  <span className="wine-meta-chip"><Icon name="map-pin" size={13} /> {wine.cellar.location}</span>
                )}
                {wine.purchase?.price > 0 && (
                  <span className="wine-meta-chip">
                    <Icon name="tag" size={13} /> ${wine.purchase.price.toLocaleString("es-AR")}
                  </span>
                )}
                {wine.purchase?.store && (
                  <span className="wine-meta-chip"><Icon name="store" size={13} /> {wine.purchase.store}</span>
                )}
                {wine.purchase?.purchasedAt && (
                  <span className="wine-meta-chip">
                    <Icon name="calendar" size={13} /> {new Date(wine.purchase.purchasedAt).toLocaleDateString("es-AR")}
                  </span>
                )}
              </div>
            )}

            {/* De acá para abajo, lo que no es tuyo: lo que la app sabe del vino
                y lo que opinan otros. Material de consulta, después de todo lo
                que se hace y se escribe. */}
            <WineAbout
              loading={aiLoading}
              failed={aiFailed}
              info={aiInfo}
              onRetry={() => loadDescription(true)}
            />

            {/* Opiniones de otros (el promedio y las reseñas ajenas). */}
            <WineReviews name={wine.name} winery={wine.winery} />

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
                    <span className="wine-price__empty">Sin datos todavía</span>
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


        <section className="wine-moments">
          <div className="wine-moments__header">
            <h3>Momentos</h3>
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

              {/* El tope de 2 lo impone la grilla: cuando llegás, el botón de
                  agregar desaparece. No hace falta anunciarlo por escrito. */}
              <div className="moment-photos">
                <span className="moment-photos__label">Fotos</span>
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
            <ErrorState title="No pudimos cargar tus momentos" onRetry={loadMoments} compact />
          ) : moments.length === 0 ? (
            !showMomentForm && (
              <EmptyState
                icon="calendar"
                title="Sin momentos todavía"
                hint="Con quién y dónde lo tomaste."
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

        {/* Eliminar, al final y en voz baja: estaba a un centímetro de "favorito"
            y "probado", que se tocan todos los días. */}
        {!editing && (
          <div className="wine-detail-danger">
            <button
              type="button"
              className="wine-detail-danger__btn"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Icon name="trash" size={15} />
              Eliminar de mi bodega
            </button>
          </div>
        )}
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
