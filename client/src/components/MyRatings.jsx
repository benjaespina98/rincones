import { useCallback, useEffect, useState } from "react";
import Icon from "./Icon";
import StarRating from "./StarRating";
import LoadingSkeleton from "./LoadingSkeleton";
import ErrorState from "./ErrorState";
import { getMyReviews } from "../services/reviewApi";
import "../styles/components/MyRatings.css";

/**
 * Tus valoraciones, en tu perfil.
 *
 * Puntuar era una acción sin memoria: la estrella quedaba en la ficha de esa
 * botella y en ningún lado tuyo. Para acordarte de cuánto le pusiste a algo
 * había que encontrar primero el vino —justo el dato que uno no recuerda— y el
 * promedio del perfil decía "4,2" sin poder mostrar de dónde salía.
 *
 * A diferencia del diario, esto es PÚBLICO y lo dice: son las mismas reseñas
 * que ve cualquiera que busque ese vino.
 */

const VISIBLES = 4;

export default function MyRatings() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [verTodas, setVerTodas] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setFailed(false);
      setReviews(await getMyReviews());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Sin valoraciones no se ocupa lugar: el perfil de alguien que todavía no
  // puntuó nada no necesita una tarjeta explicando lo que le falta.
  if (!loading && !failed && reviews.length === 0) return null;

  const visibles = verTodas ? reviews : reviews.slice(0, VISIBLES);

  return (
    <section className="myrat" aria-label="Tus valoraciones">
      <div className="myrat__head">
        <h3><Icon name="star" size={15} /> Tus valoraciones</h3>
        {/* El par del "Sólo vos" del diario: las dos secciones viven en el mismo
            perfil y hacen falta las dos etiquetas para que se lean como opuestas
            y no como una advertencia suelta. */}
        <span className="myrat__public" title="Cualquiera las ve al buscar ese vino">
          <Icon name="eye" size={12} /> Públicas
        </span>
      </div>

      {loading && <LoadingSkeleton type="inline" count={2} />}

      {failed && !loading && (
        <ErrorState title="No se pudieron cargar tus valoraciones" onRetry={load} compact />
      )}

      {!loading && !failed && (
        <>
          <ul className="myrat__list">
            {visibles.map((r) => (
              <li key={r._id} className="myrat-item">
                <div className="myrat-item__top">
                  <span className="myrat-item__wine">
                    <strong>{r.name}</strong>
                    {/* Bodega y cosecha en el mismo renglón: sin la añada, dos
                        valoraciones tuyas del mismo vino en años distintos se
                        ven idénticas y no se sabe cuál es cuál. */}
                    {(r.winery || r.vintage) && (
                      <em>
                        {r.winery}
                        {r.winery && r.vintage ? " · " : ""}
                        {r.vintage ? `cosecha ${r.vintage}` : ""}
                      </em>
                    )}
                  </span>
                  <StarRating value={r.rating} size="sm" />
                </div>
                {r.text && <p className="myrat-item__text">{r.text}</p>}
              </li>
            ))}
          </ul>

          {reviews.length > VISIBLES && (
            <button
              type="button"
              className="myrat__more"
              onClick={() => setVerTodas((v) => !v)}
              aria-expanded={verTodas}
            >
              {verTodas ? "Ver menos" : `Ver las ${reviews.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
