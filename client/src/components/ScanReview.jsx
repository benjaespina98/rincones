import { useMemo, useState } from "react";
import Icon from "./Icon";
import { WINE_TYPE_LABELS, WINERIES, REGIONS, VARIETALS } from "../data/wineReference";
import { composeDisplayName, guessWineType, confidenceLevel } from "../utils/wineIdentity";
import "./ScanReview.css";

/**
 * Revisión de lo que leímos de la etiqueta, antes de guardar.
 *
 * Por qué existe: antes, si Gemini leía la etiqueta con éxito, el vino se
 * guardaba solo y saltaba a la ficha. El usuario nunca veía lo que se había
 * leído, así que un dato mal leído entraba a la bodega en silencio y sólo se
 * descubría mucho después.
 *
 * Diseño para "acabo de sacar una foto en el celular": en el caso feliz es una
 * pantalla, un toque y sin scroll. Los campos que el modelo leyó con seguridad
 * se colapsan en una fila de chips; sólo los dudosos aparecen como inputs.
 */

const FIELD_LABELS = {
  winery: "Bodega",
  line: "Línea",
  varietal: "Uva",
  vintage: "Cosecha",
  region: "Región",
};

const DATALISTS = {
  winery: { id: "sr-wineries", options: WINERIES },
  region: { id: "sr-regions", options: REGIONS },
  varietal: { id: "sr-varietals", options: VARIETALS },
};

export default function ScanReview({
  photo,
  reading,
  matchedFrom,
  saving = false,
  onConfirm,
  onWish,
  onCancel,
  onRescan,
}) {
  const [values, setValues] = useState(() => ({
    winery: reading?.values?.winery || "",
    line: reading?.values?.line || "",
    properName: reading?.values?.properName || "",
    varietal: reading?.values?.varietal || "",
    vintage: reading?.values?.vintage || "",
    region: reading?.values?.region || "",
    type: reading?.values?.type || "unknown",
  }));
  // Al editar un campo, deja de estar en duda: es dato del usuario.
  const [touched, setTouched] = useState(() => new Set());
  const [showAll, setShowAll] = useState(false);

  const conf = reading?.confidence || {};
  const isManual = reading?.source === "manual";
  const levelOf = (field) => (touched.has(field) ? "trusted" : confidenceLevel(conf[field]));

  const setField = (field, value) => {
    setValues((v) => ({ ...v, [field]: value }));
    setTouched((t) => new Set(t).add(field));
  };

  const title = useMemo(
    () => composeDisplayName({
      name: values.properName,
      line: values.line,
      varietal: values.varietal,
      winery: values.winery,
    }),
    [values]
  );

  // El tipo se deriva de la uva: no tiene sentido preguntarlo aparte.
  const derivedType =
    values.type !== "unknown" ? values.type : guessWineType(`${values.varietal} ${title}`);

  // Campos a mostrar como input: los dudosos y los vacíos. El resto va en chips.
  const editableFields = ["winery", "line", "varietal", "vintage", "region"];
  const needsReview = editableFields.filter((f) => levelOf(f) !== "trusted");
  const trusted = editableFields.filter((f) => levelOf(f) === "trusted" && values[f]);
  const visible = showAll ? editableFields : needsReview;

  const submit = (e) => {
    e.preventDefault();
    if (saving) return;
    onConfirm?.({ ...values, type: derivedType, name: title });
  };

  return (
    <form className="scan-review" onSubmit={submit}>
      <header className="scan-review__head">
        {photo && (
          <img className="scan-review__thumb" src={photo} alt="Foto de la etiqueta que escaneaste" />
        )}
        <div className="scan-review__headings">
          <p className="scan-review__kicker">
            {isManual ? "Cargar a mano" : "Esto leímos de la etiqueta"}
          </p>
          <h2 className="scan-review__title">
            {title || (isManual ? "Nuevo vino" : "Vino sin nombre")}
          </h2>
          {values.winery && <p className="scan-review__winery">{values.winery}</p>}
        </div>
      </header>

      {matchedFrom && (
        <p className="scan-review__matched">
          <Icon name="sparkles" size={13} /> Completamos algunos datos desde el catálogo
        </p>
      )}

      {trusted.length > 0 && !showAll && (
        <div className="scan-review__chips">
          {trusted.map((f) => (
            <span key={f} className="scan-review__chip">
              <em>{FIELD_LABELS[f]}</em> {values[f]}
            </span>
          ))}
          {derivedType !== "unknown" && (
            <span className="scan-review__chip">
              <em>Tipo</em> {WINE_TYPE_LABELS[derivedType]}
            </span>
          )}
        </div>
      )}

      {visible.length > 0 && (
        <div className="scan-review__fields">
          {!showAll && needsReview.length > 0 && (
            <p className="scan-review__hint">
              {isManual
                ? "Con la bodega y la uva alcanza. El resto lo completás cuando quieras."
                : "Revisá estos datos: no los pudimos leer con seguridad."}
            </p>
          )}
          {visible.map((field) => {
            const level = levelOf(field);
            const dl = DATALISTS[field];
            // En carga manual no marcamos nada en ámbar: no hay lectura que dudar.
            const tone = isManual ? "manual" : level;
            return (
              <label key={field} className={`scan-review__field is-${tone}`}>
                <span className="scan-review__label">
                  {FIELD_LABELS[field]}
                  {!isManual && level === "low" && !values[field] && <em> · no lo leímos</em>}
                  {!isManual && level === "review" && <em> · verificá</em>}
                </span>
                <input
                  type={field === "vintage" ? "number" : "text"}
                  inputMode={field === "vintage" ? "numeric" : undefined}
                  min={field === "vintage" ? 1900 : undefined}
                  max={field === "vintage" ? new Date().getFullYear() : undefined}
                  value={values[field]}
                  onChange={(e) => setField(field, e.target.value)}
                  placeholder={FIELD_LABELS[field]}
                  list={dl?.id}
                  disabled={saving}
                  autoComplete="off"
                />
                {dl && (
                  <datalist id={dl.id}>
                    {dl.options.map((o) => <option key={o} value={o} />)}
                  </datalist>
                )}
              </label>
            );
          })}
        </div>
      )}

      <button
        type="button"
        className="scan-review__toggle"
        onClick={() => setShowAll((s) => !s)}
        disabled={saving}
      >
        {showAll ? "Ocultar los que están bien" : "Editar todos los datos"}
      </button>

      <div className="scan-review__actions">
        <button type="submit" className="scan-review__save" disabled={saving}>
          {saving ? "Guardando…" : <><Icon name="check" size={17} /> Agregar a mi bodega</>}
        </button>
        <button type="button" className="scan-review__wish" onClick={() => onWish?.({ ...values, type: derivedType, name: title })} disabled={saving}>
          <Icon name="heart" size={16} /> Solo guardarlo
        </button>
        <div className="scan-review__minor">
          {onRescan && (
            <button type="button" className="scan-review__link" onClick={onRescan} disabled={saving}>
              Sacar otra foto
            </button>
          )}
          <button type="button" className="scan-review__link" onClick={onCancel} disabled={saving}>
            Cancelar
          </button>
        </div>
      </div>
    </form>
  );
}
