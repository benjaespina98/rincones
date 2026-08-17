import { useRef, useState } from "react";
import api from "../services/api";
import Icon from "./Icon";
import { fileToDataUrl, resizeImage } from "../utils/image";
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

const LabelScanner = ({ onCapture, onCancel, onManual }) => {
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");

  // El server rechaza por encima de 8 MB (multer); avisamos antes de subir.
  const MAX_UPLOAD_BYTES = 7 * 1024 * 1024;

  const handleFile = async (file) => {
    if (!file) return;
    setAnalyzeError("");

    // Reducimos la imagen; si el navegador no la puede decodificar (ej. HEIC en
    // algunos Safari), reintentamos con createImageBitmap antes de rendirnos.
    //
    // `uploadBlob` es la grande (la que lee el modelo) y `dataUrl` la chica (la
    // que se ve y se guarda). Son dos pasadas de canvas sobre la misma foto:
    // cuesta unos milisegundos y es lo que separa leer la contraetiqueta de
    // adivinarla.
    let uploadBlob = file;
    let dataUrl;
    try {
      const paraLeer = await resizeImage(file, SCAN_MAX_DIM, SCAN_QUALITY);
      uploadBlob = paraLeer.blob;
      const paraGuardar = await resizeImage(file, STORE_MAX_DIM, STORE_QUALITY);
      dataUrl = paraGuardar.dataUrl;
    } catch {
      try {
        const bitmap = await createImageBitmap(file);
        // Sólo dimensiona: la calidad se aplica al exportar (toBlob/toDataURL).
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
        // Ni así: subir el original puede rebotar contra el límite del server,
        // así que lo decimos claro en vez de fallar con un error genérico.
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
        // Lo que el servidor ya detectó que no cierra en esta lectura. Se venía
        // perdiendo acá: el servidor lo mandaba, la revisión lo esperaba, y en el
        // medio este objeto lo dejaba afuera, así que un problema que el servidor
        // sí sabía ver (una uva rara de su vocabulario largo) llegaba vacío.
        issues: Array.isArray(analysis.issues) ? analysis.issues : [],
        // Si el nombre lo respalda una fuente real de vinos, y con cuál. Ver
        // `conVerificacion` en el controlador: es lo que separa "lo leímos" de
        // "existe y se llama así".
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
    if (file) handleFile(file);
    event.target.value = "";
  };

  return (
    <div className="label-scanner">
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleInputChange}
        className="label-scanner__input"
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleInputChange}
        className="label-scanner__input"
      />

      {!preview ? (
        <>
          <div className="label-scanner__frame" aria-hidden="true">
            <span className="label-scanner__frame-corner label-scanner__frame-corner--tl" />
            <span className="label-scanner__frame-corner label-scanner__frame-corner--tr" />
            <span className="label-scanner__frame-corner label-scanner__frame-corner--bl" />
            <span className="label-scanner__frame-corner label-scanner__frame-corner--br" />
            <Icon name="camera" size={38} className="label-scanner__frame-icon" />
            <p className="label-scanner__frame-hint">Que la etiqueta llene el recuadro</p>
          </div>

          {/* ── QUÉ FOTOGRAFIAR, DICHO ANTES DE LA FOTO ────────────────────────
              Tres consejos y no cinco, y los tres salen de causas reales de
              lectura equivocada:

              · Acercarse — es el que más pesa. En una foto de la botella entera
                la etiqueta ocupa menos de la mitad del alto, y el varietal y la
                cosecha quedan en el tamaño donde el modelo deja de leer y empieza
                a completar.
              · El brillo — el dorado sobre dorado con flash es ilegible, y las
                etiquetas de espumante son casi todas así.
              · La contraetiqueta — la cosecha suele estar atrás o en el cuello,
                no adelante. Es el dato que más veces falta.

              Van acá y no como un aviso después del error: una foto mal sacada
              ya gastó una llamada al modelo y la paciencia de la persona. */}
          <ul className="label-scanner__tips">
            <li><Icon name="search" size={13} /> Acercate hasta que se lea la letra chica</li>
            <li><Icon name="sparkle" size={13} /> Evitá el reflejo: mové la botella, no la luz</li>
            <li><Icon name="calendar" size={13} /> ¿No ves el año? Suele estar en el cuello o atrás</li>
          </ul>

          <div className="label-scanner__actions">
            <button
              type="button"
              className="label-scanner__btn label-scanner__btn--primary"
              onClick={() => cameraInputRef.current?.click()}
            >
              <Icon name="camera" size={18} /> Tomar foto
            </button>
            <button
              type="button"
              className="label-scanner__btn"
              onClick={() => galleryInputRef.current?.click()}
            >
              <Icon name="image" size={18} /> Galería
            </button>
          </div>

          {onCancel && (
            <button type="button" className="label-scanner__cancel" onClick={onCancel}>
              Cancelar
            </button>
          )}
        </>
      ) : (
        <div className="label-scanner__preview">
          <img src={preview} alt="Etiqueta seleccionada" />
          {/* Una sola espera. Antes eran dos —leer la etiqueta y después buscar
              la coincidencia en el catálogo, desde el navegador—; el cruce contra
              el catálogo se hizo parte de la lectura y vive en el servidor, así
              que acá quedó un único estado en vez de dos textos encadenados. */}
          {analyzing && (
            <div className="label-scanner__scanning" role="status">
              <span className="label-scanner__scan-line" />
              <div className="label-scanner__scan-text">
                <span className="label-scanner__spinner" aria-hidden="true" />
                <span>
                  Leyendo la etiqueta…
                  {/* Que después hay una revisión se dice ACÁ, mientras se
                      espera. Es el momento en que la persona se está preguntando
                      si la app va a guardar cualquier cosa, y saber que va a
                      poder mirarlo antes cambia lo que siente la espera. */}
                  <em>Vas a poder revisar lo que leímos antes de guardar</em>
                </span>
              </div>
            </div>
          )}
          {analyzeError && (
            <div className="label-scanner__failure" role="alert">
              <p className="label-scanner__error">
                <Icon name="alert-triangle" size={15} /> {analyzeError}
              </p>
              <div className="label-scanner__failure-actions">
                <button
                  type="button"
                  className="label-scanner__btn label-scanner__btn--primary"
                  onClick={() => { setPreview(null); setAnalyzeError(""); cameraInputRef.current?.click(); }}
                >
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
      )}
    </div>
  );
};

export default LabelScanner;
