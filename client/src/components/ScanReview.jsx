import { useMemo, useRef, useState } from "react";
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

export default function ScanReview({
  photo,
  reading,
  matchedFrom,
  saving = false,
  onConfirm,
  onWish,
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
  const [showAll, setShowAll] = useState(false);
  /**
   * "Sí, este vino se llama igual que su bodega."
   *
   * Norton, El Enemigo, Achaval Ferrer, Durigutti, Chandon: el catálogo curado
   * tiene 25 filas donde el nombre y la bodega coinciden. Sin esta respuesta, un
   * vino así que todavía no esté en el catálogo quedaba en un callejón sin
   * salida —el aviso no se iba escribiera lo que escribiera, y el botón de
   * guardar seguía apagado—. Un toque, y sigue.
   */
  const [sameNameOk, setSameNameOk] = useState(false);
  // Cuántas botellas entran a la cava. Obligar a escanear doce veces la misma
  // etiqueta porque compraste una caja no tiene sentido.
  const [cantidad, setCantidad] = useState(1);
  // Si la lectura salió tan floja que no hay campo puntual que señalar, se
  // esconde el formulario detrás de "Completar los datos a mano" (ver
  // `sinIdentificar` más abajo) en vez de mostrarlo de entrada.
  const [revelarDatos, setRevelarDatos] = useState(false);

  // Estable entre renders: es dependencia de los useMemo del veredicto, y un
  // objeto nuevo en cada render los haría recalcular siempre.
  const conf = useMemo(() => reading?.confidence || {}, [reading]);
  const isManual = reading?.source === "manual";

  const title = useMemo(
    () => composeDisplayName({ name: values.properName, line: values.line }),
    [values]
  );

  /**
   * A cuál de los dos campos internos escribe el campo único de nombre.
   *
   * Al que trajo el dato, para no partir en dos la identidad de un vino que la
   * lectura ya había resuelto bien: si el modelo entendió que "Angélica Zapata"
   * es un nombre propio, editarlo lo sigue siendo. Cuando no hay nada, va a la
   * línea, que es el caso mayoritario ("Reserva", "Saint Felicien", "Pispi") y
   * el que `identityKey` prefiere para deduplicar.
   */
  const nameTarget = reading?.values?.properName ? "properName" : "line";

  const valueOf = (field) => (field === NAME_FIELD ? title : values[field]);

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
    setValues((v) => ({ ...v, [destino]: value }));
    setTouched((t) => new Set(t).add(destino));
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
    const propios = checkCoherence({ ...values, type: derivedType, sameNameConfirmed: sameNameOk });
    const delServidor = (reading?.serverIssues || []).filter(
      // Los del servidor valen mientras no se haya tocado el campo que arreglan.
      (code) => !(FIELDS_FOR_ISSUE[code] || []).some((f) => touched.has(f))
    );
    // Confirmado que se llama igual que la bodega, el aviso del servidor sobre
    // eso tampoco corre: la persona ya respondió esa pregunta.
    const vivos = sameNameOk
      ? [...propios, ...delServidor].filter((c) => c !== "nombre-es-bodega")
      : [...propios, ...delServidor];
    return [...new Set(vivos)];
  }, [values, derivedType, reading, touched, sameNameOk]);

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

  // Campos a mostrar como input: los dudosos, los vacíos y los que arreglan un
  // problema. El resto va en chips.
  const needsReview = EDITABLE_FIELDS.filter(
    (f) => levelOf(f) !== "trusted" || forcedFields.has(f)
  );
  const trusted = EDITABLE_FIELDS.filter(
    (f) => levelOf(f) === "trusted" && valueOf(f) && !forcedFields.has(f)
  );
  const visible = showAll ? EDITABLE_FIELDS : needsReview;

  // ¿Este vino se llama igual que su bodega? Es la pregunta que habilita la
  // confirmación, y se hace sola apenas los dos textos coinciden.
  const nombreIgualABodega =
    Boolean(title) && title.trim().toLowerCase() === String(values.winery || "").trim().toLowerCase();

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
        values: { ...values, type: derivedType, sameNameConfirmed: sameNameOk },
        confidence: conf,
        editedFields: [...touched],
        source: isManual ? "manual" : "scan",
        issues,
      }),
    [values, derivedType, sameNameOk, conf, touched, isManual, issues]
  );

  /**
   * Sin nombre, o nombre igual a la bodega sin confirmar: hay un campo
   * puntual que arreglar, y ya está a la vista (`forcedFields`). Ahí seguimos
   * mostrando el formulario normal — es un toque, no un formulario.
   *
   * Cuando la baja confianza NO viene de un problema puntual —el modelo
   * simplemente no pudo leer bien la etiqueta— no hay ningún campo que señalar:
   * mostrar el formulario igual sería invitar a completar a ciegas datos que
   * nadie leyó. Ahí el estado es otro: "no pudimos identificarlo", con salida a
   * reintentar o cargar a mano, y sólo si la persona insiste se abre el
   * formulario (`revelarDatos`).
   */
  const sinIdentificar = !isManual && verdict === "doubtful" && issues.length === 0;
  const bloqueado = verdict === "doubtful";

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
    if (saving || bloqueado || enviando.current) return;
    enviando.current = true;
    // Se libera al toque siguiente: si el guardado falla, el usuario tiene que
    // poder reintentar sin salir y volver a entrar a la revisión.
    setTimeout(() => {
      enviando.current = false;
    }, 1500);
    onConfirm?.({
      ...values,
      type: derivedType,
      name: title,
      quantity: cantidad,
      // La evidencia con la que el servidor decide si esto puede publicarse.
      identSource: isManual ? "manual" : reading?.source === "ocr" ? "ocr" : "scan",
      identConfidence: conf,
      identEditedFields: [...touched],
      identSameNameConfirmed: sameNameOk,
    });
  };

  // Un rótulo por nivel, arriba de todo — es lo primero que se lee y el que
  // fija la expectativa correcta antes de ver un solo dato.
  const kicker = isManual
    ? "Cargar a mano"
    : sinIdentificar
      ? "No pudimos identificarlo"
      : verdict === "trusted"
        ? "Vino encontrado"
        : verdict === "unverified"
          ? "¿Este es tu vino?"
          : "Esto leímos de la etiqueta";

  return (
    <form className="scan-review" onSubmit={submit}>
      <header className="scan-review__head">
        {photo && (
          <img className="scan-review__thumb" src={photo} alt="Foto de la etiqueta que escaneaste" />
        )}
        <div className="scan-review__headings">
          <p className="scan-review__kicker">{kicker}</p>
          <h2 className="scan-review__title">
            {title || (isManual ? "Nuevo vino" : "Vino sin nombre")}
          </h2>
          {values.winery && <p className="scan-review__winery">{values.winery}</p>}
        </div>
      </header>

      {/* ── BAJA CONFIANZA, SIN UN CAMPO PUNTUAL QUE SEÑALAR ────────────────────
          No hay bodega/nombre a medias para mostrar en chips: el modelo no
          pudo leer la etiqueta con seguridad y punto. Ofrecer el formulario acá
          sería invitar a completar a ciegas — mejor decirlo así de directo, con
          las dos salidas reales (repetir la foto o cargarlo a mano) y dejar la
          puerta de "igual quiero completarlo yo" abierta pero discreta. */}
      {sinIdentificar && !revelarDatos ? (
        <div className="scan-review__unidentified" role="status">
          <Icon name="alert-triangle" size={20} className="scan-review__unidentified-icon" />
          <p className="scan-review__unidentified-title">
            No pudimos identificar el vino con suficiente seguridad.
          </p>
          <p className="scan-review__unidentified-hint">
            Preferimos avisarte antes que guardar datos que capaz no son ciertos.
          </p>
          <div className="scan-review__unidentified-actions">
            {onRescan && (
              <button type="button" className="scan-review__btn-primary" onClick={onRescan}>
                <Icon name="camera" size={16} /> Intentar nuevamente
              </button>
            )}
            {onManual && (
              <button type="button" className="scan-review__btn-secondary" onClick={onManual}>
                <Icon name="pencil" size={16} /> Buscar manualmente
              </button>
            )}
          </div>
          <button
            type="button"
            className="scan-review__link"
            onClick={() => setRevelarDatos(true)}
          >
            Completar los datos a mano
          </button>
        </div>
      ) : (
        <>
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
          {/* La salida del callejón. Sin esto, un vino que se llama como su
              bodega —Norton, El Enemigo, Durigutti— no se podía guardar por más
              que la persona escribiera bien los dos campos: eran correctos y el
              aviso no se iba. Un toque y sigue. */}
          {issues.includes("nombre-es-bodega") && (
            <button
              type="button"
              className="scan-review__confirm-same"
              onClick={() => setSameNameOk(true)}
              disabled={saving}
            >
              <Icon name="check" size={14} /> Está bien, se llama igual que la bodega
            </button>
          )}
        </div>
      )}

      {/* Confirmado. Se deja dicho para que no parezca que el aviso desapareció
          solo, y se puede volver atrás si fue un toque sin querer. */}
      {sameNameOk && nombreIgualABodega && (
        <p className="scan-review__confirmed" role="status">
          <Icon name="check" size={13} /> Anotado: este vino se llama igual que su bodega.{" "}
          <button type="button" className="scan-review__link" onClick={() => setSameNameOk(false)}>
            Deshacer
          </button>
        </p>
      )}

      {trusted.length > 0 && !showAll && (
        <div className="scan-review__chips">
          {trusted.map((f) => (
            <span key={f} className="scan-review__chip">
              <em>{FIELD_LABELS[f]}</em> {valueOf(f)}
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
                  {!isManual && level === "low" && !valueOf(field) && <em> · no lo leímos</em>}
                  {!isManual && level === "review" && <em> · verificá</em>}
                </span>
                <input
                  type={field === "vintage" ? "number" : "text"}
                  inputMode={field === "vintage" ? "numeric" : undefined}
                  min={field === "vintage" ? 1900 : undefined}
                  max={field === "vintage" ? new Date().getFullYear() : undefined}
                  value={valueOf(field)}
                  onChange={(e) => setField(field, e.target.value)}
                  placeholder={
                    field === NAME_FIELD ? "Lo que dice grande en la etiqueta" : FIELD_LABELS[field]
                  }
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
          una caja— sin obligar a tocar doce veces el más.

          ── EL CERO ES UNA OPCIÓN, Y HACÍA FALTA ──────────────────────────────
          El mínimo era 1, así que un vino que tomaste afuera —en un restaurante,
          en casa de alguien— sólo se podía registrar declarando una botella que
          nunca tuviste. Y esa botella no era un número inocente: abría un LOTE
          con su fecha de compra, entraba a tus gastos y dejaba el vino contado
          como parte de tu cava. Para que el historial dijera la verdad había que
          mentirle al inventario.

          El modelo ya sabía distinguirlos: "probado" y "stock" son dos ejes
          independientes, y las cuatro combinaciones son normales (ver
          utils/cellarViews.js). Lo único que faltaba era dejar de forzar el
          mínimo acá. Con 0 botellas el vino entra a tu colección, queda probado,
          aparece en "Probados" y en tus estadísticas de lo que tomaste — y no
          aparece en "En stock" ni inventa una compra. */}
      <div className="scan-qty">
        <span className="scan-qty__label">¿Cuántas botellas?</span>
        <div className="scan-qty__row">
          <div className="scan-qty__stepper">
            <button
              type="button"
              onClick={() => setCantidad((n) => Math.max(0, n - 1))}
              disabled={saving || cantidad <= 0}
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

        {/* El atajo, para no tener que descubrir que el stepper baja hasta cero.
            Dice el caso —"lo tomé, no me lo llevé"— y no el número, porque nadie
            piensa "cero botellas": piensa "éste lo tomé afuera". */}
        <button
          type="button"
          className={`scan-qty__afuera ${cantidad === 0 ? "is-active" : ""}`}
          onClick={() => setCantidad((n) => (n === 0 ? 1 : 0))}
          disabled={saving}
          aria-pressed={cantidad === 0}
        >
          <Icon name={cantidad === 0 ? "check" : "circle"} size={14} />
          Lo tomé afuera, no me quedó ninguna
        </button>
      </div>

      <div className="scan-review__actions">
        <button
          type="submit"
          className="scan-review__save"
          disabled={saving || bloqueado}
          title={bloqueado ? "Completá o corregí lo que marcamos arriba" : undefined}
        >
          {saving ? (
            "Guardando…"
          ) : (
            <>
              <Icon name="check" size={17} />{" "}
              {cantidad === 0
                ? "Guardarlo como probado"
                : cantidad === 1
                  ? "Agregar a mi bodega"
                  : `Agregar ${cantidad} botellas`}
            </>
          )}
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
        </>
      )}
    </form>
  );
}
