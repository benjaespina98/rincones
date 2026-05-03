import { useRef, useState } from "react";

const LabelScanner = ({ onCapture }) => {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [label, setLabel] = useState("");
  const [vintage, setVintage] = useState("");
  const [notes, setNotes] = useState("");
  const [serverLoading, setServerLoading] = useState(false);
  const [serverAnalysis, setServerAnalysis] = useState(null);

  const handleFileChange = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = () => {
      setPreview(reader.result);
      setServerAnalysis(null);
    };
    reader.readAsDataURL(f);
  };

  const handleCapture = () => {
    if (!file && !preview) return;
    const payload = {
      file,
      preview,
      filename: file?.name || "photo",
      label: label.trim(),
      vintage: vintage.trim(),
      notes: notes.trim(),
      capturedAt: new Date().toISOString(),
    };

    if (typeof onCapture === "function") {
      onCapture(payload);
    }

    setFile(null);
    setPreview(null);
    setLabel("");
    setVintage("");
    setNotes("");
    setServerAnalysis(null);
    if (inputRef.current) inputRef.current.value = null;
  };

  const handleServerAnalyze = async () => {
    if (!file && !preview) return;
    setServerLoading(true);
    setServerAnalysis(null);
    try {
      const form = new FormData();
      if (file) {
        form.append("file", file, file.name);
      } else if (preview) {
        const res = await fetch(preview);
        const blob = await res.blob();
        form.append("file", blob, "capture.jpg");
      }

      const resp = await fetch("/api/labels/analyze", {
        method: "POST",
        body: form,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.message || "Error en análisis servidor");
      }

      const body = await resp.json();
      setServerAnalysis(body.data || null);
    } catch (e) {
      setServerAnalysis({ error: String(e.message || e) });
    } finally {
      setServerLoading(false);
    }
  };

  const applyServerAnalysis = (analysis) => {
    if (!analysis) return;
    if (analysis.estimatedName) setLabel(analysis.estimatedName);
    if (analysis.estimatedVintage) setVintage(analysis.estimatedVintage);
    if (analysis.rawText) setNotes((prev) => (prev ? `${prev}\n\n${analysis.rawText}` : analysis.rawText));
    setServerAnalysis(null);
  };

  return (
    <div className="label-scanner">
      <div className="label-scanner__controls">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="label-scanner__input"
        />
        <button type="button" className="button button--violet" onClick={() => inputRef.current && inputRef.current.click()}>
          Tomar foto
        </button>
        <button
          type="button"
          className="button button--ghost"
          onClick={handleServerAnalyze}
          disabled={!preview || serverLoading}
        >
          {serverLoading ? "Analizando..." : "Analizar en servidor"}
        </button>
      </div>

      {preview && (
        <div className="label-scanner__preview">
          <img src={preview} alt="Preview etiqueta" />
          <div className="label-scanner__fields">
            <input placeholder="Nombre del vino / etiqueta" value={label} onChange={(e) => setLabel(e.target.value)} />
            <input placeholder="Año (ej. 2019)" value={vintage} onChange={(e) => setVintage(e.target.value)} />
            <textarea placeholder="Notas / descripción" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <div className="label-scanner__actions">
              <button type="button" className="button" onClick={handleCapture}>
                Guardar info
              </button>
            </div>
            {serverAnalysis && (
              <div className="label-scanner__server-result">
                {serverAnalysis.error ? (
                  <small className="map-help">Error: {serverAnalysis.error}</small>
                ) : (
                  <div>
                    <strong>Resultado servidor</strong>
                    {serverAnalysis.estimatedName && <div>Nombre sugerido: {serverAnalysis.estimatedName}</div>}
                    {serverAnalysis.estimatedVintage && <div>Año sugerido: {serverAnalysis.estimatedVintage}</div>}
                    {serverAnalysis.rawText && (
                      <details>
                        <summary className="map-help">Texto OCR del servidor</summary>
                        <pre style={{ whiteSpace: "pre-wrap", maxHeight: 180, overflow: "auto" }}>{serverAnalysis.rawText}</pre>
                      </details>
                    )}
                    <div style={{ marginTop: 8 }}>
                      <button type="button" className="button button--violet" onClick={() => applyServerAnalysis(serverAnalysis)}>Aplicar</button>
                      <button type="button" className="button button--ghost" onClick={() => setServerAnalysis(null)} style={{ marginLeft: 8 }}>Cerrar</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LabelScanner;
