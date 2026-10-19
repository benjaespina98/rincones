import { useCallback, useEffect, useRef, useState } from "react";
import api from "../services/api";
import Icon from "./Icon";
import { fileToDataUrl, resizeImage } from "../utils/image";
import { tapHaptic } from "../utils/haptics";
import "./LabelScanner.css";

/* ── DOS TAMAÑOS, DOS TRABAJOS ──────────────────────────────────────────────
   La misma foto se usaba para dos cosas con necesidades opuestas, y se hacía una
   sola vez con los valores de la más chica: 1280px y calidad 0.85.

   Para GUARDAR (la foto de la ficha y del banco compartido) 1280 está perfecto:
   se muestra a 150px y de más pesaría de más.

   Para LEER, no. En una foto de botella entera la etiqueta ocupa como mucho la
   mitad del alto, así que a 1280px el texto útil queda en ~500px de ancho: el
   varietal, la cosecha y la bodega —que son la letra chica— entran justo en el
   rango donde el modelo deja de leer y empieza a completar. Estábamos tirando la
   mitad de la evidencia antes de mirarla.

   2000px y 0.92 sobre una foto de celular son ~700 KB: bien por debajo del tope
   de 8 MB de multer, y el escaneo es una sola petición cada vez. */
const SCAN_MAX_DIM = 2000;
const SCAN_QUALITY = 0.92;
const STORE_MAX_DIM = 1280;
const STORE_QUALITY = 0.85;

// El server rechaza por encima de 8 MB (multer); avisamos antes de subir.
const MAX_UPLOAD_BYTES = 7 * 1024 * 1024;

/**
 * ── POR QUÉ AHORA HAY UNA CÁMARA DE VERDAD ADENTRO DE LA APP ────────────────
 *
 * Antes "Tomar foto" era un `<input type="file" capture>`: eso saca a la
 * persona de Rincones, abre la app de cámara del sistema —con SU interfaz,
 * SUS botones, sin el recuadro que le dice qué encuadrar— y recién cuando
 * confirma ahí vuelve. El marco de esquinas y el consejo "acercate hasta que
 * se lea la letra chica" se dibujaban en una pantalla que la persona nunca
 * llegaba a ver con la cámara enfocando: los consejos vivían en la pantalla
 * DE ANTES, no en el momento de encuadrar, que es cuando de verdad importan.
 *
 * Ahora, si el navegador lo permite (`getUserMedia`), la cámara vive adentro:
 * el recuadro se dibuja SOBRE el video en vivo, la persona ve exactamente lo
 * que va a capturar antes de tocar el botón, y nunca sale de la app. Cuando no
 * se puede —permiso denegado, navegador viejo, http sin TLS— se cae al
 * selector de archivos de siempre: la función nunca se pierde, sólo la
 * experiencia es peor en ese caso puntual, que es exactamente lo que pasaba
 * siempre hasta ahora.
 */
const puedeUsarCamaraEnVivo = () =>
  typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

