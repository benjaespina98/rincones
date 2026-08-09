import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import LabelScanner from "../components/LabelScanner";
import Icon from "../components/Icon";
import { useToast } from "../context/ToastContext";
import { useWineCollection } from "../hooks/useWineCollection";
import { createWish } from "../services/wishApi";
import { successHaptic } from "../utils/haptics";
import ScanReview from "../components/ScanReview";
import { matchCatalogWine } from "../services/wineSearchApi";
import { trackEvent } from "../services/analyticsApi";
import "../styles/pages/ScanWinePage.css";

const toWinePayload = (draft) => ({
  name: draft.name?.trim() || "Vino sin nombre",
  winery: draft.winery?.trim() || "",
  line: draft.line?.trim() || "",
  region: draft.region?.trim() || "",
  varietal: draft.varietal?.trim() || "",
  vintage: draft.vintage ? Number.parseInt(draft.vintage, 10) : null,
  type: draft.type || "unknown",
  image: draft.image || "",
  // Las botellas que elegiste en la revisión. Estaba fijo en 1, así que el
  // selector "¿Cuántas botellas?" —presets de media docena y caja incluidos—
  // no servía para nada: comprabas doce, cargabas una.
  quantity: Math.max(1, Number.parseInt(draft.quantity, 10) || 1),

  /**
   * De dónde salieron estos datos.
   *
   * Es EVIDENCIA, no una conclusión: el servidor recalcula el veredicto por su
   * cuenta y no acepta el que calculó la pantalla (ver `evaluarIdentificacion`
   * en el servicio). Mandarlo igual es lo que le permite distinguir un campo que
   * la persona escribió de uno que el modelo adivinó — que es exactamente lo que
   * le faltaba saber para decidir si este vino puede entrar al catálogo público.
   */
  identification: {
    source: draft.identSource || "scan",
    confidence: draft.identConfidence || {},
    editedFields: draft.identEditedFields || [],
    matchedFrom: draft.identMatchedFrom || "",
  },
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

  // Un enlace viejo a /agregar?q=… buscaba acá. Ahora se busca en Descubrí:
  // lo mandamos allá con el término puesto, en vez de perderlo.
  const [searchParams] = useSearchParams();
  const legacyQuery = searchParams.get("q");
  useEffect(() => {
    if (legacyQuery) navigate(`/?q=${encodeURIComponent(legacyQuery)}`, { replace: true });
  }, [legacyQuery, navigate]);


  // Guarda el vino escaneado en la bodega y lleva directo a su ficha, que es
  // donde el usuario ve la descripción y puede editar/agregar momentos.
  const saveWine = async (draft) => {
    const created = await addWine(toWinePayload(draft));
    successHaptic();
    showSuccess(`"${created.name}" agregado a tu bodega`);
    // El evento que más dice del producto: cargar un vino es la acción por la que
    // existe la app. `source` distingue el escaneo de la carga a mano, que es lo
    // que permite saber si el lector de etiquetas vale lo que cuesta.
    trackEvent("wine_added", { source: draft?.source || "escaneo" });
    // `recienAgregado` enciende, una sola vez y en la ficha, el "¿sabías que?"
    // del vino: acabás de guardar la botella y en vez de un "listo" seco la app
    // te cuenta algo que no sabías. Es el único momento del recorrido donde no
    // compite con nada.
    navigate(`/vino/${created._id}`, { state: { recienAgregado: true } });
    return created;
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
    // Lo que el servidor ya detectó que no cierra en esta lectura. La revisión
    // vuelve a calcularlo sobre lo que la persona vaya editando, pero arrancar
    // con esto evita que el cliente tenga que conocer todo el vocabulario de
    // uvas del catálogo para llegar a la misma conclusión.
    const issuesDelServidor = Array.isArray(payload.issues) ? payload.issues : [];

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
      serverIssues: issuesDelServidor,
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
      serverIssues: [],
    });

  const handleConfirmReview = async (draft) => {
    // El nombre ya no cae a la bodega, así que acá el vacío es real y hay que
    // pedirlo: sin línea ni nombre propio no sabemos cómo se llama la botella.
    if (!draft.name?.trim()) {
      showError("Escribí la línea o el nombre del vino");
      return;
    }
    try {
      setSaving(true);
      await saveWine({
        ...draft,
        image: review?.photo || "",
        identMatchedFrom: review?.matchedFrom || "",
      });
      setReview(null);
    } catch {
      showError("No se pudo guardar el vino. Probá de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const handleWishReview = async (draft) => {
    if (!draft.name?.trim()) {
      showError("Escribí la línea o el nombre del vino");
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

  // --- Vista principal: las dos puertas a la bodega ---
  //
  // Sólo escanear y cargar a mano. El buscador de catálogo que vivía acá se fue
  // a Descubrí: desde un resultado no se podía sumar nada a la bodega —todo
  // terminaba en Guardados— así que era descubrimiento disfrazado de alta.
  return (
    <div className="scan-wine-page">
      <div className="scan-options">
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
