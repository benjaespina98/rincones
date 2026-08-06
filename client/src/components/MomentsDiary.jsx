import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "./Icon";
import StarRating from "./StarRating";
import WinePhoto from "./WinePhoto";
import LoadingSkeleton from "./LoadingSkeleton";
import ErrorState from "./ErrorState";
import { getAllMoments } from "../services/wineApi";
import { OCCASION_LABELS, EMOTION_LABELS } from "../data/momentOptions";
import "../styles/components/MomentsDiary.css";

/**
 * Tu diario: todos los momentos, de todos los vinos, en orden.
 *
 * Los momentos existían desde siempre pero sólo se podían ver vino por vino, y
 * abriendo su ficha. Así, la pregunta que uno le hace a un diario —"¿qué tomé
 * este verano?", "¿cuál fue la cena de agosto?"— no tenía dónde responderse:
 * había que acordarse primero de qué botella era, que es exactamente el dato
 * que uno no recuerda.
 *
 * Es privado y lo dice. No hay ninguna ruta en el server que devuelva los
 * momentos de otra persona: se filtran por usuario en la consulta.
 */

const MAX_VISIBLES = 6;

const fecha = (d) =>
  d
    ? new Date(d).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })
    : "";

export default function MomentsDiary() {
  const navigate = useNavigate();
  const [moments, setMoments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [verTodos, setVerTodos] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setFailed(false);
      setMoments(await getAllMoments());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Sin momentos y sin fallo no se ocupa lugar: el perfil de alguien que todavía
  // no registró ninguno no necesita una tarjeta vacía explicando qué se pierde.
  if (!loading && !failed && moments.length === 0) return null;

  const visibles = verTodos ? moments : moments.slice(0, MAX_VISIBLES);

  return (
    <section className="diary" aria-label="Tu diario de momentos">
      <div className="diary__head">
        <h3>
          <Icon name="calendar" size={15} /> Tu diario
        </h3>
        {/* El mismo cartelito que en la ficha del vino, y el opuesto exacto del
            "Se publica" de tu opinión: acá se ve de un vistazo que esto no sale
            de tu cuenta. */}
        <span className="diary__private" title="Nadie más puede ver tus momentos">
          <Icon name="lock" size={12} /> Sólo vos
        </span>
      </div>

      {loading && <LoadingSkeleton type="inline" count={3} />}

      {failed && !loading && (
        <ErrorState title="No se pudo cargar tu diario" onRetry={load} compact />
      )}

      {!loading && !failed && (
        <>
          <ul className="diary__list">
            {visibles.map((m) => (
              <li key={m._id} className="diary-entry">
                {/* El vino puede haber sido eliminado de la bodega: el momento
                    sigue siendo tuyo, sólo que ya no lleva a ninguna ficha. */}
                <button
                  type="button"
                  className="diary-entry__main"
                  onClick={() => m.wine && navigate(`/vino/${m.wine._id}`)}
                  disabled={!m.wine}
                >
                  <span className="diary-entry__thumb">
                    <WinePhoto
                      src={m.wine?.image}
                      type={m.wine?.type || "unknown"}
                      alt={m.wine?.name || "Vino"}
                      artSize={40}
                    />
                  </span>

                  <span className="diary-entry__body">
                    <span className="diary-entry__top">
                      <strong>{m.wine?.name || "Un vino que ya no tenés"}</strong>
                      <span className="diary-entry__date">{fecha(m.consumedAt)}</span>
                    </span>

                    {!!m.rating && <StarRating value={m.rating} size="sm" />}

                    <span className="diary-entry__meta">
                      {m.occasion && <span>{OCCASION_LABELS[m.occasion] || m.occasion}</span>}
                      {m.companions && (
                        <span><Icon name="users" size={11} /> {m.companions}</span>
                      )}
                      {m.place && <span><Icon name="map-pin" size={11} /> {m.place}</span>}
                      {m.emotion && (
                        <span><Icon name="sparkle" size={11} /> {EMOTION_LABELS[m.emotion] || m.emotion}</span>
                      )}
                    </span>

                    {m.notes && <span className="diary-entry__notes">{m.notes}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {moments.length > MAX_VISIBLES && (
            <button
              type="button"
              className="diary__more"
              onClick={() => setVerTodos((v) => !v)}
              aria-expanded={verTodos}
            >
              {verTodos ? "Ver menos" : `Ver los ${moments.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
