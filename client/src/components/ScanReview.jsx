import { useMemo, useState } from "react";
import Icon from "./Icon";
import ConceptTerm from "./ConceptTerm";
import { WINE_TYPE_LABELS, WINERIES, REGIONS, VARIETALS } from "../data/wineReference";
import { composeDisplayName, guessWineType, confidenceLevel } from "../utils/wineIdentity";
import {
  checkCoherence,
  identificationVerdict,
  FIELDS_FOR_ISSUE,
  ISSUE_COPY,
} from "../utils/wineValidation";
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
  properName: "Nombre propio",
  varietal: "Uva",
  vintage: "Cosecha",
  region: "Región",
};

/**
 * El nombre propio, que hasta ahora no se podía editar.
 *
 * No estaba en la lista de campos y no hacía falta, porque el nombre visible
 * caía a la bodega cuando no había otra cosa: siempre había ALGO escrito. Ese
 * fallback era el bug —guardaba la bodega como nombre del vino— y al sacarlo
 * apareció un caso que antes no existía: una lectura sin línea ni nombre propio
 * deja al vino literalmente sin nombre, y hay que poder escribirlo.
 */
const EDITABLE_FIELDS = ["winery", "line", "properName", "varietal", "vintage", "region"];

/**
 * Qué concepto explica cada rótulo.
 *
 * Es el único momento del recorrido en que la persona tiene una etiqueta
 * adelante y está tratando de descifrarla: acá "Línea" y "Región" son preguntas
 * de verdad, y en cualquier otra pantalla serían un glosario que nadie abre.
 */
