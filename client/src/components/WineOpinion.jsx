import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { useToast } from "../context/ToastContext";
import { getWineReviews, publishWineReview, deleteWineReview } from "../services/reviewApi";
import "./WineOpinion.css";

/**
 * Tu opinión sobre un vino: estrellas + reseña opcional.
 *
 * Antes había DOS widgets de estrellas en la misma pantalla —el rating "privado"
 * del vino y el de la reseña pública—, que era la principal fuente de ruido
 * visual de la ficha y además obligaba a puntuar dos veces lo mismo.
 *
 * Ahora hay una sola calificación: puntuar ES tu opinión, y sirve a quien busque
 * ese vino. El texto es opcional y aparece recién después de puntuar, para no
 * pedir de entrada un esfuerzo que la mayoría no va a hacer.
 */
/**
 * Qué querés decir con cada estrella.
 *
 * Cinco estrellas sin palabras obligan a inventarse la escala: para uno el 3 es
 * "bueno" y para otro es "no me gustó". La palabra hace dos cosas a la vez —
 * fija la escala y confirma que el toque entró, que en un pulgar apurado sobre
 * cinco blancos pegados no es poca cosa.
 */
const VEREDICTOS = [
  "No es para mí",
  "Flojo",
  "Está bien",
  "Muy bueno",
  "De los que se recuerdan",
];

