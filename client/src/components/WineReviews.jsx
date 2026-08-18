import { useCallback, useEffect, useState } from "react";
import Icon from "./Icon";
import StarRating from "./StarRating";
import LoadingSkeleton from "./LoadingSkeleton";
import ErrorState from "./ErrorState";
import { getWineReviews } from "../services/reviewApi";
import "./WineReviews.css";

/**
 * Opiniones de OTROS usuarios sobre un vino, más el promedio.
 *
 * La opinión propia (estrellas + reseña) vive en <WineOpinion />: tenerlas
 * separadas evita los dos widgets de estrellas que antes convivían en la misma
 * pantalla y hacían puntuar dos veces lo mismo.
 */
/** Desde cuántas opiniones el desglose por estrella dice algo. */
const MINIMO_PARA_DESGLOSE = 3;

export default function WineReviews({ name, winery = "", varietal = "" }) {

  const [state, setState] = useState({ summary: null, mine: null, reviews: [] });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [abierto, setAbierto] = useState(false);

  const load = useCallback(async () => {
    if (!name) return;
    try {
      setLoading(true);
      setFailed(false);
      const data = await getWineReviews(name, winery, varietal);
      setState(data);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [name, winery, varietal]);

  useEffect(() => { load(); }, [load]);

  const fmtDate = (d) =>
    d ? new Date(d).toLocaleDateString("es-AR", { month: "short", year: "numeric" }) : "";

  return (
    <section className="wine-reviews">
      {/* "Otras opiniones" con un promedio que INCLUYE la tuya era una
          contradicción, y encima con dos números distintos: el encabezado
          contaba todas las reseñas y la lista de abajo mostraba sólo las
          ajenas —"3 reseñas" arriba, dos fichas abajo—.

          Ahora el título dice de quién es el promedio (de la comunidad, y la
          tuya cuenta) y el botón dice exactamente cuántas de OTRA gente hay.
          Arriba, en "Tu opinión", está la tuya y sólo la tuya. */}
      <div className="wine-reviews__head">
        <h3><Icon name="chat" size={16} /> Opiniones de la comunidad</h3>
      </div>

      {/* ── EL PUNTAJE, COMO UN PUNTAJE ────────────────────────────────────
          Era un renglón: cinco estrellas chiquitas y "12 opiniones" en gris, al
          costado del título. La valoración es lo primero que se mira de un vino
          que no conocés y estaba dicha en letra de pie de página.

          Ahora el número manda —grande, con las estrellas debajo— y al lado va
          el reparto: cuántos le pusieron 5, cuántos 4, cuántos 1. Un 3.5 de
          gente que puso 3 y 4 no es el mismo vino que un 3.5 de gente que puso
          5 y 1, y hasta ahora los dos se veían igual. */}
      {state.summary && (
        <div className="wine-score">
          <div className="wine-score__main">
            <strong className="wine-score__avg">
              {state.summary.avg.toLocaleString("es-AR", { minimumFractionDigits: 1 })}
            </strong>
            {/* El número ya está dicho en grande al lado: las estrellas acá
                sirven para leerlo de un vistazo, no para repetirlo. */}
            <StarRating value={state.summary.avg} size="lg" showValue={false} />
            <span className="wine-score__count">
              {state.summary.count} {state.summary.count === 1 ? "opinión" : "opiniones"}
              {state.mine && " · incluida la tuya"}
            </span>
          </div>

          {/* Con menos de tres opiniones el desglose no dice nada que el
              promedio no diga: son una o dos barras solas y ocupan lugar para
              informar de menos. */}
          {state.summary.dist && state.summary.count >= MINIMO_PARA_DESGLOSE && (
            <ul className="wine-score__bars">
              {[5, 4, 3, 2, 1].map((estrellas) => {
                const n = state.summary.dist[estrellas - 1] || 0;
                const pct = Math.round((n / state.summary.count) * 100);
                return (
                  <li key={estrellas}>
                    <span className="wine-score__star">{estrellas}★</span>
                    <span className="wine-score__bar" aria-hidden="true">
                      <span style={{ width: `${pct}%` }} />
                    </span>
                    <span className="wine-score__n">{n}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {loading && <LoadingSkeleton type="inline" count={2} />}

      {!loading && failed && (
        <ErrorState
          title="No se pudieron cargar las reseñas"
          hint="Probá de nuevo en un momento."
          onRetry={load}
          compact
        />
      )}

      {!loading && !failed && (
        <>
          {/* Plegadas por defecto: el promedio y cuántas hay es lo que se mira
              siempre —y ya está en el encabezado—; los textos se leen una vez y
              empujaban todo lo demás una pantalla hacia abajo en cada visita. */}
          {state.reviews.length > 0 && !abierto && (
            <button
              type="button"
              className="wine-reviews__toggle"
              onClick={() => setAbierto(true)}
              aria-expanded={false}
            >
              Leer {state.reviews.length === 1 ? "la opinión" : `las ${state.reviews.length} opiniones`} de otras personas
              <Icon name="arrow-right" size={15} />
            </button>
          )}

          {state.reviews.length > 0 && abierto && (
            <ul className="review-list">
              {state.reviews.map((r) => (
                <li key={r._id} className="review-card">
                  <div className="review-card__head">
                    {/* La cosecha que tomó ESA persona, al lado de su nombre.
                        No parte el promedio —todas las añadas suman al mismo,
                        porque separarlas dejaría un puntaje por balde— pero
                        contesta lo que uno se pregunta leyendo: un 2019 y un
                        2024 del mismo vino no son la misma botella. */}
                    <span className="review-card__author">
                      <span className="review-card__avatar">{r.authorAvatar || "🍷"}</span>
                      {r.authorName || "Alguien"}
                      {r.vintage && <span className="review-card__vintage">cosecha {r.vintage}</span>}
                    </span>
                    <span className="review-card__date">{fmtDate(r.createdAt)}</span>
                  </div>
                  <StarRating value={r.rating} size="sm" />
                  {r.text && <p className="review-card__text">{r.text}</p>}
                </li>
              ))}
            </ul>
          )}

          {abierto && state.reviews.length > 0 && (
            <button
              type="button"
              className="wine-reviews__toggle"
              onClick={() => setAbierto(false)}
              aria-expanded
            >
              Ocultar las reseñas
            </button>
          )}

          {/* Nadie escribió todavía, o el único que escribió sos vos: son dos
              situaciones distintas y antes las dos mostraban la misma frase —o
              ninguna, cuando tu reseña era la única y la sección quedaba con el
              título, tu promedio y nada más. */}
          {!state.summary && (
            <p className="wine-reviews__empty">
              Todavía nadie reseñó este vino. Si lo probaste, tu opinión puede ser la primera.
            </p>
          )}

          {state.summary && state.reviews.length === 0 && (
            <p className="wine-reviews__empty">
              Por ahora sos la única opinión sobre este vino.
            </p>
          )}
        </>
      )}
    </section>
  );
}