const FIELD_CONCEPTS = {
  winery: "etiqueta",
  line: "reserva",
  region: "terroir",
  varietal: "uvas",
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
  // Cuántas botellas entran a la cava. Obligar a escanear doce veces la misma
  // etiqueta porque compraste una caja no tiene sentido.
  const [cantidad, setCantidad] = useState(1);

  // Estable entre renders: es dependencia de los useMemo del veredicto, y un
  // objeto nuevo en cada render los haría recalcular siempre.
  const conf = useMemo(() => reading?.confidence || {}, [reading]);
  const isManual = reading?.source === "manual";
  const levelOf = (field) => (touched.has(field) ? "trusted" : confidenceLevel(conf[field]));

  const setField = (field, value) => {
    setValues((v) => ({ ...v, [field]: value }));
    setTouched((t) => new Set(t).add(field));
  };

  const title = useMemo(
    () => composeDisplayName({ name: values.properName, line: values.line }),
    [values]
  );

  // El tipo se deriva de la uva: no tiene sentido preguntarlo aparte.
  const derivedType =
    values.type !== "unknown" ? values.type : guessWineType(`${values.varietal} ${title}`);

  /**
   * ── QUÉ TAN BIEN SALIÓ ESTA LECTURA ───────────────────────────────────────
   *
   * Se recalcula en cada tecla sobre lo que hay AHORA, no sobre lo que llegó del
   * servidor: el problema puede aparecer al editar (escribís la bodega y queda
   * igual al nombre) y sobre todo puede DESAPARECER, que es lo que permite que
   * el aviso se vaya solo apenas lo arreglás, sin un botón de "revalidar".
   *
   * Los `serverIssues` sólo suman al arranque: el servidor conoce el vocabulario
   * completo de uvas del catálogo y el cliente no (ver utils/wineValidation.js),
   * así que su opinión sobre un varietal raro es mejor que la nuestra hasta que
   * la persona toque el campo.
   */
  const issues = useMemo(() => {
    const propios = checkCoherence({ ...values, type: derivedType });
    const delServidor = (reading?.serverIssues || []).filter(
      // Los del servidor valen mientras no se haya tocado el campo que arreglan.
      (code) => !(FIELDS_FOR_ISSUE[code] || []).some((f) => touched.has(f))
    );
    return [...new Set([...propios, ...delServidor])];
  }, [values, derivedType, reading, touched]);

  const verdict = useMemo(
    () =>
      identificationVerdict({
        values,
        confidence: conf,
        editedFields: [...touched],
        source: reading?.source,
        issues,
      }),
    [values, conf, touched, reading, issues]
  );

  /**
   * Los campos que hay que mostrar sí o sí porque algo no cierra con ellos.
   *
   * Es lo que evita el "arreglalo pero no te digo dónde": si el nombre quedó
   * igual a la bodega, se abren los tres campos que pueden resolverlo y el aviso
   * aparece arriba de ellos.
   */
  const forcedFields = useMemo(() => {
    const set = new Set();
    for (const code of issues) {
      for (const f of FIELDS_FOR_ISSUE[code] || []) set.add(f);
    }
    return set;
  }, [issues]);

  // Campos a mostrar como input: los dudosos, los vacíos y los que arreglan un
  // problema. El resto va en chips.
  const needsReview = EDITABLE_FIELDS.filter(
    (f) => levelOf(f) !== "trusted" || forcedFields.has(f)
  );
  const trusted = EDITABLE_FIELDS.filter(
    (f) => levelOf(f) === "trusted" && values[f] && !forcedFields.has(f)
  );
  const visible = showAll ? EDITABLE_FIELDS : needsReview;

  /**
   * Con una identificación dudosa no se guarda hasta tocar algo.
   *
   * `bloqueado` es deliberadamente flojo: alcanza con que la persona haya editado
   * uno de los campos señalados y que el problema ya no exista. No pedimos que
   * complete la ficha entera ni que confirme campo por campo — eso convertiría
   * cada escaneo en un formulario, que es justo lo que no queremos. Un vino bien
   * leído sigue siendo un toque; sólo el que salió mal pide una corrección, y
   * pide la mínima.
   */
  const bloqueado = verdict === "doubtful";

  const submit = (e) => {
    e.preventDefault();
    if (saving || bloqueado) return;
    onConfirm?.({
      ...values,
      type: derivedType,
      name: title,
      quantity: cantidad,
      // La evidencia con la que el servidor decide si esto puede publicarse.
      identSource: isManual ? "manual" : reading?.source === "ocr" ? "ocr" : "scan",
      identConfidence: conf,
      identEditedFields: [...touched],
    });
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

      {matchedFrom && issues.length === 0 && (
        <p className="scan-review__matched">
          <Icon name="sparkles" size={13} /> Completamos algunos datos desde el catálogo
        </p>
      )}

      {/* Lo que no cierra. Va arriba de los campos que lo arreglan —que ya están
          abiertos por `forcedFields`— y desaparece solo apenas se corrige.
          Se cuenta como una observación sobre lo que LEÍMOS: la que se equivocó
          fue la app, no la persona que sacó la foto. */}
      {issues.length > 0 && (
        <div className={`scan-review__issues ${bloqueado ? "is-blocking" : ""}`} role="status">
          <p className="scan-review__issues-head">
            <Icon name="alert-triangle" size={14} />
            {bloqueado ? "Esto no lo pudimos leer bien" : "Revisá esto antes de guardar"}
          </p>
          <ul>
            {issues.map((code) => (
              <li key={code}>{ISSUE_COPY[code] || "Hay un dato que no cierra."}</li>
            ))}
          </ul>
        </div>
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
          {!showAll && needsReview.length > 0 && issues.length === 0 && (
            <p className="scan-review__hint">
              {isManual
                ? "Con el nombre y la bodega alcanza. El resto lo completás cuando quieras."
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
                  {FIELD_CONCEPTS[field] ? (
                    <ConceptTerm id={FIELD_CONCEPTS[field]} ctx={{ wine: values }}>
                      {FIELD_LABELS[field]}
                    </ConceptTerm>
                  ) : (
                    FIELD_LABELS[field]
                  )}
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

      {/* Cuántas botellas. Los atajos cubren los casos reales —media docena,
          una caja— sin obligar a tocar doce veces el más. */}
      <div className="scan-qty">
        <span className="scan-qty__label">¿Cuántas botellas?</span>
        <div className="scan-qty__row">
          <div className="scan-qty__stepper">
            <button
              type="button"
              onClick={() => setCantidad((n) => Math.max(1, n - 1))}
              disabled={saving || cantidad <= 1}
              aria-label="Una botella menos"
            >
              <Icon name="minus" size={16} />
            </button>
            <span className="scan-qty__n" aria-live="polite">{cantidad}</span>
            <button
              type="button"
              onClick={() => setCantidad((n) => Math.min(99, n + 1))}
              disabled={saving || cantidad >= 99}
              aria-label="Una botella más"
            >
              <Icon name="plus" size={16} />
            </button>
          </div>
          <div className="scan-qty__presets">
            {[6, 12].map((n) => (
              <button
                key={n}
                type="button"
                className={`scan-qty__preset ${cantidad === n ? "is-active" : ""}`}
                onClick={() => setCantidad(n)}
                disabled={saving}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="scan-review__actions">
        <button
          type="submit"
          className="scan-review__save"
          disabled={saving || bloqueado}
          title={bloqueado ? "Completá o corregí lo que marcamos arriba" : undefined}
        >
          {saving ? "Guardando…" : <><Icon name="check" size={17} /> {cantidad === 1 ? "Agregar a mi bodega" : `Agregar ${cantidad} botellas`}</>}
        </button>
        {/* Por qué no se puede guardar, dicho al lado del botón que no anda.
            Sin esto, un botón deshabilitado es un callejón sin salida. */}
        {bloqueado && !saving && (
          <p className="scan-review__blocked-hint">
            Corregí lo de arriba y ya lo agregamos.
          </p>
        )}
        {/* Guardarlo en la lista es privado: no toca el catálogo público, así que
            no lo frena el veredicto. Lo único que necesita es un nombre. */}
        <button
          type="button"
          className="scan-review__wish"
          onClick={() => onWish?.({ ...values, type: derivedType, name: title })}
          disabled={saving || !title}
        >
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