export default function WineOpinion({ name, winery = "", varietal = "", vintage, onRated }) {
  const { showSuccess, showError } = useToast();

  const [mine, setMine] = useState(null);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");
  const [writing, setWriting] = useState(false);
  const [saving, setSaving] = useState(false);

  /**
   * ── LA CARGA INICIAL NO PUEDE PISAR LO QUE YA TOCASTE ──────────────────────
   * Este efecto trae tu reseña previa y escribe `rating`. Si la respuesta llega
   * DESPUÉS de que tocaste una estrella —una red lenta, o un toque rápido apenas
   * abre la ficha— la sobreescribe con lo que había antes: normalmente 0.
   *
   * El resultado era la peor versión posible del problema que se reportó: la
   * reseña quedaba publicada en el servidor y la pantalla mostraba cero
   * estrellas. O sea, puntuabas, se guardaba, y la app te decía que no.
   *
   * `tocado` corta eso: a partir del primer toque, la respuesta de la carga
   * inicial ya no manda sobre lo que hizo la persona.
   */
  const tocado = useRef(false);

  const load = useCallback(async () => {
    if (!name) return;
    try {
      const data = await getWineReviews(name, winery, varietal);
      if (tocado.current) return;
      setMine(data.mine || null);
      setRating(data.mine?.rating || 0);
      setText(data.mine?.text || "");
    } catch {
      // Sin reseña previa: se puntúa desde cero.
    }
  }, [name, winery, varietal]);

  useEffect(() => { load(); }, [load]);

  /**
   * Tocar una estrella publica al instante: el gesto más común no debería
   * requerir un botón de guardar.
   *
   * ── POR QUÉ ANTES PARECÍA QUE NO PUBLICABA ─────────────────────────────────
   * Se reportó así: "si sólo pongo las estrellas no me deja publicar, sí o sí
   * tengo que entrar a comentar y ahí publicar". Y publicaba — esta función
   * llama a `publishWineReview` desde siempre y el servidor acepta reseñas sin
   * texto (ver `upsertReview`).
   *
   * Lo que faltaba era decirlo. Puntuar guardaba EN SILENCIO, mientras que el
   * camino largo —escribir la reseña y tocar "Publicar"— terminaba en un toast
   * de confirmación. Dos acciones que hacen lo mismo, una muda y otra que
   * avisa: cualquiera concluye que la muda no hizo nada y que hay que pasar por
   * la otra. El bug no estaba en el guardado, estaba en la falta de acuse.
   */
  const rate = async (value) => {
    // Desde acá, lo que decidió la persona manda sobre la carga en vuelo.
    tocado.current = true;
    const next = rating === value ? 0 : value;
    setRating(next);

    if (next === 0) {
      if (!mine) return;
      try {
        await deleteWineReview(name, winery, varietal);
        setMine(null);
        setText("");
        onRated?.(0);
        showSuccess("Quitamos tu puntuación");
      } catch {
        showError("No se pudo quitar tu puntuación");
        // El estado local tiene que volver a lo que de verdad quedó guardado: si
        // no, la estrella queda apagada sobre una reseña que sigue publicada.
        setRating(mine?.rating || 0);
      }
      return;
    }

    try {
      setSaving(true);
      const saved = await publishWineReview({ name, winery, varietal, vintage, rating: next, text });
      setMine(saved);
      onRated?.(next);
      // El acuse que faltaba. Nombra la escala en vez de decir "guardado" a
      // secas, así confirma DOS cosas de una: que se publicó y qué se publicó.
      showSuccess(`Publicaste tu puntuación: ${VEREDICTOS[next - 1]}`);
    } catch {
      showError("No se pudo guardar tu puntuación");
      setRating(mine?.rating || 0);
    } finally {
      setSaving(false);
    }
  };

  const saveText = async () => {
    try {
      setSaving(true);
      const saved = await publishWineReview({ name, winery, varietal, vintage, rating, text });
      setMine(saved);
      setWriting(false);
      showSuccess(text.trim() ? "Reseña publicada" : "Puntuación guardada");
    } catch {
      showError("No se pudo publicar la reseña");
    } finally {
      setSaving(false);
    }
  };

  const shown = hover || rating;

  return (
    <section className="wine-opinion">
      {/* El aviso de "pública" se mostraba SÓLO después de puntuar. La idea era
          no advertir sobre algo que todavía no pasó, pero es al revés: enterarte
          de que tu puntuación se publica cuando ya se publicó llega tarde. Ahora
          está siempre, y así también se distingue de un vistazo de la sección de
          abajo: acá está la tuya, abajo la de los demás. */}
      <div className="wine-opinion__head">
        <span className="wine-opinion__title">Tu opinión</span>
        <span className="wine-opinion__public" title="Otros la ven al buscar este vino">
          <Icon name="eye" size={12} /> {rating > 0 ? "Pública" : "Se publica"}
        </span>
      </div>

      <div
        className="wine-opinion__stars"
        role="group"
        aria-label="Puntuar este vino"
        onMouseLeave={() => setHover(0)}
      >
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            type="button"
            className={`wine-opinion__star ${v <= shown ? "is-on" : ""}`}
            onClick={() => rate(v)}
            onMouseEnter={() => setHover(v)}
            disabled={saving}
            aria-label={`${v} ${v === 1 ? "estrella" : "estrellas"}`}
            aria-pressed={v <= rating}
          >
            ★
          </button>
        ))}
      </div>

      {/* La escala, en palabras. Sigue al dedo mientras elegís (por eso mira a
          `shown` y no a `rating`) y con cero estrellas dice qué hacer, que era
          lo único que faltaba para que la fila de estrellas se entienda sin
          probar. */}
      <p className="wine-opinion__verdict">
        {shown > 0 ? (
          <>
            <strong>{VEREDICTOS[shown - 1]}</strong>
            {/* La confirmación que queda EN LA PANTALLA.
                El toast avisa y se va; esto responde "¿quedó publicado?" cinco
                minutos después, que es cuando la duda aparece de verdad. Mira a
                `mine` —lo que el servidor devolvió— y no a `rating`, así que
                dice la verdad de lo guardado y no la del dedo: mientras el
                puntero pasa por encima de otra estrella, `shown` cambia pero
                esto no miente sobre lo que hay publicado. */}
            {mine && rating > 0 && !saving && (
              <span className="wine-opinion__saved">
                <Icon name="check" size={12} /> Publicada
              </span>
            )}
            {saving && <span className="wine-opinion__saved">Publicando…</span>}
            {rating > 0 && (
              <button
                type="button"
                className="wine-opinion__clear"
                onClick={() => rate(rating)}
                disabled={saving}
              >
                Quitar mi puntuación
              </button>
            )}
          </>
        ) : (
          "Tocá una estrella para puntuarlo"
        )}
      </p>

      {/* La reseña escrita sólo se ofrece una vez que puntuó: pedirla antes es
          pedir un esfuerzo grande a alguien que todavía no se comprometió. */}
      {rating > 0 && !writing && (
        <>
          {mine?.text ? (
            <p className="wine-opinion__text">
              {mine.text}
              <button type="button" className="wine-opinion__link" onClick={() => setWriting(true)}>
                Editar
              </button>
            </p>
          ) : (
            /* "Escribir una reseña" sonaba al paso que faltaba para que la
               puntuación contara. Con la puntuación ya publicada arriba, esto es
               lo que es: algo más, si tenés ganas. */
            <button type="button" className="wine-opinion__add" onClick={() => setWriting(true)}>
              <Icon name="pencil" size={14} /> Contá a qué te supo (opcional)
            </button>
          )}
        </>
      )}

      {writing && (
        <div className="wine-opinion__form">
          <textarea
            className="wine-opinion__input"
            placeholder="¿A qué te supo?"
            aria-label="Tu reseña"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            rows={4}
            disabled={saving}
            autoFocus
          />
          <div className="wine-opinion__actions">
            <button
              type="button"
              className="wine-opinion__cancel"
              onClick={() => { setWriting(false); setText(mine?.text || ""); }}
              disabled={saving}
            >
              Cancelar
            </button>
            <button type="button" className="wine-opinion__save" onClick={saveText} disabled={saving}>
              {saving ? "Publicando…" : "Publicar"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
