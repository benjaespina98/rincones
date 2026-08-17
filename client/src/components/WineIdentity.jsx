import Icon from "./Icon";
import ConceptTerm from "./ConceptTerm";
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
 * bodega: ahí el hueco es información y se ofrece el atajo para completarla.
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
  const guarda = getCellarStatus(wine);
  const tengo = tenencia(wine);

  // "Bodegas Salentein" y la línea "Portillo": cuando el nombre del vino ya ES el
  // de la bodega, repetirlo abajo no agrega nada.
  const bodega = String(wine.winery || "").trim();
  const mismaCosa = bodega && bodega.toLowerCase() === String(wine.name || "").trim().toLowerCase();

  const filas = [
    {
      rotulo: "Bodega",
      valor: bodega && !mismaCosa ? bodega : "",
      // Único campo que se muestra vacío: sin la bodega la ficha está incompleta y
      // conviene que se vea, con la salida al lado.
      obligatorio: true,
    },
    // La región no está acá: la dice el encabezado, debajo del nombre. Repetirla
    // sería el mismo dato dos veces con dos pesos distintos.
    // La uva abre "las uvas argentinas": qué esperar de un Malbec, un Cabernet
    // o un Torrontés, dicho en una línea cada uno.
    { rotulo: "Uva", valor: wine.varietal, concepto: "uvas" },
    { rotulo: "Cosecha", valor: wine.vintage ? String(wine.vintage) : "" },
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
