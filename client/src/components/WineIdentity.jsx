import Icon from "./Icon";
import ConceptTerm from "./ConceptTerm";
import { grapeConceptId } from "../data/wineConcepts";
import { WINE_TYPE_LABELS } from "../data/wineReference";
import { getCellarStatus, cellarSourceNote } from "../utils/cellarStatus";
import { enCavaDesde, tiempoEnCava, nuncaEstuvoEnTuCava } from "../utils/cellarTime";
import "./WineIdentity.css";

/**
 * La identidad del vino: quién lo hace, de dónde es, de qué uva y de qué año.
 *
 * Era una tira de cuatro pastillas de colores —"Tinto · 2025 · Malbec · Esperá 2
 * años"— donde todo gritaba igual, faltaba la bodega (el dato que más ubica un
 * vino) y la guarda estimada parecía tan cierta como la uva de la etiqueta.
 *
 * Ahora: rótulo → valor, la bodega primero, y la guarda aparte porque es una
 * recomendación y no un hecho. Los datos que no están no ocupan lugar, salvo la
 * bodega y la cosecha: ahí el hueco es información —son los dos que hacen que
 * la ficha entera se lea distinto— y se ofrece el atajo para completarlos.
 */

const SIN_DATO = "—";

const FECHA_LARGA = { day: "2-digit", month: "short", year: "numeric" };

/**
 * Desde cuándo lo tenés — o desde cuándo lo tuviste, o si nunca fue tuyo.
 *
 * "Mejor a partir de 2028" sin esto es media frase: para saber si vale la pena
 * esperarlo hay que saber hace cuánto que está esperando. Manda la fecha de
 * compra si la cargaste; si no, la del lote más viejo que todavía tiene
 * botellas (ver `enCavaDesde`), que es cuando entró a la cava lo que te queda.
 *
 * ── LOS TRES CASOS SON TRES FRASES ─────────────────────────────────────────
 * Había una sola —"En tu bodega desde"— y se decía siempre, incluso sobre un
 * vino que cargaste como "lo tomé afuera". Ese vino nunca estuvo en tu bodega:
 * la fecha que mostraba era la del día que lo anotaste, presentada como si
 * fuera el día que lo trajiste a casa. Y un vino que se te terminó tampoco
 * "está" en tu bodega desde ninguna fecha: estuvo.
 */
function tenencia(wine) {
  const comprado = wine.purchase?.purchasedAt;

  // Nunca entró a tu cava. La fecha que tenemos es la del día que lo anotaste,
  // no la de la copa: se dice así, en vez de disfrazarla de "lo tomaste el".
  if (nuncaEstuvoEnTuCava(wine)) {
    const cuando = wine.lastConsumedAt || wine.createdAt;
    const fecha = cuando ? new Date(cuando) : null;
    if (!fecha || Number.isNaN(fecha.getTime())) return null;
    return {
      rotulo: "Lo tomaste afuera. Anotado el",
      fecha: fecha.toLocaleDateString("es-AR", FECHA_LARGA),
      hace: "",
    };
  }

  const desde = comprado || enCavaDesde(wine);
  if (!desde) return null;

  const fecha = new Date(desde);
  if (Number.isNaN(fecha.getTime())) return null;

  const hace = tiempoEnCava(desde, { corto: true });
  const quedan = Number(wine.quantity) > 0;
  return {
    // Tres frases para tres hechos distintos: una compra con fecha, un vino que
    // tenés desde una fecha, y uno que tuviste y ya no.
    rotulo: comprado ? "Comprado el" : quedan ? "En tu bodega desde" : "Lo tuviste desde",
    fecha: fecha.toLocaleDateString("es-AR", FECHA_LARGA),
    // Vacío cuando llegó esta semana: "hace 3 días" al lado de la fecha no
    // agrega nada que la fecha no diga.
    hace: quedan ? hace : "",
  };
}