const LabelScanner = ({ onCapture, onCancel, onManual }) => {
  const galleryInputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [preview, setPreview] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");

  // "viva": la cámara está prendida y mostrando el video. "eligiendo": todavía
  // no se decidió (se está pidiendo el permiso). "archivo": se cayó al viejo
  // selector, por elección o porque el permiso no se pudo conseguir.
  const [modo, setModo] = useState(puedeUsarCamaraEnVivo() ? "eligiendo" : "archivo");

  const detenerCamara = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  // Se apaga la cámara al desmontar o al pasar a cualquier otro modo: una
  // cámara prendida de fondo es batería que se gasta y una luz que queda
  // encendida sin que la persona sepa por qué.
  useEffect(() => detenerCamara, [detenerCamara]);

  useEffect(() => {
    if (modo !== "eligiendo") return undefined;
    let cancelado = false;

    navigator.mediaDevices
      .getUserMedia({
        video: {
          // La trasera: es la que apunta a la botella. `exact` en vez de un
          // simple hint porque en un teléfono con dos cámaras traseras
          // (macro/normal) queremos la que el sistema entrega por defecto, no
          // dejarlo a discreción del navegador entre selfie y trasera.
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1920 },
        },
        audio: false,
      })
      .then((stream) => {
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setModo("viva");
      })
      .catch(() => {
        // Permiso denegado, sin cámara, o cualquier otro motivo: se cae al
        // selector de archivos sin mostrar un error — es un camino tan válido
        // como el otro, no una falla.
        if (!cancelado) setModo("archivo");
      });

    return () => {
      cancelado = true;
    };
  }, [modo]);

  // El stream ya existe (llegó por el efecto de arriba); lo único que falta es
  // conectarlo al <video> apenas éste se monta, porque en "eligiendo" el
  // elemento todavía no está en el DOM.
  useEffect(() => {
    if (modo === "viva" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [modo]);

  /**
   * Procesa un blob de imagen (venga de la cámara viva o del selector de
   * archivos): lo redimensiona en las dos versiones, lo sube y arma la
   * lectura. Es el mismo pipeline que antes vivía sólo en `handleFile`.
   */
  const procesarImagen = async (file) => {
    setAnalyzeError("");
    detenerCamara();

    let uploadBlob = file;
    let dataUrl;
    try {
      // Las dos reducciones son independientes —cada una parte de `file`, no
      // una de la otra— y antes se esperaban una atrás de la otra. En un
      // celular mid-range, redimensionar una foto de 12MP a 2000px no es
      // gratis, y hacerlo dos veces en fila sumaba ese trabajo dos veces al
      // camino crítico del escaneo antes de que la foto siquiera saliera a la
      // red. `Promise.all` los corre a la vez.
      const [paraLeer, paraGuardar] = await Promise.all([
        resizeImage(file, SCAN_MAX_DIM, SCAN_QUALITY),
        resizeImage(file, STORE_MAX_DIM, STORE_QUALITY),
      ]);
      uploadBlob = paraLeer.blob;
      dataUrl = paraGuardar.dataUrl;
    } catch {
      try {
        const bitmap = await createImageBitmap(file);
        const dibujar = (maxDim) => {
          const canvas = document.createElement("canvas");
          const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
          canvas.width = Math.round(bitmap.width * scale);
          canvas.height = Math.round(bitmap.height * scale);
          canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          return canvas;
        };
        const grande = dibujar(SCAN_MAX_DIM);
        uploadBlob = await new Promise((r) => grande.toBlob(r, "image/jpeg", SCAN_QUALITY));
        dataUrl = dibujar(STORE_MAX_DIM).toDataURL("image/jpeg", STORE_QUALITY);
      } catch {
        if (file.size > MAX_UPLOAD_BYTES) {
          setAnalyzeError("Esa foto es muy pesada y no la pudimos procesar. Probá sacarla de nuevo con la cámara.");
          return;
        }
        dataUrl = await fileToDataUrl(file);
      }
    }

    setPreview(dataUrl);
    setAnalyzing(true);

    try {
      const form = new FormData();
      form.append("file", uploadBlob, "etiqueta.jpg");
      const { data: body } = await api.post("/labels/analyze", form, { timeout: 30000 });
      const analysis = body.data || {};

      onCapture({
        preview: dataUrl,
        winery: analysis.winery || "",
        line: analysis.line || "",
        properName: analysis.properName || "",
        varietal: analysis.varietal || "",
        vintage: analysis.vintage || analysis.estimatedVintage || "",
        region: analysis.region || "",
        type: analysis.type || "unknown",
        confidence: analysis.confidence || {},
        issues: Array.isArray(analysis.issues) ? analysis.issues : [],
        verification: analysis.verification || null,
        source: analysis.source || "",
        rawText: analysis.rawText || "",
      });
    } catch {
      // NO llamamos a onCapture: si lo hacíamos, el padre desmontaba el escáner
      // y este mensaje nunca llegaba a verse. Ahora el usuario decide.
      setAnalyzeError("No se pudo leer la etiqueta. Probá con otra foto o cargá los datos a mano.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleInputChange = (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (file) procesarImagen(file);
  };

  /** El disparador: saca el frame actual del video y lo manda al mismo pipeline. */
  const disparar = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    tapHaptic();

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) procesarImagen(blob);
      },
      "image/jpeg",
      0.95
    );
  };

  const reintentar = () => {
    setPreview(null);
    setAnalyzeError("");
    setModo(puedeUsarCamaraEnVivo() ? "eligiendo" : "archivo");
  };

  /**
   * Los dos selectores de archivo, ocultos.
   *
   * Se dibujan en TODOS los modos y no sólo en el de archivo. El de galería lo
   * necesita también la cámara viva: su botón de abajo a la izquierda abría la
   * pantalla del selector —o sea, apagaba la cámara para mostrar otra pantalla
   * con dos botones más— cuando lo que la persona pidió fue elegir una foto.
   * Ahora abre la galería del sistema de una, que es lo que dice el ícono.
   */
  const selectores = (
    <>
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleInputChange}
        className="label-scanner__input"
      />
    </>
  );

  // ── Con foto ya tomada: la vista previa, analizando o el error. Es la misma
  // para los dos modos —cámara viva o selector— porque desde acá en adelante
  // ya no importa de dónde salió la imagen. ──────────────────────────────────
  if (preview) {
    return (
      <div className="label-scanner">
        <div className="label-scanner__preview">
          <img src={preview} alt="Etiqueta seleccionada" />
          {analyzing && (
            <div className="label-scanner__scanning" role="status">
              <span className="label-scanner__scan-line" />
              <div className="label-scanner__scan-text">
                <span className="label-scanner__spinner" aria-hidden="true" />
                <span>Leyendo la etiqueta…</span>
              </div>
            </div>
          )}
          {analyzeError && (
            <div className="label-scanner__failure" role="alert">
              <p className="label-scanner__error">
                <Icon name="alert-triangle" size={15} /> {analyzeError}
              </p>
              <div className="label-scanner__failure-actions">
                <button type="button" className="label-scanner__btn label-scanner__btn--primary" onClick={reintentar}>
                  <Icon name="camera" size={17} /> Sacar otra foto
                </button>
                {onManual && (
                  <button type="button" className="label-scanner__btn" onClick={onManual}>
                    <Icon name="pencil" size={16} /> Cargar a mano
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Cámara viva: el video de la cámara con el recuadro ENCIMA, no antes.
  // Es la diferencia central con la versión vieja: el consejo "acercate hasta
  // que se lea la letra chica" ahora se lee mientras la botella está enfocada
  // en pantalla, en el momento exacto en que se puede hacer algo con eso. ────
  if (modo === "viva") {
    return (
      <div className="label-scanner label-scanner--viva">
        {selectores}
        <div className="label-scanner__viewport">
          <video ref={videoRef} autoPlay playsInline muted className="label-scanner__video" />
          <div className="label-scanner__frame label-scanner__frame--overlay" aria-hidden="true">
            <span className="label-scanner__frame-corner label-scanner__frame-corner--tl" />
            <span className="label-scanner__frame-corner label-scanner__frame-corner--tr" />
            <span className="label-scanner__frame-corner label-scanner__frame-corner--bl" />
            <span className="label-scanner__frame-corner label-scanner__frame-corner--br" />
          </div>
          <p className="label-scanner__viva-hint">Acercate hasta que se lea la letra chica</p>
        </div>

        <div className="label-scanner__viva-bar">
          <button
            type="button"
            className="label-scanner__viva-secondary"
            onClick={() => galleryInputRef.current?.click()}
            aria-label="Elegir una foto de la galería"
            title="Galería"
          >
            <Icon name="image" size={20} />
          </button>

          <button
            type="button"
            className="label-scanner__shutter"
            onClick={disparar}
            aria-label="Sacar foto de la etiqueta"
          >
            <span className="label-scanner__shutter-ring" />
          </button>

          {onCancel ? (
            <button
              type="button"
              className="label-scanner__viva-secondary"
              onClick={() => { detenerCamara(); onCancel(); }}
              aria-label="Cancelar"
              title="Cancelar"
            >
              <Icon name="x" size={20} />
            </button>
          ) : (
            // Mantiene el disparador centrado aunque no haya cancelar.
            <span className="label-scanner__viva-secondary" aria-hidden="true" />
          )}
        </div>

        {onManual && (
          <button type="button" className="label-scanner__manual-link" onClick={() => { detenerCamara(); onManual(); }}>
            <Icon name="pencil" size={14} /> Prefiero cargarlo a mano
          </button>
        )}
      </div>
    );
  }

  // ── "Eligiendo": pidiendo permiso. Un instante corto, pero sin nada en
  // pantalla se lee como que la app se colgó. ─────────────────────────────────
  if (modo === "eligiendo") {
    return (
      <div className="label-scanner">
        <div className="label-scanner__frame" aria-hidden="true">
          <span className="label-scanner__spinner label-scanner__spinner--lg" />
          <p className="label-scanner__frame-hint">Abriendo la cámara…</p>
        </div>
      </div>
    );
  }

  // ── Sin cámara (permiso negado o navegador sin soporte): un estado corto con una salida. ──────
  // La galería del sistema ya ofrece "Sacar foto" en iOS y en Android, así que la función no se
  // pierde. Sin consejos ni párrafos: la pantalla dice qué pasó y qué hacer.
  return (
    <div className="label-scanner label-scanner--sin-camara">
      {selectores}

      <div className="label-scanner__frame" role="status">
        <Icon name="camera" size={38} className="label-scanner__frame-icon" />
        <p className="label-scanner__frame-hint">No pudimos abrir la cámara</p>
      </div>

      <div className="label-scanner__actions label-scanner__actions--una">
        <button
          type="button"
          className="label-scanner__btn label-scanner__btn--primary"
          onClick={() => galleryInputRef.current?.click()}
        >
          <Icon name="image" size={18} /> Elegir de la galería
        </button>
      </div>

      {onManual && (
        <button type="button" className="label-scanner__manual-link" onClick={onManual}>
          <Icon name="pencil" size={14} /> Cargar a mano
        </button>
      )}
    </div>
  );
};

export default LabelScanner;
