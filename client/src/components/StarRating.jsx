/**
 * Estrellas de sólo lectura: un promedio, un puntaje guardado.
 *
 * ── POR QUÉ AHORA SE LLENAN A MEDIAS ────────────────────────────────────────
 * Antes cada estrella estaba prendida o apagada y se decidía con
 * `Math.round(valor)`. Con eso, un promedio de 4.3 y uno de 4.5 dibujaban
 * exactamente las mismas cuatro estrellas, y un 2.5 se redibujaba como 3 — la
 * imagen decía una cosa y el número al lado, otra. En una app donde las
 * valoraciones son media pantalla, ésa es la diferencia que más se mira.
 *
 * Se dibuja en dos capas: cinco estrellas apagadas y encima las mismas cinco en
 * dorado, recortadas al porcentaje exacto. Es un solo `width` y no cinco
 * cálculos por estrella, así que una lista de treinta vinos no paga nada.
 *
 * Para puntuar —tocar y elegir— está `WineOpinion`: acá no hay nada que tocar.
 */
const StarRating = ({ value = 0, max = 5, size = "md", showValue = true }) => {
  const safeValue = Math.max(0, Math.min(Number(value) || 0, max));
  const glifos = "★".repeat(max);
  const porcentaje = (safeValue / max) * 100;

  return (
    <span className={`stars stars--${size}`} aria-label={`Puntuación ${safeValue.toFixed(1)} de ${max}`}>
      <span className="stars__track" aria-hidden="true">
        <span className="stars__base">{glifos}</span>
        {/* `width` en porcentaje del ancho total: media estrella queda media, no
            redondeada para arriba. */}
        <span className="stars__fill" style={{ width: `${porcentaje}%` }}>
          {glifos}
        </span>
      </span>
      {showValue && <span className="stars__value">{safeValue.toFixed(1)}</span>}
    </span>
  );
};

export default StarRating;