export default function WineIdentity({ wine, onEdit }) {
  if (!wine) return null;

  const tipo = WINE_TYPE_LABELS[wine.type] || WINE_TYPE_LABELS.unknown;

  /**
   * ── CUÁNDO SE DICE CUÁNDO TOMARLO ──────────────────────────────────────────
   * Sólo si tenés botellas. "Mejor a partir de 2028" es una instrucción sobre
   * una botella que está esperando en algún lado: sin botella no le habla a
   * nadie, y en tres de los cuatro lugares donde esta ficha se dibuja no había
   * ninguna.
   *
   * Las cuatro situaciones, con la misma condición resolviéndolas:
   *
   *   en stock            → se dice. Es la única donde hay algo que decidir.
   *   en Probados, sin stock → no. La decisión ya la tomaste; "pasó su mejor
   *                         momento" sobre un vino que disfrutaste anoche lee
   *                         como que la app no se enteró.
   *   buscando / del catálogo → no. Un resultado de búsqueda no tiene `quantity`,
   *                         así que la misma condición lo cubre sin preguntar por
   *                         la ruta ni por quién nos montó.
   *   se te terminó       → no. Ya no hay nada que guardar.
   *
   * Se mira el STOCK y no `tasted` a propósito: son dos hechos independientes
   * (ver utils/cellarViews.js). Un vino que ya tomaste y del que te quedan tres
   * botellas sigue necesitando saber hasta cuándo aguantan.
   */
  const enStock = Number(wine.quantity) > 0;
  const guarda = enStock ? getCellarStatus(wine) : { status: "unknown", label: "" };
  const tengo = tenencia(wine);

  // Antes se ocultaba la bodega cuando coincidía con el nombre del vino (el
  // caso Norton, El Enemigo, Durigutti): la idea era no repetir el mismo dato
  // dos veces. Pero eso hacía que completar la bodega a mano, en un vino cuyo
  // nombre YA es el de su bodega, no se viera reflejado en ningún lado — la
  // persona editaba, guardaba, y la ficha seguía mostrando "—" como si nada
  // hubiera pasado. Confirmar un dato dos veces vale más que un campo que
  // parece no haberse guardado.
  const bodega = String(wine.winery || "").trim();

  const filas = [
    {
      rotulo: "Bodega",
      valor: bodega,
      // Único campo que se muestra vacío: sin la bodega la ficha está incompleta y
      // conviene que se vea, con la salida al lado.
      obligatorio: true,
    },
    // La región no está acá: la dice el encabezado, debajo del nombre. Repetirla
    // sería el mismo dato dos veces con dos pesos distintos.
    // La uva abre la tarjeta de ESA uva: qué esperar de un Cabernet Franc, no un
    // repaso de las cinco uvas argentinas de las que cuatro no tenés en la mano.
    { rotulo: "Uva", valor: wine.varietal, concepto: grapeConceptId(wine.varietal) },
    {
      rotulo: "Cosecha",
      valor: wine.vintage ? String(wine.vintage) : "",
      // El segundo campo que se muestra vacío, y por el mismo motivo que la
      // bodega: sin el año no se sabe si el vino está para tomar o para esperar,
      // no se puede leer la guarda y la ficha queda hablando de un estilo en
      // abstracto. Ocultar la fila hacía que el dato faltante fuera invisible —
      // no se veía que faltaba, así que nadie lo completaba.
      obligatorio: true,
      concepto: "anada",
    },
    { rotulo: "Tipo", valor: tipo },
  ].filter((f) => f.valor || f.obligatorio);

  return (
    <section className="wine-id" aria-label="Datos del vino">
      <dl className="wine-id__grid">
        {filas.map((f) => (
          <div key={f.rotulo} className="wine-id__row">
            <dt>{f.rotulo}</dt>
            <dd className={f.valor ? "" : "is-empty"}>
              {f.valor && f.concepto ? (
                <ConceptTerm id={f.concepto} ctx={{ wine }}>{f.valor}</ConceptTerm>
              ) : (
                f.valor
              )}
              {!f.valor && (
                <>
                  {SIN_DATO}
                  {onEdit && (
                    <button type="button" className="wine-id__add" onClick={onEdit}>
                      Completar
                    </button>
                  )}
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {/* La guarda va aparte: es una recomendación, no un dato de la etiqueta.
          Una línea: veredicto y ventana. De dónde sale la ventana está en el
          title —importa una sola vez, no cada vez que se abre la ficha—. */}
      {guarda.label && (
        <div
          className={`wine-id__cellar wine-id__cellar--${guarda.status}`}
          title={cellarSourceNote(guarda)}
        >
          <span className="wine-id__dot" aria-hidden="true" />
          {/* El veredicto abre "Guarda": por qué un vino mejora, cuándo deja de
              hacerlo, y en qué punto de esa curva está el tuyo. */}
          <strong>
            <ConceptTerm id="guarda" ctx={{ wine, guarda }}>{guarda.label}</ConceptTerm>
          </strong>
          <span className="wine-id__cellar-detail">{guarda.detail}</span>
        </div>
      )}

      {tengo && (
        <p className="wine-id__since">
          <Icon name="calendar" size={13} />
          <span>
            {tengo.rotulo} <strong>{tengo.fecha}</strong>
          </span>
          {tengo.hace && <span className="wine-id__since-ago">hace {tengo.hace}</span>}
        </p>
      )}
    </section>
  );
}
