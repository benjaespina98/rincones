import { useRef, useState } from "react";
import api from "../services/api";
import "./LabelScanner.css";

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
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

    const dataUrl = await fileToDataUrl(file);
    setPreview(dataUrl);
    setAnalyzing(true);

    try {
      const form = new FormData();
      form.append("file", file, file.name || "etiqueta.jpg");
      const { data: body } = await api.post("/labels/analyze", form, { timeout: 30000 });
      const analysis = body.data || {};

      onCapture({
        preview: dataUrl,
        label: analysis.estimatedName || "",
        vintage: analysis.estimatedVintage || "",
        rawText: analysis.rawText || "",
        ocrFailed: false,
      });
    } catch (error) {
      setAnalyzeError(
        "No se pudo leer la etiqueta automáticamente. Podés completar los datos a mano."
      );
      // Seguimos el flujo igual: el usuario completa todo manualmente en la siguiente pantalla.
      onCapture({ preview: dataUrl, label: "", vintage: "", rawText: "", ocrFailed: true });
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
      {!preview ? (
        <div className="label-scanner__sources">
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

          <button
            type="button"
            className="label-scanner__source-btn"
            onClick={() => cameraInputRef.current?.click()}
          >
            <span className="label-scanner__source-icon" aria-hidden="true">📷</span>
            <span>Tomar foto</span>
          </button>

          <button
            type="button"
            className="label-scanner__source-btn"
            onClick={() => galleryInputRef.current?.click()}
          >
            <span className="label-scanner__source-icon" aria-hidden="true">🖼️</span>
            <span>Subir de galería</span>
          </button>

          {onCancel && (
            <button type="button" className="btn-cancel" onClick={onCancel}>
              Cancelar
            </button>
          )}
        </div>
      ) : (
        <div className="label-scanner__preview">
          <img src={preview} alt="Etiqueta seleccionada" />
          {analyzing && (
            <div className="label-scanner__analyzing">
              <span className="label-scanner__spinner" aria-hidden="true" />
              Analizando etiqueta...
            </div>
          )}
          {analyzeError && <p className="label-scanner__error">{analyzeError}</p>}
        </div>
      )}
    </div>
  );
};

export default LabelScanner;
