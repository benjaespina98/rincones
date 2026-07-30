import Icon from "./Icon";
import "./PromoCard.css";

/**
 * La tarjeta de un destacado. La MISMA que ve el usuario y la misma que se ve en
 * la vista previa del panel.
 *
 * ── POR QUÉ ESTO ES UN COMPONENTE Y NO MARCADO DENTRO DEL CARRUSEL ──────────
 * Porque la vista previa del panel tiene que ser la tarjeta de verdad, no una
 * maqueta parecida. Una vista previa que se dibuja aparte empieza igual y se
 * separa en el primer cambio de estilo que alguien haga en uno de los dos lados;
 * a partir de ahí el panel promete una cosa y la app muestra otra, y quien carga
 * la campaña se entera abriendo Descubrí. Con un solo componente eso no puede
 * pasar: si cambia la tarjeta, cambia la vista previa.
 *
 * ── LO PAGO SE DECLARA PAGO ─────────────────────────────────────────────────
 * Una tarjeta con `sponsored` lleva el cartel "Publicidad", siempre y sin
 * excepción. No es un requisito legal a regañadientes: es lo que mantiene creíble
 * a TODO lo demás de la pantalla. El día que el usuario no sepa si una
 * recomendación es una recomendación, dejó de confiar en la app entera.
 */

/** Fecha del evento en lenguaje corto: "12 de octubre". */
const fechaCorta = (valor) => {
  if (!valor) return "";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "long" });
};

/** Lugar · fecha, lo concreto primero. Vacío si la tarjeta no tiene ninguno. */
const subtitulo = (promo) => {
  const partes = [promo.place?.venue || promo.place?.city, fechaCorta(promo.eventAt)];
  return partes.filter(Boolean).join(" · ");
};

export default function PromoCard({
  promo,
  onOpen,
  // `false` saca la tarjeta del recorrido por teclado. Lo usan las tarjetas del
  // carrusel que no están a la vista y la vista previa del panel: tabular hacia
  // algo que no se ve, o hacia una maqueta, es desorientador.
  interactive = true,
  // En la vista previa el botón no navega a ningún lado, pero tiene que estar:
  // parte de lo que hay que poder mirar antes de publicar es cómo queda con él.
  preview = false,
}) {
  if (!promo) return null;

  const meta = subtitulo(promo);
  const conBoton = Boolean(promo.url) || preview;

  return (
    <article
      className={`promo ${promo.sponsored ? "is-sponsored" : ""} ${preview ? "is-preview" : ""}`}
      style={promo.accent ? { "--promo-accent": promo.accent } : undefined}
      aria-hidden={interactive ? undefined : "true"}
    >
      {promo.image && (
        <img className="promo__bg" src={promo.image} alt="" loading="lazy" decoding="async" />
      )}

      <div className="promo__body">
        <span className="promo__kicker">
          {promo.sponsored ? (
            // El cartel de publicidad va primero y sin eufemismos.
            <span className="promo__adtag">Publicidad</span>
          ) : (
            <>
              <Icon name={promo.kind === "event" ? "calendar" : "sparkle"} size={12} />
              {promo.kind === "event" ? "Evento" : "Destacado"}
            </>
          )}
          {promo.sponsor?.name && <span className="promo__sponsor">{promo.sponsor.name}</span>}
        </span>

        <h3 className="promo__title">{promo.title || "Título de la campaña"}</h3>
        {promo.summary && <p className="promo__summary">{promo.summary}</p>}

        <div className="promo__foot">
          {meta && <span className="promo__meta">{meta}</span>}
          {conBoton && (
            <button
              type="button"
              className="promo__cta"
              onClick={preview ? undefined : () => onOpen?.(promo)}
              tabIndex={interactive && !preview ? 0 : -1}
              disabled={preview}
            >
              {promo.ctaLabel || "Ver más"}
              <Icon name="arrow-right" size={15} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
