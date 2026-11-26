import { useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import ConceptTerm from "./ConceptTerm";
import Segmented from "./Segmented";
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
  name: "Nombre del vino",
  varietal: "Uva",
  vintage: "Cosecha",
  region: "Región",
};

/**
 * ── POR QUÉ EL NOMBRE ES UN SOLO CAMPO ──────────────────────────────────────
 * Adentro el nombre son dos: la LÍNEA ("Reserva", "Saint Felicien") y el NOMBRE
 * PROPIO ("Angélica Zapata", "Nicasia"). La distinción es real y la necesita la
 * deduplicación —ver identityKey en utils/wineIdentity.js—, pero es NUESTRA, no
 * de quien tiene la botella en la mano. Preguntarle en cuál de los dos va
 * "Pispi" es pedirle que entienda nuestro modelo de datos para poder guardar un
 * vino.
 *
 * Así que la pantalla muestra uno solo —"Nombre del vino", lo que dice grande en
 * la etiqueta— y lo escribe en el campo del que salió: en el nombre propio si la
 * lectura trajo uno, y en la línea en cualquier otro caso. Nada se pierde: los
 * dos campos siguen viajando separados al servidor.
 */
const NAME_FIELD = "name";
const NAME_PARTS = ["line", "properName"];

const EDITABLE_FIELDS = ["winery", NAME_FIELD, "varietal", "vintage", "region"];
// El orden en pantalla: nombre, bodega, uva, cosecha, región. Después van el tipo y las botellas.
const DISPLAY_FIELDS = [NAME_FIELD, "winery", "varietal", "vintage", "region"];

/**
 * Qué concepto explica cada rótulo.
 *
 * Es el único momento del recorrido en que la persona tiene una etiqueta
 * adelante y está tratando de descifrarla: acá "Región" y qué significa
 * "Reserva" en el nombre son preguntas de verdad, y en cualquier otra pantalla
 * serían un glosario que nadie abre.
 */
const FIELD_CONCEPTS = {
  winery: "etiqueta",
  [NAME_FIELD]: "reserva",
  region: "terroir",
  varietal: "uvas",
};

const DATALISTS = {
  winery: { id: "sr-wineries", options: WINERIES },
  region: { id: "sr-regions", options: REGIONS },
  varietal: { id: "sr-varietals", options: VARIETALS },
};

/** Quién respalda el nombre de este vino (se lee sobre «Verificado»). */
const VERIFICACION_COPY = {
  "catalogo-ar": "Verificado: figura así en el catálogo argentino",
  "comunidad-verificada": "Verificado: otras personas lo tienen cargado igual",
  gemini: "Chequeado aparte: este vino existe y se llama así",
};

