import { WINE_TYPE_LABELS } from "../data/wineReference";
import { getCellarStatus, cellarSourceNote } from "../utils/cellarStatus";
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

export default function WineIdentity({ wine, onEdit }) {
  if (!wine) return null;

  const tipo = WINE_TYPE_LABELS[wine.type] || WINE_TYPE_LABELS.unknown;
  const guarda = getCellarStatus(wine);

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
    { rotulo: "Uva", valor: wine.varietal },
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
              {f.valor || (
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
          <strong>{guarda.label}</strong>
          <span className="wine-id__cellar-detail">{guarda.detail}</span>
        </div>
      )}
    </section>
  );
}
