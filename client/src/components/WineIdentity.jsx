import Icon from "./Icon";
import { WINE_TYPE_LABELS } from "../data/wineReference";
import { getCellarStatus, cellarSourceNote } from "../utils/cellarStatus";
import "./WineIdentity.css";

/**
 * La identidad del vino: quién lo hace, de dónde es, de qué uva y de qué año.
 *
 * ── QUÉ PROBLEMA RESUELVE ───────────────────────────────────────────────────
 * Esto era una tira de cuatro pastillas de colores: "Tinto · 2025 · Malbec ·
 * Esperá 2 años". Cuatro problemas en una línea:
 *
 * 1. LA BODEGA NO ESTABA. Es el dato más importante de una etiqueta después del
 *    nombre —"Portillo" no dice nada, "Portillo, de Bodegas Salentein" ubica el
 *    vino entero— y estaba sólo como texto chico encima de la foto, compitiendo
 *    con la imagen. Ahora tiene su rótulo y su lugar.
 *
 * 2. TODO GRITABA IGUAL. Cuatro pastillas con borde y color propio, del mismo
 *    tamaño, sin jerarquía: el ojo no sabe por dónde empezar y el conjunto se lee
 *    como ruido. Un dato con rótulo se lee más rápido que un dato con color.
 *
 * 3. "ESPERÁ 2 AÑOS" no se entiende. Ver utils/cellarStatus.js: ahora dice el año.
 *
 * 4. LA GUARDA NO ES DEL MISMO ORDEN QUE LA UVA. La uva es un hecho de la
 *    etiqueta; la guarda es una recomendación estimada que puede estar equivocada.
 *    Mezclarlas en la misma tira las hacía parecer igual de ciertas. Van separadas
 *    y la estimación dice que es una estimación.
 *
 * Los datos que no están no ocupan lugar, salvo la bodega: ahí el hueco es
 * información —te falta cargarla— y se ofrece el atajo para hacerlo.
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

      {/* La guarda va aparte: es una recomendación, no un dato de la etiqueta. */}
      {guarda.label && (
        <div className={`wine-id__cellar wine-id__cellar--${guarda.status}`}>
          <span className="wine-id__cellar-head">
            <span className="wine-id__dot" aria-hidden="true" />
            <strong>{guarda.label}</strong>
          </span>
          <span className="wine-id__cellar-detail">{guarda.detail}</span>
          <span className="wine-id__cellar-source">
            <Icon name="info" size={11} /> {cellarSourceNote(guarda)}
          </span>
        </div>
      )}
    </section>
  );
}
