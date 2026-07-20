import { useRef, useState } from "react";
import api from "../services/api";
import Icon from "./Icon";
import "./LabelScanner.css";

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// Reduce la imagen antes de subirla: baja la latencia del análisis y el peso de red.
const resizeImage = (file, maxDim = 1280, quality = 0.85) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (Math.max(width, height) > maxDim) {
        if (width >= height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      canvas.toBlob(
        (blob) => (blob ? resolve({ blob, dataUrl }) : reject(new Error("resize-failed"))),
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image-decode-failed"));
    };
    img.src = url;
  });

const LabelScanner = ({ onCapture, onCancel }) => {
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");

  const handleFile = async (file) => {
    if (!file) return;
    setAnalyzeError("");

    // Reducimos la imagen; si el navegador no la puede decodificar (ej. HEIC),
    // usamos el archivo original como respaldo.
    let uploadBlob = file;
    let dataUrl;
    try {
      const resized = await resizeImage(file);
      uploadBlob = resized.blob;
      dataUrl = resized.dataUrl;
    } catch {
      dataUrl = await fileToDataUrl(file);
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
        label: analysis.estimatedName || "",
        vintage: analysis.estimatedVintage || "",
        winery: analysis.winery || "",
        varietal: analysis.varietal || "",
        region: analysis.region || "",
        type: analysis.type || "unknown",
        confidence: typeof analysis.confidence === "number" ? analysis.confidence : null,
        source: analysis.source || "",
        rawText: analysis.rawText || "",
        ocrFailed: analysis.isWineLabel === false,
      });
    } catch {
      setAnalyzeError(
        "No pudimos leer la etiqueta automáticamente. Podés completar los datos a mano."
      );
      onCapture({ preview: dataUrl, label: "", vintage: "", winery: "", varietal: "", region: "", type: "unknown", confidence: null, source: "", rawText: "", ocrFailed: true });
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
            <p className="label-scanner__error">
              <Icon name="alert-triangle" size={15} /> {analyzeError}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default LabelScanner;
