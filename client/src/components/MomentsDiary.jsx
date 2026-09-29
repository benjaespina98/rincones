import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "./Icon";
import StarRating from "./StarRating";
import WinePhoto from "./WinePhoto";
import LoadingSkeleton from "./LoadingSkeleton";
import ErrorState from "./ErrorState";
import { getAllMoments } from "../services/wineApi";
import { OCCASION_LABELS, EMOTION_LABELS } from "../data/momentOptions";
import "./MomentsDiary.css";

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

/** Desde cuántos momentos vale la pena sacar conclusiones. */
const MINIMO_PARA_RESUMIR = 3;

/**
 * Las tres preguntas que uno le hace a un diario, contestadas con lo que ya está
 * en pantalla: cuántas noches van este año, cuál es el vino que más repetiste y
 * con quién solés tomar.
 *
 * Sale de los momentos ya cargados, así que no cuesta ninguna consulta. Cada
 * dato aparece SÓLO si es cierto: sin compañías anotadas no se inventa una, y un
 * vino que aparece una sola vez no es "el que más repetís".
 */
const resumirMomentos = (moments) => {
  if (moments.length < MINIMO_PARA_RESUMIR) return "";

  const añoActual = new Date().getFullYear();
  const esteAño = moments.filter(
    (m) => new Date(m.consumedAt).getFullYear() === añoActual
  ).length;

  const masFrecuente = (valores) => {
    const cuenta = new Map();
    for (const v of valores.filter(Boolean)) cuenta.set(v, (cuenta.get(v) || 0) + 1);
    let top = null;
    for (const [valor, n] of cuenta) if (!top || n > top.n) top = { valor, n };
    return top && top.n > 1 ? top : null;
  };

  const vino = masFrecuente(moments.map((m) => m.wine?.name || m.wineSnapshot?.name));
  const compañía = masFrecuente(moments.map((m) => (m.companions || "").trim()));

  const partes = [
    esteAño > 0 &&
      `${esteAño} ${esteAño === 1 ? "noche anotada" : "noches anotadas"} en ${añoActual}`,
    vino && `el que más repetiste es ${vino.valor}`,
    compañía && `casi siempre con ${compañía.valor}`,
  ].filter(Boolean);

  if (partes.length === 0) return "";
  // Mayúscula al principio y punto al final: es una frase, no una lista de datos.
  const frase = partes.join(" · ");
  return frase.charAt(0).toUpperCase() + frase.slice(1) + ".";
};

const fecha = (d) =>
  d
    ? new Date(d).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })
    : "";

export default function MomentsDiary({ probados = 0 }) {
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

  /**
   * ── EL VACÍO QUE SÍ VALE LA PENA MOSTRAR ──────────────────────────────────
   *
   * Acá no se mostraba nada con cero momentos, y el razonamiento era bueno para
   * un perfil recién creado: nadie necesita una tarjeta vacía explicándole lo
   * que se está perdiendo.
   *
   * Pero deja afuera a la persona para la que esto importa más: la que YA tomó
   * vinos —los tiene marcados como probados— y nunca escribió un momento, casi
   * seguro porque no sabe que puede. El diario es lo que distingue a Rincones de
   * una planilla de inventario, y era invisible hasta que alguien lo usaba por
   * primera vez: el clásico caso de una función que sólo descubre quien ya la
   * conocía.
   *
   * Así que el vacío aparece sólo ahí: con botellas probadas y sin una sola
   * anotación. Sin vinos probados sigue sin ocupar lugar, como antes.
   */
  if (!loading && !failed && moments.length === 0) {
    if (probados === 0) return null;

    return (
      <section className="diary" aria-label="Tu diario de momentos">
        <div className="diary__head">
          <h3 className="diary__title">
            <Icon name="calendar" size={16} /> Tu diario
            <span className="diary__private" title="Nadie más puede verlos">
              <Icon name="lock" size={11} /> Sólo vos
            </span>
          </h3>
        </div>
        <p className="diary__invite">
          Ya probaste {probados === 1 ? "un vino" : `${probados} vinos`}, pero todavía no
          escribiste ninguna noche. Cuando abrís una botella podés anotar con quién estabas,
          dónde y qué comieron — y eso queda para siempre, sólo para vos.
        </p>
        <button type="button" className="diary__more" onClick={() => navigate("/bodega?filter=probados")}>
          Empezar por un vino que ya tomaste <Icon name="arrow-right" size={15} />
        </button>
      </section>
    );
  }

  const visibles = verTodos ? moments : moments.slice(0, MAX_VISIBLES);
  const resumen = resumirMomentos(moments);

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

      {!loading && !failed && resumen && (
        /**
         * ── UNA LECTURA DE CONJUNTO, NO SÓLO LA PILA ──────────────────────────
         *
         * El diario era una lista cronológica y nada más: para saber "¿cuánto
         * tomé este año?" o "¿con quién?" había que contar a ojo, que es
         * exactamente lo que una lista no puede contestar. Estas tres frases
         * salen de los momentos que YA están cargados —no hay una consulta más—
         * y son las tres preguntas que uno le hace a un diario cuando lo abre.
         *
         * Se muestran recién con tres momentos: con uno o dos, "tu ocasión más
         * frecuente" describe una casualidad, no una costumbre.
         */
        <p className="diary__resumen">{resumen}</p>
      )}

      {!loading && !failed && (
        <>
          <ul className="diary__list">
            {visibles.map((m) => (
              <li key={m._id} className="diary-entry">
                {/* El vino puede haber sido eliminado de la bodega. El momento
                    sigue siendo tuyo Y sigue diciendo qué tomaste: el nombre
                    viene del snapshot que se guardó al escribirlo (ver
                    wineMoment.model.js). Lo único que se pierde es el link a la
                    ficha, porque esa ficha ya no existe.

                    Antes decía "Un vino que ya no tenés", que es la respuesta
                    equivocada a la única pregunta que un diario tiene que poder
                    contestar. */}
                <button
                  type="button"
                  className="diary-entry__main"
                  onClick={() => m.enBodega && m.wine?._id && navigate(`/vino/${m.wine._id}`)}
                  disabled={!m.enBodega || !m.wine?._id}
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
                      <strong>{m.wine?.name || "Vino sin nombre"}</strong>
                      <span className="diary-entry__date">{fecha(m.consumedAt)}</span>
                    </span>

                    {/* Que ya no esté en tu bodega es un dato del vino, no del
                        recuerdo: se dice en chico y al costado, sin teñir la
                        entrada de "esto está roto". */}
                    {!m.enBodega && (
                      <span className="diary-entry__gone">
                        {m.wine?.winery ? `${m.wine.winery} · ` : ""}ya no está en tu bodega
                      </span>
                    )}

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
