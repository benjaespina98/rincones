import { useRef, useState } from "react";
import api from "../services/api";
import Icon from "./Icon";
import { fileToDataUrl, resizeImage } from "../utils/image";
import "./LabelScanner.css";

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
    let uploadBlob = file;
    let dataUrl;
    try {
      const resized = await resizeImage(file);
      uploadBlob = resized.blob;
      dataUrl = resized.dataUrl;
    } catch {
      try {
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        uploadBlob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.85));
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
        source: analysis.source || "",
        rawText: analysis.rawText || "",
      });
    } catch {
      // NO llamamos a onCapture: si lo hacíamos, el padre desmontaba el escáner
      // y este mensaje nunca llegaba a verse. Ahora el usuario decide.
      setAnalyzeError("No pudimos leer la etiqueta. Probá con otra foto o cargá los datos a mano.");
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
            <p className="label-scanner__frame-hint">Encuadrá la etiqueta del vino</p>
          </div>

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
          {analyzing && (
            <div className="label-scanner__scanning" role="status">
              <span className="label-scanner__scan-line" />
              <div className="label-scanner__scan-text">
                <span className="label-scanner__spinner" aria-hidden="true" />
                Leyendo la etiqueta…
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
