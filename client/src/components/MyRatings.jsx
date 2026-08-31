import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "./Icon";
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
  const navigate = useNavigate();
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

  /**
   * Tocar una valoración lleva al vino que valoraste.
   *
   * Era una lista de vinos que no llevaba a ningún vino: leías "Rutini Malbec ·
   * 4 estrellas", te acordabas a medias de por qué le pusiste eso, y la única
   * salida era volver, ir a la bodega y buscarlo por nombre. Todo lo que
   * contesta la pregunta que uno se hace acá —qué es, cuándo lo tomaste, qué
   * escribiste, cuánto queda— ya está armado en la ficha.
   *
   * Dos destinos, y el server dice cuál (ver `myReviews`): si el vino sigue en
   * tu bodega, tu ficha; si no —lo terminaste y lo borraste, o lo puntuaste
   * desde el catálogo sin sumarlo—, la ficha pública, que se arma con los
   * mismos datos que ya tiene la reseña. Nunca un callejón sin salida.
   */
  const abrirVino = (r) => {
    if (r.wineId) return navigate(`/vino/${r.wineId}`);
    return navigate("/descubrir/vino", {
      state: { wine: { name: r.name, winery: r.winery, varietal: r.varietal, vintage: r.vintage } },
    });
  };

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
          {/* La ficha entera es el control, texto incluido: media tarjeta que
              lleva al vino y media que no es la clase de blanco que uno
              descubre tocando. Mismo criterio que la fila de Mi Bodega. */}
          <button
            type="button"
            className="myrat-item__link"
            onClick={() => abrirVino(r)}
            aria-label={`Ver ${r.name}`}
          >
            <span className="myrat-item__top">
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
              {/* El mismo chevron que cierra las filas de la bodega y las del
                  perfil: es lo que dice "esto lleva a otro lado" sin agregar
                  una palabra más a una ficha que ya tiene cuatro datos. */}
              <Icon name="chevron-right" size={16} className="myrat-item__go" />
            </span>
            {r.text && <span className="myrat-item__text">{r.text}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
