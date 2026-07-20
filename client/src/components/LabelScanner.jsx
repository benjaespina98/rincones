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
        confidence: typeof analysis.confidence === "number" ? analysis.confidence : null,
        rawText: analysis.rawText || "",
        ocrFailed: false,
      });
    } catch {
      setAnalyzeError(
        "No pudimos leer la etiqueta automáticamente. Podés completar los datos a mano."
      );
      onCapture({ preview: dataUrl, label: "", vintage: "", confidence: null, rawText: "", ocrFailed: true });
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
