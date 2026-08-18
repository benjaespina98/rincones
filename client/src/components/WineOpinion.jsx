import { useCallback, useEffect, useState } from "react";
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

  const load = useCallback(async () => {
    if (!name) return;
    try {
      const data = await getWineReviews(name, winery, varietal);
      setMine(data.mine || null);
      setRating(data.mine?.rating || 0);
      setText(data.mine?.text || "");
    } catch {
      // Sin reseña previa: se puntúa desde cero.
    }
  }, [name, winery, varietal]);

  useEffect(() => { load(); }, [load]);

  // Tocar una estrella publica al instante: el gesto más común no debería
  // requerir un botón de guardar.
  const rate = async (value) => {
    const next = rating === value ? 0 : value;
    setRating(next);

    if (next === 0) {
      if (!mine) return;
      try {
        await deleteWineReview(name, winery, varietal);
        setMine(null);
        setText("");
        onRated?.(0);
      } catch {
        showError("No se pudo quitar tu puntuación");
      }
      return;
    }

    try {
      setSaving(true);
      const saved = await publishWineReview({ name, winery, varietal, vintage, rating: next, text });
      setMine(saved);
      onRated?.(next);
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
            <button type="button" className="wine-opinion__add" onClick={() => setWriting(true)}>
              <Icon name="pencil" size={14} /> Escribir una reseña
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
