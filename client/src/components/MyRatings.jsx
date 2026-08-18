import { useCallback, useEffect, useState } from "react";
import StarRating from "./StarRating";
import LoadingSkeleton from "./LoadingSkeleton";
import ErrorState from "./ErrorState";
import EmptyState from "./EmptyState";
import { getMyReviews } from "../services/reviewApi";
import "../styles/components/MyRatings.css";

/**
 * La lista de lo que puntuaste.
 *
 * ── POR QUÉ YA NO VIVE ADENTRO DEL PERFIL ───────────────────────────────────
 * Estaba abierta ahí, con cuatro valoraciones a la vista y un "ver las 23". El
 * perfil ya trae la cabecera, la lista de cuenta, el nivel, cuatro tarjetas de
 * estadísticas, el gasto y el diario: sumarle una lista que crece sin techo lo
 * volvía una pantalla de scroll infinito donde nada se encuentra.
 *
 * Es lo mismo que hacen las apps que tienen esto resuelto: en el perfil va un
 * renglón que dice cuántas son, y la lista tiene su propia pantalla — donde
 * podés quedarte a leerla sin tener seis secciones más alrededor.
 *
 * A diferencia del diario, esto es PÚBLICO: son las mismas reseñas que ve
 * cualquiera que busque ese vino.
 */
export default function MyRatings() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

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

  if (loading) return <LoadingSkeleton type="inline" count={4} />;

  if (failed) {
    return <ErrorState title="No se pudieron cargar tus valoraciones" onRetry={load} compact />;
  }

  if (reviews.length === 0) {
    return (
      <EmptyState
        icon="star"
        title="Todavía no puntuaste ningún vino"
        hint="Las estrellas están en la ficha de cada botella, arriba de tus momentos."
      />
    );
  }

  return (
    <ul className="myrat__list" aria-label="Tus valoraciones">
      {reviews.map((r) => (
        <li key={r._id} className="myrat-item">
          <div className="myrat-item__top">
            <span className="myrat-item__wine">
              <strong>{r.name}</strong>
              {/* Bodega y cosecha en el mismo renglón: sin la añada, dos
                  valoraciones tuyas del mismo vino en años distintos se ven
                  idénticas y no se sabe cuál es cuál. */}
              {(r.winery || r.vintage) && (
                <em>
                  {r.winery}
                  {r.winery && r.vintage ? " · " : ""}
                  {r.vintage ? `cosecha ${r.vintage}` : ""}
                </em>
              )}
            </span>
            <StarRating value={r.rating} size="sm" showValue={false} />
          </div>
          {r.text && <p className="myrat-item__text">{r.text}</p>}
        </li>
      ))}
    </ul>
  );
}
