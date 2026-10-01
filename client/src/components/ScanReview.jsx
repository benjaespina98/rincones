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

/**
 * Quién respalda el nombre de este vino, dicho en una línea.
 *
 * No es un adorno: hasta ahora la pantalla mostraba con la misma cara un nombre
 * que figura en un catálogo y uno que el modelo creyó leer en una foto con
 * brillo. Son dos cosas distintas y la persona que está por guardar es la única
 * que puede desempatar, así que hay que decírselo.
 */
const VERIFICACION_COPY = {
  "catalogo-ar": "Verificado: figura así en el catálogo argentino",
  "comunidad-verificada": "Verificado: otras personas lo tienen cargado igual",
  // Dicho con precisión: lo que confirma es que el vino existe y se llama así,
  // no que alguien lo haya visto. Prometer más de lo que una fuente da es
  // exactamente el problema que esta línea vino a resolver.
  gemini: "Chequeado aparte: este vino existe y se llama así",
};

/** Cómo se llama cada campo cuando hay que nombrarlo en una frase. */
const CAMPO_EN_FRASE = { varietal: "la uva", region: "la región", type: "el tipo" };

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
   * ── UN SOLO NÚMERO, NO UNA PREGUNTA Y DESPUÉS UN NÚMERO ───────────────────
   *
   * Antes esto eran dos pasos: primero elegir entre "La tengo yo" y "Lo tomé
   * afuera" —un binario que copiaba, con otras palabras, la misma pregunta que
   * el número ya iba a contestar—, y sólo si elegías la primera aparecía el
   * contador. Dos controles para un solo dato confundían más de lo que
   * ordenaban: había que entender la distinción ANTES de poder decir cuántas
   * botellas tenías, cuando lo único que de verdad hace falta saber es eso.
   *
   * Ahora es un único contador que arranca en CERO. El cero no es un caso
   * especial que haya que elegir aparte: es la respuesta más corta a "cuántas
   * te quedan" cuando la respuesta es "ninguna, lo tomé". El texto y el botón
   * de guardar cambian solos según el número, así que la consecuencia —entra a
   * la bodega, o queda sólo como probado— se sigue viendo siempre, pero sin
   * pedir una decisión aparte para llegar a ella.
   */
  // Cuántas botellas entran a la cava. Arranca en UNA: lo que casi todo el mundo hace al
  // escanear una etiqueta es guardar esa botella en su bodega, y eso es lo que tiene que
  // pasar de un toque. Arrancaba en cero ("lo tomé"), y el botón principal decía
  // "Anotarlo como ya tomado": lo contrario de lo que se viene a hacer.
  //
  // Bajarlo a cero sigue significando "lo probé y no es mío" (un restaurante, la casa de
  // alguien): el botón pasa a "Anotarlo como ya tomado" y no suma stock. Obligar a escanear
  // doce veces la misma etiqueta porque compraste una caja tampoco tiene sentido, de ahí
  // los atajos.
  const [cantidad, setCantidad] = useState(1);
  // Lo que de verdad se guarda es el número tal cual: en cero, sin botellas.
  const botellas = cantidad;
  // Si la lectura salió tan floja que no hay campo puntual que señalar, se
  // esconde el formulario detrás de "Completar los datos a mano" (ver
  // `sinIdentificar` más abajo) en vez de mostrarlo de entrada.
  const [revelarDatos, setRevelarDatos] = useState(false);

  // Estable entre renders: es dependencia de los useMemo del veredicto, y un
  // objeto nuevo en cada render los haría recalcular siempre.
  const conf = useMemo(() => reading?.confidence || {}, [reading]);
  const isManual = reading?.source === "manual";

  /**
   * Los campos que la fuente contradice, nombrados para poder decirlos.
   *
   * Se dejan de mostrar en cuanto la persona toca el campo: ya lo miró, que es
   * todo lo que este aviso pedía.
   */
  const desacuerdos = useMemo(
    () =>
      (verification?.mismatches || [])
        .filter((c) => CAMPO_EN_FRASE[c] && !touched.has(c))
        .map((c) => CAMPO_EN_FRASE[c]),
    [verification, touched]
  );

  // Con la bodega: una gama genérica ("Reserva") se completa a "Norton
  // Reserva", que es el nombre con el que se va a guardar. El título de la
  // revisión tiene que mostrar exactamente eso — es la última pantalla donde
  // se puede corregir antes de que el vino entre a la bodega.
  const title = useMemo(
    () =>
      composeDisplayName({
        name: values.properName,
        line: values.line,
        winery: values.winery,
      }),
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

  /**
   * ── QUÉ CAMPOS SE MUESTRAN COMO INPUT, Y POR QUÉ SE DECIDE UNA SOLA VEZ ────
   * Los dudosos, los vacíos y los que arreglan un problema. El resto va en
   * chips.
   *
   * Esto se calculaba en cada render con `levelOf`, y ahí estaba el bug que se
   * reportó como "se desmorona y pierde el foco al escribir": `setField` marca
   * el campo como TOCADO en cada tecla, y `levelOf` devuelve "trusted" apenas
   * está tocado. O sea que a la primera letra el campo salía de esta lista, el
   * input se desmontaba —con el cursor adentro— y reaparecía abajo como chip.
   * Escribías una letra y el campo desaparecía.
   *
   * Qué campos necesitan revisión es una propiedad de LO QUE LEYÓ EL ESCÁNER,
   * no de lo que la persona está tipeando. Así que se congela con el primer
   * render y no se vuelve a mirar. Sólo puede crecer: si el servidor reporta un
   * problema nuevo, `forcedFields` suma ese campo.
   */
  const [camposDeEntrada] = useState(
    () => new Set(EDITABLE_FIELDS.filter((f) => levelOf(f) !== "trusted"))
  );
  const needsReview = EDITABLE_FIELDS.filter(
    (f) => camposDeEntrada.has(f) || forcedFields.has(f)
  );
  /* Un campo que ya está arriba como input no baja además a los chips: sería el
     mismo dato dos veces en la misma pantalla. */
  const trusted = EDITABLE_FIELDS.filter(
    (f) => !needsReview.includes(f) && valueOf(f)
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
  /**
   * ── YA NO SE BLOQUEA EL GUARDADO POR CONFIANZA BAJA ─────────────────────
   * Antes "doubtful" apagaba el botón entero: un vino con un dato dudoso no
   * se podía guardar hasta corregirlo, así que una lectura floja terminaba en
   * un formulario que no cedía. La decisión de producto es la contraria:
   * priorizar que la botella entre a la bodega SIEMPRE que haya con qué
   * nombrarla, y dejar que lo que salió mal se corrija después, editando el
   * vino ya guardado — no antes de guardarlo. El único caso que sigue sin
   * salida es no tener nombre (ver `sinIdentificar` y la validación en
   * ScanWinePage), porque ahí no hay ninguna botella que agregar todavía.
   */
  const bloqueado = false;

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
      quantity: botellas,
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
      ? "Sin identificar"
      : verdict === "trusted"
        ? "Vino encontrado"
        : verdict === "unverified"
          ? "¿Este es tu vino?"
          : "Datos leídos de la etiqueta";

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
            No se pudo identificar el vino
          </p>
          {/* Acá iba "Preferimos avisarte antes que guardar datos que capaz no
              son ciertos": la app explicando su propia política. Los dos botones
              de abajo ya dicen qué se puede hacer. */}
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
      {/* ── EL NOMBRE, CONTRASTADO CONTRA ALGO QUE NO ES LA FOTO ───────────
          El modelo se puntúa a sí mismo: puede leer nítido y aun así equivocarse
          de nombre, porque en la foto no hay nada contra qué comparar. Esto es lo
          que el servidor encontró al cruzarlo con fuentes reales de vinos, y se
          dice ANTES de los campos porque cambia cómo hay que mirarlos.

          Los tres estados son distintos y ninguno se puede tapar con otro:
          confirmado (no hay nada que revisar), corregido (el nombre que ves NO es
          el que leímos de la etiqueta, y merece una mirada) y sin verificar
          (existe la chance de que este vino no se llame así). */}
      {/* ── "¿ES ESTE VINO?" ─────────────────────────────────────────────────
          El tramo del medio de la identificación. La app encontró un candidato
          que encaja pero no lo bastante como para darlo por hecho —dos líneas
          parecidas de la misma bodega, un nombre leído a medias—, así que no
          tocó ningún dato y pregunta.

          La pregunta es barata para quien tiene la botella en la mano (la mira y
          contesta) y evita el error que más molesta: que la app cambie sola el
          vino por otro. Aceptar es un toque y completa bodega, uva, región y
          tipo de una; si la segunda opción estaba cerca, también se ofrece. */}
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

      {/* Confirmado a mano. Se deja dicho —igual que el "se llama igual que la
          bodega"— para que no parezca que los campos se llenaron solos. */}
      {sugerencia === "aceptada" && (
        <p className="scan-review__confirmed" role="status">
          <Icon name="check" size={13} /> Listo, lo tomamos como {title || "ese vino"}.
        </p>
      )}

      {!isManual && verification?.status === "confirmado" && issues.length === 0 && (
        <p className="scan-review__verified" role="status">
          <Icon name="check" size={13} />{" "}
          {VERIFICACION_COPY[verification.source] || "Encontramos este vino en el catálogo"}
        </p>
      )}

      {!isManual && verification?.status === "corregido" && (
        <p className="scan-review__corrected" role="status">
          <Icon name="sparkles" size={13} />
          <span>
            Ajustamos el nombre al del catálogo: <strong>{verification.name}</strong>. Si tu
            etiqueta dice otra cosa, corregilo.
          </span>
        </p>
      )}

      {/* Lo que la fuente contradice. No se pisó ningún dato —la etiqueta la
          tenés vos, y las bodegas cambian cortes entre añadas—: los campos en
          discusión quedaron abiertos abajo, y esto dice cuáles y por qué, que es
          lo que evita el "revisá algo" sin decir qué. */}
      {!isManual && desacuerdos.length > 0 && (
        <p className="scan-review__unverified" role="status">
          <Icon name="alert-triangle" size={13} />
          <span>
            {desacuerdos.length === 1
              ? `Según esa fuente, ${desacuerdos[0]} de este vino es otra: mirá la etiqueta.`
              : `Según esa fuente, ${desacuerdos.slice(0, -1).join(", ")} y ${
                  desacuerdos[desacuerdos.length - 1]
                } de este vino son otras: mirá la etiqueta.`}
          </span>
        </p>
      )}

      {!isManual && verification?.status === "sin-verificar" && issues.length === 0 && (
        <p className="scan-review__unverified" role="status">
          <Icon name="alert-triangle" size={13} />
          <span>No encontramos este vino en ningún catálogo. Revisá el nombre antes de guardar.</span>
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
                ? "Con el nombre y la bodega alcanza."
                : "Revisá estos datos: no se leyeron con seguridad."}
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

      {/* ── CUÁNTAS BOTELLAS TENÉS AHORA ─────────────────────────────────────
          Un solo control, y de él sale todo lo demás: en cero, la botella no
          existe en tu casa y el vino queda anotado entre tus probados; a
          partir de una, entra a tu bodega con esa cantidad de stock. La frase
          de abajo dice la consecuencia con todas las letras porque son dos
          lugares distintos de la app: una suma botellas a tu cava (con su lote
          y su fecha), la otra no toca el stock y sólo deja escrito que lo
          tomaste — y ninguna respuesta obliga a mentirle a la otra (ver
          utils/cellarViews.js). Los atajos cubren los casos reales —media
          docena, una caja— sin obligar a tocar doce veces el más. */}
      <div className="scan-qty">
        <span className="scan-qty__label">¿Cuántas botellas tenés ahora?</span>
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
        <p className="scan-qty__consequence" aria-live="polite">
          {cantidad === 0
            ? "Sin botellas: queda en «Ya tomados», no suma stock."
            : "Entra a tu bodega, con stock."}
        </p>
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
                ? "Anotarlo como ya tomado"
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
            Corregí los datos marcados arriba.
          </p>
        )}
        {/* Las otras dos salidas, chicas y juntas: el botón de arriba es lo que casi todos
            vienen a hacer.

            "Solo consultar": estás en una vinoteca o en una cena y querés ver qué es este
            vino —descripción, precio, reseñas— sin guardar nada. Abre la ficha en modo
            lectura; de ahí se puede sumar a la bodega si después te decidís. No guarda ni
            toca el catálogo, así que no lo frena el veredicto: sólo necesita un nombre.

            "Quiero probarlo": guardarlo en la lista es privado, no toca el catálogo
            público, así que tampoco lo frena el veredicto. Lo único que necesita es un
            nombre. */}
        <div className="scan-review__otras">
          <button
            type="button"
            className="scan-review__wish"
            onClick={() => onConsult?.({ ...values, type: derivedType, name: title })}
            disabled={saving || !title || !onConsult}
            title="Ver la información de este vino sin guardarlo"
          >
            <Icon name="search" size={15} /> Solo consultar
          </button>
          <button
            type="button"
            className="scan-review__wish"
            onClick={() => onWish?.({ ...values, type: derivedType, name: title })}
            disabled={saving || !title}
          >
            <Icon name="heart" size={15} /> Quiero probarlo
          </button>
        </div>
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