export default function ScanReview({
  photo,
  reading,
  verification,
  saving = false,
  onConfirm,
  onWish,
  onConsult,
  onCancel,
  onRescan,
  onManual,
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
  /**
   * El candidato que la app propuso y que la persona ya resolvió.
   *
   * "aceptado" copia sus datos a la lectura; "descartado" esconde la pregunta.
   * Cualquiera de los dos es una respuesta, y las dos veces la pregunta se va: la
   * peor versión de esto sería un cartel que sigue preguntando lo mismo después
   * de que le contestaste.
   */
  const [sugerencia, setSugerencia] = useState("pendiente");
  /**
   * ── ¿LA TENÉS O YA LA TOMASTE? ──────────────────────────────────────────────
   * Se elige entre dos opciones a la vista, no bajando un contador a cero y leyendo
   * una nota. Arranca en "Lo tengo" con UNA botella, que es a lo que casi todos
   * vienen. "Ya lo tomé" guarda sin botellas y probado.
   */
  const [destino, setDestino] = useState("tengo");
  const [cantidad, setCantidad] = useState(1);
  const botellas = destino === "tomado" ? 0 : cantidad;
  // Si la lectura salió tan floja que no hay campo puntual que señalar, se
  // esconde el formulario detrás de "Completar los datos a mano" (ver
  // `sinIdentificar` más abajo) en vez de mostrarlo de entrada.
  const [revelarDatos, setRevelarDatos] = useState(false);

  // Estable entre renders: es dependencia de los useMemo del veredicto, y un
  // objeto nuevo en cada render los haría recalcular siempre.
  const conf = useMemo(() => reading?.confidence || {}, [reading]);
  const isManual = reading?.source === "manual";

  // Con la bodega: una gama genérica ("Reserva") se completa a "Norton Reserva".
  const compuesto = useMemo(
    () =>
      composeDisplayName({
        name: values.properName,
        line: values.line,
        winery: values.winery,
      }),
    [values]
  );

  /**
   * ── SIN NOMBRE LEGIBLE, EL VINO SE LLAMA COMO SU BODEGA ─────────────────────
   * Pedirle a la persona que escriba es la última opción: si sólo se leyó la
   * bodega (o la uva), con eso alcanza para guardar. El servidor igual ve que el
   * nombre repite la bodega y no publica ese vino al catálogo compartido.
   */
  const respaldo = values.winery.trim() || values.varietal.trim();
  const nombreTocado = NAME_PARTS.some((p) => touched.has(p));
  const nombreAGuardar = compuesto || respaldo;
  const title = compuesto || (nombreTocado || isManual ? "" : respaldo);

  /**
   * A cuál de los dos campos internos escribe el campo único de nombre.
   *
   * Al que trajo el dato, para no partir en dos la identidad de un vino que la
   * lectura ya había resuelto bien: si el modelo entendió que "Angélica Zapata"
   * es un nombre propio, editarlo lo sigue siendo. Cuando no hay nada, va a la
   * línea, que es el caso mayoritario ("Reserva", "Saint Felicien", "Pispi") y
   * el que `identityKey` prefiere para deduplicar.
   *
   * ── POR QUÉ ES ESTADO Y NO UN VALOR DERIVADO ───────────────────────────────
   * Salía de la lectura ORIGINAL, y aceptar un candidato lo dejaba apuntando al
   * campo equivocado: el candidato se escribe en la línea y vacía el nombre
   * propio, pero el destino seguía siendo `properName`. Si después editabas el
   * nombre, el texto nuevo iba al nombre propio mientras la línea conservaba el
   * del candidato — dos campos con dos vinos distintos, y `identityKey` mira la
   * línea primero, así que el vino se guardaba con un nombre que ya no era el
   * que decía la pantalla.
   *
   * Se recalcula sólo cuando algo mueve el dato de campo (aceptar un candidato),
   * y no en cada tecla: si dependiera de los valores actuales, borrar el nombre
   * entero cambiaría el destino a mitad de tipeo.
   */
  const [nameTarget, setNameTarget] = useState(() =>
    reading?.values?.properName ? "properName" : "line"
  );

  /**
   * Apenas se toca el nombre, el campo muestra LO ESCRITO y no el nombre compuesto:
   * componer recorta los espacios, así que "Finca " volvía a "Finca" y no había
   * forma de escribir "Finca Humanao".
   */
  const valueOf = (field) => {
    if (field !== NAME_FIELD) return values[field];
    return nombreTocado ? values[nameTarget] : title;
  };

  // El nombre vale lo mejor de sus dos mitades: cualquiera de las dos alcanza
  // para nombrar la botella, así que la peor no puede arrastrar a la otra.
  const levelOf = (field) => {
    if (field === NAME_FIELD) {
      if (NAME_PARTS.some((p) => touched.has(p))) return "trusted";
      const niveles = ["trusted", "review", "low"];
      const mejor = Math.min(
        ...["name", "line"].map((k) => niveles.indexOf(confidenceLevel(conf[k])))
      );
      return niveles[mejor] || "low";
    }
    return touched.has(field) ? "trusted" : confidenceLevel(conf[field]);
  };

  const setField = (field, value) => {
    const destino = field === NAME_FIELD ? nameTarget : field;
    // Borrar el nombre borra sus dos mitades: si no, se guardaba la que no está a la vista.
    const borrado = field === NAME_FIELD && !value;
    setValues((v) => (borrado ? { ...v, line: "", properName: "" } : { ...v, [destino]: value }));
    setTouched((t) => new Set(t).add(destino));
  };

  /**
   * "Sí, es ese": adopta el vino que propuso la app.
   *
   * Los campos quedan marcados como TOCADOS, y no es un detalle de
   * implementación: para el servidor, un campo que la persona puso vale 100 —es
   * la señal más fuerte que maneja el sistema— y confirmar un candidato mirando
   * la botella es exactamente eso. Sin esto, aceptar la sugerencia dejaría el
   * vino con la misma confianza floja que tenía antes de que alguien lo mirara.
   *
   * Sólo se escribe lo que el candidato sabe: si no trae región, la leída se
   * queda. Nunca se borra un dato para reemplazarlo por un hueco.
   */
  const aplicarCandidato = (c) => {
    if (!c) return;
    const nuevos = {
      line: c.name || "",
      properName: "",
      winery: c.winery || values.winery,
      varietal: c.varietal || values.varietal,
      region: c.region || values.region,
      type: c.type && c.type !== "unknown" ? c.type : values.type,
    };
    setValues((v) => ({ ...v, ...nuevos }));
    setTouched((t) => {
      const next = new Set(t);
      for (const campo of ["line", "properName", "winery", "varietal", "region"]) {
        if (nuevos[campo]) next.add(campo);
      }
      return next;
    });
    // El nombre del candidato queda en la línea, así que lo que se edite después
    // tiene que ir ahí. Ver el comentario de `nameTarget`.
    setNameTarget("line");
    setSugerencia("aceptada");
  };

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
    // "El nombre es la bodega" y "sin nombre" no se le preguntan a nadie: ver `respaldo`.
    return [...new Set([...propios, ...delServidor])].filter(
      (code) => code !== "nombre-es-bodega" && code !== "sin-nombre"
    );
  }, [values, derivedType, reading, touched]);

  /**
   * Los campos que hay que mostrar sí o sí porque algo no cierra con ellos.
   *
   * Es lo que evita el "arreglalo pero no te digo dónde": si el nombre quedó
   * igual a la bodega, se abren los campos que pueden resolverlo y el aviso
   * aparece arriba de ellos. `FIELDS_FOR_ISSUE` habla de las dos mitades del
   * nombre porque es vocabulario compartido con el servidor; acá se traducen al
   * único campo que la pantalla muestra.
   */
  const forcedFields = useMemo(() => {
    const set = new Set();
    for (const code of issues) {
      for (const f of FIELDS_FOR_ISSUE[code] || []) {
        set.add(NAME_PARTS.includes(f) ? NAME_FIELD : f);
      }
    }
    return set;
  }, [issues]);

  /**
   * ── QUÉ CAMPOS LLEVAN MARCA ──────────────────────────────────────────────────
   * La lista muestra SIEMPRE todos los campos (antes los seguros se colapsaban en chips y los
   * dudosos eran inputs; con tres estados había que explicarle a la persona cuál era cuál). Lo que
   * queda es una marca de acento, un punto y una palabra, en el campo que el modelo no pudo leer o
   * leyó con poca seguridad, o que arregla un problema. Apenas la persona lo toca, deja de estar en
   * duda y la marca se va.
   *
   * No hay problema de foco al escribir: ningún campo se monta ni se desmonta, sólo cambia la marca.
   */
  const marcaDe = (field) => {
    if (isManual) return "";
    if (touched.has(field)) return "";
    const nivel = levelOf(field);
    if (nivel === "low" && !valueOf(field)) return "No se leyó";
    if (nivel === "low" || nivel === "review" || forcedFields.has(field)) return "Revisá";
    return "";
  };

  /**
   * ── ALTA / MEDIA / BAJA, CON EL VEREDICTO QUE YA EXISTÍA ────────────────────
   * No es un threshold nuevo: es `identificationVerdict`, el mismo que usa el
   * servidor para decidir si un vino puede publicarse al catálogo público (ver
   * server/src/data/wineValidation.js — este archivo es su espejo cliente, y el
   * comentario de arriba de todo explica por qué hay dos copias). Reusarlo acá
   * es lo que evita inventar un criterio de confianza aparte para la pantalla.
   *
   *   trusted    → alta: nombre y bodega leídos con seguridad, sin problemas.
   *   unverified → media: hay datos, pero no lo bastante seguros para darlos
   *                por buenos solos (ej. confirmó porque la persona escribió,
   *                no porque el modelo lo leyó con confianza).
   *   doubtful   → baja: o hay un problema real (nombre vacío, nombre igual a
   *                la bodega sin confirmar) o el nombre se leyó con menos de 50
   *                de confianza — no hay vino que ofrecer todavía.
   */
  const verdict = useMemo(
    () =>
      identificationVerdict({
        values: { ...values, type: derivedType },
        confidence: conf,
        editedFields: [...touched],
        source: isManual ? "manual" : "scan",
        issues,
      }),
    [values, derivedType, conf, touched, isManual, issues]
  );

  /**
   * "No se pudo identificar" es la última salida: sólo cuando no hay ni nombre, ni
   * bodega, ni uva, o cuando lo único que hay es texto dudoso del OCR de respaldo.
   * Con cualquier dato de la lectura principal se muestra la ficha y se puede guardar.
   */
  // "Sin datos" se decide sobre lo que LLEGÓ, no sobre lo que se está editando: borrar la bodega
  // para reescribirla no puede desmontar el formulario que se tiene en la mano.
  const leido = reading?.values || {};
  const sinDatos = !["properName", "line", "winery", "varietal"].some((k) => String(leido[k] || "").trim());
  const sinIdentificar =
    !isManual &&
    (sinDatos || (reading?.source === "ocr" && verdict === "doubtful" && issues.length === 0));

  /**
   * Un candado que cierra en el mismo tick, no en el próximo render.
   *
   * `saving` llega por prop y lo enciende el padre DESPUÉS de este handler, así
   * que entre el primer toque y el re-render que deshabilita el botón hay una
   * ventana real. En un teléfono un doble toque llega a los 100-300ms y no
   * entraría, pero un "ghost click" del navegador o un dispositivo trabado sí:
   * el alta se manda dos veces y —como el server reconoce el vino— la segunda
   * no crea una fila duplicada pero SUMA una botella que nadie compró.
   *
   * Un ref se actualiza al instante y no depende de que React haya pintado.
   */
  const enviando = useRef(false);

  const submit = (e) => {
    e.preventDefault();
    if (saving || enviando.current) return;
    enviando.current = true;
    // Se libera al toque siguiente: si el guardado falla, el usuario tiene que
    // poder reintentar sin salir y volver a entrar a la revisión.
    setTimeout(() => {
      enviando.current = false;
    }, 1500);
    onConfirm?.({
      ...values,
      type: derivedType,
      name: nombreAGuardar,
      quantity: botellas,
      // La evidencia con la que el servidor decide si esto puede publicarse.
      identSource: isManual ? "manual" : reading?.source === "ocr" ? "ocr" : "scan",
      identConfidence: conf,
      identEditedFields: [...touched],
    });
  };

  const verificado = !isManual && verification?.status === "confirmado" && issues.length === 0;

  return (
    <form className="scan-review" onSubmit={submit}>
      <header className="scan-review__hero">
        {/* Sin foto (carga a mano) no se reserva el marco: un recuadro vacío no dice nada. */}
        {photo && <img className="scan-review__photo" src={photo} alt="Foto de la etiqueta que escaneaste" />}
        <h2 className="scan-review__title">{title || (isManual ? "Nuevo vino" : "Vino sin nombre")}</h2>
        {/* Con el nombre igual a la bodega, decirlo dos veces no suma. */}
        {values.winery && values.winery.trim() !== title && <p className="scan-review__winery">{values.winery}</p>}
        {verificado && (
          <p
            className="scan-review__badge"
            title={VERIFICACION_COPY[verification.source] || "Encontramos este vino en el catálogo"}
          >
            <Icon name="check" size={13} /> Verificado
          </p>
        )}
      </header>

      {sinIdentificar && !revelarDatos ? (
        <div className="scan-review__unidentified" role="status">
          <Icon name="alert-triangle" size={20} className="scan-review__unidentified-icon" />
          <p className="scan-review__unidentified-title">No se pudo identificar el vino</p>
          <div className="scan-review__unidentified-actions">
            {onRescan && (
              <button type="button" className="scan-review__btn-primary" onClick={onRescan}>
                <Icon name="camera" size={16} /> Intentar nuevamente
              </button>
            )}
            {onManual && (
              <button type="button" className="scan-review__btn-secondary" onClick={onManual}>
                <Icon name="pencil" size={16} /> Cargar a mano
              </button>
            )}
          </div>
          <button type="button" className="scan-review__link" onClick={() => setRevelarDatos(true)}>
            Completar los datos a mano
          </button>
        </div>
      ) : (
        <>
          {/* "¿Es este vino?": la app encontró un candidato que encaja pero no lo bastante como para
              darlo por hecho. Un toque completa bodega, uva, región y tipo. */}
          {!isManual && verification?.candidate && sugerencia === "pendiente" && (
            <div className="scan-review__suggestion" role="status">
              <p className="scan-review__suggestion-q">¿Es este vino?</p>
              <p className="scan-review__suggestion-name">{verification.candidate.name}</p>
              <p className="scan-review__suggestion-meta">
                {[
                  verification.candidate.winery,
                  verification.candidate.varietal,
                  verification.candidate.region,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="scan-review__suggestion-actions">
                <button
                  type="button"
                  className="scan-review__btn-primary"
                  onClick={() => aplicarCandidato(verification.candidate)}
                  disabled={saving}
                >
                  <Icon name="check" size={16} /> Sí, es ese
                </button>
                <button
                  type="button"
                  className="scan-review__btn-secondary"
                  onClick={() => setSugerencia("descartada")}
                  disabled={saving}
                >
                  No, es otro
                </button>
              </div>
              {verification.alternative?.name && (
                <button
                  type="button"
                  className="scan-review__link"
                  onClick={() => aplicarCandidato(verification.alternative)}
                  disabled={saving}
                >
                  ¿O es {verification.alternative.name}?
                </button>
              )}
            </div>
          )}

          {issues.length > 0 && (
            <div className="scan-review__issues" role="status">
              <ul>
                {issues.map((code) => (
                  <li key={code}>{ISSUE_COPY[code] || "Hay un dato que no cierra."}</li>
                ))}
              </ul>
            </div>
          )}

          {/* ── LA LISTA: una fila por dato, label chico arriba y el valor abajo ──────────────── */}
          <div className="scan-review__list">
            {DISPLAY_FIELDS.map((field) => {
              const dl = DATALISTS[field];
              const marca = marcaDe(field);
              return (
                <label key={field} className={`scan-review__row ${marca ? "is-marcada" : ""}`}>
                  <span className="scan-review__rowlabel">
                    {FIELD_CONCEPTS[field] ? (
                      <ConceptTerm id={FIELD_CONCEPTS[field]} ctx={{ wine: values }}>
                        {FIELD_LABELS[field]}
                      </ConceptTerm>
                    ) : (
                      FIELD_LABELS[field]
                    )}
                    {marca && <span className="scan-review__marca">{marca}</span>}
                  </span>
                  <input
                    type={field === "vintage" ? "number" : "text"}
                    inputMode={field === "vintage" ? "numeric" : undefined}
                    min={field === "vintage" ? 1800 : undefined}
                    max={field === "vintage" ? new Date().getFullYear() + 1 : undefined}
                    value={valueOf(field)}
                    onChange={(e) => setField(field, e.target.value)}
                    placeholder={field === NAME_FIELD ? "Lo que dice grande" : FIELD_LABELS[field]}
                    maxLength={field === "vintage" ? undefined : 120}
                    list={dl?.id}
                    disabled={saving}
                    autoComplete="off"
                  />
                  {dl && (
                    <datalist id={dl.id}>
                      {dl.options.map((o) => (
                        <option key={o} value={o} />
                      ))}
                    </datalist>
                  )}
                </label>
              );
            })}

            <label className="scan-review__row">
              <span className="scan-review__rowlabel">
                Tipo
                <Icon name="chevron-down" size={14} className="scan-review__desplegar" />
              </span>
              <select
                value={derivedType}
                onChange={(e) => setValues((v) => ({ ...v, type: e.target.value }))}
                disabled={saving}
              >
                {Object.entries(WINE_TYPE_LABELS).map(([clave, nombre]) => (
                  <option key={clave} value={clave}>
                    {nombre}
                  </option>
                ))}
              </select>
            </label>

          </div>

          {/* Dos respuestas a la vista; la cantidad sólo existe si la tenés. */}
          <Segmented
            className="scan-review__destino"
            ariaLabel="¿La tenés o ya la tomaste?"
            value={destino}
            onChange={setDestino}
            options={[
              { id: "tengo", label: "Lo tengo" },
              { id: "tomado", label: "Ya lo tomé" },
            ]}
          />

          {destino === "tengo" && (
            <div className="scan-review__list">
              <div className="scan-review__row scan-review__row--cantidad">
                <span className="scan-review__rowlabel">Botellas</span>
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
                    <span className="scan-qty__n" aria-live="polite">
                      {cantidad}
                    </span>
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
            </div>
          )}

          {/* Las otras dos salidas, en voz baja: lo que casi todos vienen a hacer es Guardar. */}
          <div className="scan-review__otras">
            <button
              type="button"
              className="scan-review__link"
              onClick={() => onConsult?.({ ...values, type: derivedType, name: nombreAGuardar })}
              disabled={saving || !nombreAGuardar || !onConsult}
              title="Ver la información de este vino sin guardarlo"
            >
              Solo consultar
            </button>
            <button
              type="button"
              className="scan-review__link"
              onClick={() => onWish?.({ ...values, type: derivedType, name: nombreAGuardar })}
              disabled={saving || !nombreAGuardar}
            >
              Quiero probarlo
            </button>
          </div>

          {/* La barra de abajo: un solo botón primario, fijo. El secundario es repetir la foto (o salir,
              en la carga a mano). */}
          <div className="scan-review__bar">
            <button
              type="button"
              className="scan-review__secondary"
              onClick={onRescan || onCancel}
              disabled={saving}
            >
              {onRescan ? "Escanear otra" : "Cancelar"}
            </button>
            <button
              type="submit"
              className="scan-review__save"
              disabled={saving}
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </>
      )}
    </form>
  );
}
