import Icon from "./Icon";
import "./PromoCard.css";

/**
 * La tarjeta de un destacado. La MISMA que ve el usuario y la misma que se ve en
 * la vista previa del panel.
 *
 * ── POR QUÉ ESTO ES UN COMPONENTE Y NO MARCADO DENTRO DEL CARRUSEL ──────────
 * Porque la vista previa del panel tiene que ser la tarjeta de verdad, no una
 * maqueta parecida. Una vista previa que se dibuja aparte empieza igual y se
 * separa en el primer cambio de estilo que alguien haga en uno de los dos lados.
 *
 * ── LA TARJETA ENTERA ES EL ENLACE ──────────────────────────────────────────
 * Antes sólo el botón "Ver más" llevaba a algún lado, y eso fue un error: quien
 * carga la campaña pone un enlace y no ve ningún enlace en la pantalla —ve un
 * botón chico en una esquina, que no se lee como "acá está lo que cargué"—. Y para
 * el usuario, un blanco de 100px en una tarjeta de 350 es tirarle a un objetivo
 * chico cuando toda la superficie estaba disponible.
 *
 * Ahora se toca donde sea. El botón queda como señal visual de que la tarjeta
 * lleva a algún lado, que es lo que hace bien.
 *
 * ── LO PAGO SE DECLARA PAGO ─────────────────────────────────────────────────
 * Una tarjeta con `sponsored` lleva el cartel "Publicidad", siempre y sin
 * excepción. No es un requisito legal a regañadientes: es lo que mantiene creíble
 * a TODO lo demás de la pantalla. El día que el usuario no sepa si una
 * recomendación es una recomendación, dejó de confiar en la app entera.
 */

/**
 * Fecha del evento en lenguaje corto: "12 de octubre".
 *
 * `timeZone: "UTC"` porque la fecha se guarda como el arranque del día en
 * Argentina (03:00 UTC) y sin esto el navegador la volvía a pasar a hora local,
 * restando tres horas y mostrando el DÍA ANTERIOR: un evento cargado el 7 de marzo
 * salía "6 de marzo". Un día de diferencia en la fecha de una feria es el tipo de
 * error que hace que alguien llegue cuando ya terminó.
 */
const fechaCorta = (valor) => {
  if (!valor) return "";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "long", timeZone: "UTC" });
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
  // En la vista previa nada navega, pero todo se ve igual: parte de lo que hay que
  // poder mirar antes de publicar es cómo queda con su botón.
  preview = false,
}) {
  if (!promo) return null;

  const meta = subtitulo(promo);
  const llevaAAlgunLado = Boolean(promo.url) && !preview;

  const contenido = (
    <>
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

          {/* La marca de quien publica: logo y nombre juntos, después del cartel.
              Primero QUÉ es esto, después DE QUIÉN es. Al revés, un logo grande
              arriba se lee como contenido de la app. */}
          {promo.sponsor?.logo && (
            <img
              className="promo__sponsor-logo"
              src={promo.sponsor.logo}
              alt=""
              loading="lazy"
              decoding="async"
            />
          )}
          {promo.sponsor?.name && <span className="promo__sponsor">{promo.sponsor.name}</span>}
        </span>

        <h3 className="promo__title">{promo.title || "Título de la campaña"}</h3>
        {promo.summary && <p className="promo__summary">{promo.summary}</p>}

        {(meta || promo.url || preview) && (
          <div className="promo__foot">
            {meta && <span className="promo__meta">{meta}</span>}
            {(promo.url || preview) && (
              <span className="promo__cta">
                {promo.ctaLabel || "Ver más"}
                <Icon name="arrow-right" size={15} />
              </span>
            )}
          </div>
        )}
      </div>
    </>
  );

  const clases = [
    "promo",
    promo.sponsored ? "is-sponsored" : "",
    preview ? "is-preview" : "",
    llevaAAlgunLado ? "is-clickable" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Sin enlace la tarjeta es informativa y no finge ser un botón: un control que
  // no hace nada al tocarlo es peor que no tener control.
  if (!llevaAAlgunLado) {
    return (
      <article className={clases} style={promo.accent ? { "--promo-accent": promo.accent } : undefined} aria-hidden={interactive ? undefined : "true"}>
        {contenido}
      </article>
    );
  }

  return (
    <article
      className={clases}
      style={promo.accent ? { "--promo-accent": promo.accent } : undefined}
      aria-hidden={interactive ? undefined : "true"}
    >
      {/* El botón cubre la tarjeta entera. Va DEBAJO del contenido en el orden de
          apilado, así el texto se puede seleccionar y las imágenes se ven, pero
          cualquier toque cae acá. */}
      <button
        type="button"
        className="promo__hit"
        onClick={() => onOpen?.(promo)}
        tabIndex={interactive ? 0 : -1}
        aria-label={`${promo.title}${promo.summary ? `. ${promo.summary}` : ""}`}
      />
      {contenido}
    </article>
  );
}
