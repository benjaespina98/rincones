import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import LabelScanner from "../components/LabelScanner";
import Icon from "../components/Icon";
import { useToast } from "../context/ToastContext";
import { createWine, deleteWine } from "../services/wineApi";
import { createWish } from "../services/wishApi";
import { successHaptic } from "../utils/haptics";
import ScanReview from "../components/ScanReview";
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
  // Las botellas que elegiste en la revisión. Cero es la respuesta a "lo tomé
  // afuera": el vino existe en tu colección pero no hay ninguna botella tuya, así
  // que no se abre ningún lote ni se inventa una compra. Ver el comentario largo
  // en ScanReview, donde se pregunta.
  quantity: Math.max(0, Number.parseInt(draft.quantity, 10) || 0),

  // Sin botellas, el vino entra ya probado: si no lo tenés y lo estás cargando
  // igual, es porque lo tomaste. `tasted` es un eje independiente del stock, así
  // que esto no fuerza nada raro — sólo dice lo que pasó. El servidor completa el
  // resto del hecho (cuándo, y que cuenta como un consumo).
  tasted: Math.max(0, Number.parseInt(draft.quantity, 10) || 0) === 0,

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
    // La única de estas que es una AFIRMACIÓN de la persona y no una medición:
    // "sí, este vino se llama igual que su bodega". Vale por lo mismo que vale un
    // campo tipeado, y sin ella un Norton o un Durigutti que todavía no esté en
    // el catálogo curado no podría publicarse nunca.
    sameNameConfirmed: draft.identSameNameConfirmed === true,
  },
});

export default function ScanWinePage() {
  const navigate = useNavigate();
  const { addToast, removeToast, showSuccess, showError } = useToast();

  /**
   * El alta va DIRECTO a la API, sin pasar por `useWineCollection`.
   *
   * Antes esta pantalla montaba el hook entero sólo para quedarse con `addWine`,
   * y el hook trae TODA tu colección al montar. O sea que abrir el escáner
   * disparaba una descarga completa de la bodega que después se tiraba a la
   * basura: esta pantalla no muestra ninguna lista, y al guardar navega a la
   * ficha del vino, así que ese estado moría sin que nadie lo hubiera leído.
   *
   * Es el camino crítico en un teléfono —sacar la foto y guardar— y era donde
   * menos podía permitirse una consulta de más.
   */

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
  //
  // El aviso de éxito lleva "Deshacer": recién se creó, así que deshacer es
  // simplemente borrarlo — no hay stock que devolver ni lotes que reacomodar,
  // a diferencia de abrir una botella (ver BodyPage.handleOpenBottle, mismo
  // patrón de toast). Vale para los tres niveles de confianza por igual: el
  // toque de guardar ya fue una decisión de la persona, esto es la red de
  // seguridad para el toque equivocado, no una confirmación adicional.
  const saveWine = async (draft) => {
    const payload = toWinePayload(draft);
    const { wine: created } = await createWine(payload);
    successHaptic();
    // El evento que más dice del producto: cargar un vino es la acción por la que
    // existe la app. `source` distingue el escaneo de la carga a mano, que es lo
    // que permite saber si el lector de etiquetas vale lo que cuesta.
    // `destino` distingue las dos cargas que ahora la pantalla pregunta de
    // frente: la botella que entra a la cava y la copa que tomaste afuera. Son
    // dos usos distintos del producto y hasta ahora se contaban como uno solo.
    trackEvent("wine_added", {
      source: draft?.source || "escaneo",
      destino: payload.quantity === 0 ? "afuera" : "bodega",
    });

    // Con cero botellas el vino NO entró a tu bodega, entró a tu historial. El
    // aviso tiene que decir lo que pasó: "agregado a tu bodega" mandaría a
    // buscarlo a "En stock", que es el único lugar donde no está.
    const mensaje =
      payload.quantity === 0
        ? `"${created.name}" anotado entre tus probados`
        : `"${created.name}" agregado a tu bodega`;

    const toastId = addToast(mensaje, "success", 8000, {
      label: "Deshacer",
      onClick: async () => {
        removeToast(toastId);
        try {
          await deleteWine(created._id);
          // "Deshecho" es un participio suelto: suena a log del sistema, no a
          // alguien contándote qué pasó. Además no decía QUÉ se deshizo — ni de
          // dónde, que no es lo mismo si el vino nunca entró a la bodega.
          showSuccess(
            payload.quantity === 0
              ? `"${created.name}" ya no está entre tus probados`
              : `"${created.name}" ya no está en tu bodega`
          );
          navigate("/agregar", { replace: true });
        } catch {
          showError("No se pudo deshacer");
        }
      },
    });

    // `recienAgregado` enciende, una sola vez y en la ficha, el "¿sabías que?"
    // del vino: acabás de guardar la botella y en vez de un "listo" seco la app
    // te cuenta algo que no sabías. Es el único momento del recorrido donde no
    // compite con nada.
    navigate(`/vino/${created._id}`, { state: { recienAgregado: true } });
    return created;
  };

  /**
   * Tras la foto SIEMPRE mostramos la revisión.
   *
   * ── EL CRUCE CONTRA EL CATÁLOGO YA VINO HECHO ──────────────────────────────
   * Acá había una segunda llamada (`/catalog/match`) que buscaba la coincidencia
   * y rellenaba los huecos desde el navegador. Se fue al servidor, junto con algo
   * que antes no hacía NADIE: verificar que el vino exista y cómo se llama
   * exactamente (ver `conVerificacion` en labels.controller.js). Son la misma
   * pregunta —¿qué botella es ésta?— y hacerla en dos lugares distintos era lo
   * que permitía que el nombre entrara sin que ninguna fuente lo respaldara.
   *
   * De paso se va un viaje de red del camino crítico: entre la foto y la
   * revisión ahora hay una sola espera.
   */
  const handleCapture = (payload) => {
    setShowScanner(false);
    setReview({
      photo: payload.preview || "",
      source: payload.source || "",
      values: {
        winery: payload.winery || "",
        line: payload.line || "",
        properName: payload.properName || "",
        varietal: payload.varietal || "",
        vintage: payload.vintage || "",
        region: payload.region || "",
        type: payload.type || "unknown",
      },
      confidence: { ...(payload.confidence || {}) },
      // Quién respalda este nombre: el catálogo curado, dos personas que
      // cargaron lo mismo, el modelo consultado por texto — o nadie.
      verification: payload.verification || null,
      // Lo que el servidor ya detectó que no cierra en esta lectura. La revisión
      // vuelve a calcularlo sobre lo que la persona vaya editando, pero arrancar
      // con esto evita que el cliente tenga que conocer todo el vocabulario de
      // uvas del catálogo para llegar a la misma conclusión.
      serverIssues: Array.isArray(payload.issues) ? payload.issues : [],
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
      verification: null,
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
        // Qué fuente respaldó esta identidad. Sigue siendo evidencia y no
        // conclusión: el servidor recalcula el veredicto por su cuenta.
        identMatchedFrom: review?.verification?.source || "",
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
          verification={review.verification}
          saving={saving}
          onConfirm={handleConfirmReview}
          onWish={handleWishReview}
          onCancel={() => setReview(null)}
          onRescan={review.source === "manual" ? undefined : () => { setReview(null); setShowScanner(true); }}
          // "Buscar manualmente": la misma pantalla de revisión, en blanco, que
          // ya usa "Cargar a mano" desde la vista principal.
          onManual={review.source === "manual" ? undefined : startManual}
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
