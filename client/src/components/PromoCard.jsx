import { Link } from "react-router-dom";
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

  /**
   * ── POR QUÉ ESTA TARJETA NO SE LLAMA "is-sponsored" ─────────────────────────
   * Porque los bloqueadores de publicidad la escondían. EasyList —la lista que
   * traen de fábrica uBlock Origin, AdBlock Plus, AdGuard y el escudo de Brave—
   * tiene la regla genérica `##.is-sponsored`: cualquier elemento con esa clase
   * se oculta con display:none en TODOS los sitios, sin importar de quién sea.
   *
   * El síntoma era desconcertante: la campaña estaba al aire, el server la
   * devolvía, React la contaba —el encabezado decía "Destacados · Lo que está
   * pasando", que es el texto de UNA campaña— y abajo no había nada. Sólo pasaba
   * con las publicidades: los eventos no llevan esta clase y se veían siempre.
   *
   * La clase no tenía ni una regla de CSS: era un marcador que no marcaba nada y
   * a cambio hacía invisible lo único que la app le cobra a alguien. El estado
   * "es paga" ya vive donde tiene que vivir: en `promo.sponsored`, que es lo que
   * decide mostrar el cartel de PUBLICIDAD.
   *
   * Regla para lo que venga: nada en esta pantalla se nombra como el ad-tech de
   * terceros —sponsor, banner, adslot—, aunque el contenido sea genuinamente una
   * publicidad nuestra.
   */
  const clases = ["promo", preview ? "is-preview" : "", llevaAAlgunLado ? "is-clickable" : ""]
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

  /**
   * ── EL ENLACE ES UN ENLACE ──────────────────────────────────────────────────
   * Era un <button> que en su handler llamaba a `window.open`. Funciona hasta que
   * algo se interpone, y en esa tarjeta se interponen dos cosas: el conteo del
   * clic corre ANTES de navegar, así que cualquier error suyo se lleva puesta la
   * navegación; y `window.open` es exactamente el patrón que bloquean los
   * navegadores y las extensiones cuando la campaña, además, dice "Publicidad".
   * El resultado es el peor posible: tocás y no pasa nada, sin ningún aviso.
   *
   * Un <a href> no depende de que corra JavaScript. Encima trae gratis lo que
   * había que programar: se ve a dónde va al pasar el mouse, se puede abrir en
   * pestaña nueva con el botón del medio o con el menú contextual, y un lector de
   * pantalla lo anuncia como enlace y no como botón.
   *
   * El conteo del clic pasa a ser un efecto secundario del enlace: si falla, la
   * persona igual llega a donde iba. Al revés no.
   */
  const destino = String(promo.url).trim();
  const interno = destino.startsWith("/");
  const registrar = () => onOpen?.(promo);

  return (
    <article
      className={clases}
      style={promo.accent ? { "--promo-accent": promo.accent } : undefined}
      aria-hidden={interactive ? undefined : "true"}
    >
      {/* Cubre la tarjeta entera. Va DEBAJO del contenido en el orden de apilado,
          así el texto se puede seleccionar y las imágenes se ven, pero cualquier
          toque cae acá. */}
      {interno ? (
        <Link
          className="promo__hit"
          to={destino}
          onClick={registrar}
          tabIndex={interactive ? 0 : -1}
          aria-label={`${promo.title}${promo.summary ? `. ${promo.summary}` : ""}`}
        />
      ) : (
        <a
          className="promo__hit"
          href={destino}
          target="_blank"
          // `noopener` para que el sitio del anunciante no pueda tocar la pestaña
          // de la app. Sin `rel="sponsored"`: hay listas de bloqueo que apuntan a
          // ese valor, la app está detrás de un login —ningún buscador la ve— y
          // acabamos de aprender lo que cuesta nombrar algo como el ad-tech.
          rel="noopener noreferrer"
          onClick={registrar}
          tabIndex={interactive ? 0 : -1}
          aria-label={`${promo.title}${promo.summary ? `. ${promo.summary}` : ""}`}
        />
      )}
      {contenido}
    </article>
  );
}
