import { Link } from "react-router-dom";
import Icon from "./Icon";
import { typeInfo, itemMeta } from "../data/contentTypes";
import "../styles/components/ContentCard.css";

/**
 * La tarjeta de cualquier contenido de Descubrí.
 *
 * ── UNA SOLA TARJETA, TRES TAMAÑOS ──────────────────────────────────────────
 * Antes había cinco formas distintas de dibujar "algo con título, bajada, ícono
 * y enlace": la del carrusel de campañas, la de los enlaces curados, la de las
 * playlists, la de la lección y la del resultado de búsqueda. Cinco CSS que
 * empezaron parecidos y se despegaron, y un tipo de contenido nuevo era escribir
 * el sexto.
 *
 * Acá hay uno con tres variantes, que son tres jerarquías y no tres diseños:
 *
 *   hero    — el evento destacado. Imagen grande, todo el ancho. Uno por
 *             pantalla como mucho: si todo es hero, nada lo es.
 *   compact — las vinotecas. Logo chico, dos o tres por fila.
 *   row     — el feed. Una fila con ícono, la forma más densa y la que más se
 *             repite.
 *
 * ── EL LAYOUT DE DOS COLUMNAS ───────────────────────────────────────────────
 * En las tres variantes el bloque visual va a la izquierda y el texto a la
 * derecha con un ancho máximo de lectura. La primera versión de la tarjeta de
 * lección apilaba todo a lo ancho, y en desktop las líneas llegaban a 120
 * caracteres: técnicamente correcto e ilegible. El CTA es un elemento con
 * fondo, no una flecha suelta al final de una línea de dos metros.
 *
 * ── LO PAGO SE DECLARA PAGO ─────────────────────────────────────────────────
 * `sponsored` pone el badge, siempre y sin excepción, en cualquier variante y
 * en cualquier tipo. No es un requisito legal a regañadientes: el día que el
 * usuario no sepa si una recomendación es una recomendación, dejó de confiar en
 * la app entera. Por eso el badge lo pone la tarjeta y no cada sección: una
 * sección que se olvide no puede existir.
 *
 * ── POR QUÉ LA CLASE NO SE LLAMA "is-sponsored" ─────────────────────────────
 * Porque los bloqueadores de publicidad la escondían. EasyList —la que traen de
 * fábrica uBlock, AdBlock Plus, AdGuard y Brave— tiene la regla genérica
 * `##.is-sponsored`: cualquier elemento con esa clase se oculta en TODOS los
 * sitios. El síntoma era desconcertante (el server devolvía la campaña, React
 * la contaba, y en pantalla no había nada) y sólo pasaba con lo pago.
 *
 * Regla para lo que venga: nada acá se nombra como el ad-tech de terceros
 * —sponsor, banner, adslot—, aunque el contenido sea genuinamente una
 * publicidad nuestra.
 */

export default function ContentCard({
  item,
  variant = "row",
  onOpen,
  // Ref para medir la impresión (ver hooks/usePromoMetrics). Va acá y no en un
  // div envolvente para no meter un nodo de más por tarjeta sólo para contar.
  innerRef,
  /**
   * Mostrar el rótulo del tipo ("VIDEO", "CURSO").
   *
   * En un grupo homogéneo es ruido puro: bajo el título "Videos", con ícono de
   * play y en el color de los videos, cada fila anunciando "VIDEO" es la cuarta
   * vez que se dice lo mismo. En un grupo mixto —"Para ir", con bodegas y
   * eventos— es justamente lo que hace falta para distinguirlos.
   *
   * El cartel de "Publicidad" NO se ve afectado por esto: ese no se oculta
   * nunca, en ninguna variante ni en ningún grupo.
   */
  showType = true,
  // `false` saca la tarjeta del recorrido por teclado. Lo usa la vista previa
  // del panel: tabular hacia una maqueta es desorientador.
  interactive = true,
  // En la vista previa nada navega, pero todo se ve igual: parte de lo que hay
  // que poder mirar antes de publicar es cómo queda con su botón.
  preview = false,
}) {
  if (!item) return null;

  const info = typeInfo(item.type);
  const meta = itemMeta(item);
  const destino = String(item.url || "").trim();
  // `onOpen` sin url es el caso de la lección: no navega, abre una hoja.
  const abreAlgo = Boolean(destino) || Boolean(item.onOpen);
  const navegable = abreAlgo && !preview;

  const clases = [
    "ccard",
    `ccard--${variant}`,
    preview ? "is-preview" : "",
    navegable ? "is-clickable" : "",
    item.image && variant === "hero" ? "has-image" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // El acento del anunciante pisa al del tipo; sin ninguno, manda el tipo.
  const estilo = { "--ccard-accent": item.accent || info.accent };

  /* ── El bloque visual ──
     En hero es la foto de fondo; en compact y row, un cuadro con el logo del
     comercio o, si no hay, el ícono del tipo. El ícono nunca se saltea: una
     fila sin nada a la izquierda pierde el ancla vertical y la lista se lee
     como un bloque de texto. */
  const visual =
    variant === "hero" ? (
      item.image && (
        <img className="ccard__bg" src={item.image} alt="" loading="lazy" decoding="async" />
      )
    ) : (
      <span className="ccard__figure" aria-hidden="true">
        {item.sponsorLogo || item.image ? (
          <img
            className="ccard__logo"
            src={item.sponsorLogo || item.image}
            alt=""
            loading="lazy"
            decoding="async"
          />
        ) : (
          <Icon name={info.icon} size={variant === "compact" ? 18 : 17} />
        )}
      </span>
    );

  const contenido = (
    <>
      {visual}

      <span className="ccard__body">
        {(item.sponsored || showType || item.sponsorName) && (
          <span className="ccard__kicker">
            {/* El cartel va primero y sin eufemismos. Después, qué tipo de cosa
                es. Al revés, el rótulo del tipo se lee como si la app estuviera
                recomendando algo que en realidad se pagó. */}
            {item.sponsored ? (
              <span className="ccard__adtag">Publicidad</span>
            ) : (
              showType && (
                <>
                  <Icon name={info.icon} size={12} />
                  {info.label}
                </>
              )
            )}
            {item.sponsorName && <span className="ccard__by">{item.sponsorName}</span>}
          </span>
        )}

        <span className="ccard__title">{item.title || "Sin título"}</span>

        {item.summary && <span className="ccard__summary">{item.summary}</span>}

        {(meta || item.badge) && (
          <span className="ccard__meta">
            {meta && <span className="ccard__meta-text">{meta}</span>}
            {/* Lo que conviene saber ANTES de tocar: gratis, en inglés. */}
            {item.badge && <span className="ccard__badge">{item.badge}</span>}
          </span>
        )}

        {(navegable || preview) && (
          <span className="ccard__cta">
            {item.ctaLabel || info.cta}
            <Icon name="arrow-right" size={15} />
          </span>
        )}
      </span>
    </>
  );

  // Sin destino la tarjeta es informativa y no finge ser un botón: un control
  // que no hace nada al tocarlo es peor que no tener control.
  if (!navegable) {
    return (
      <article
        ref={innerRef}
        className={clases}
        style={estilo}
        aria-hidden={interactive ? undefined : "true"}
      >
        {contenido}
      </article>
    );
  }

  /**
   * ── EL ENLACE ES UN ENLACE ──────────────────────────────────────────────
   * Fue un <button> que llamaba a `window.open` en su handler, y falló de las
   * dos formas posibles: el conteo del clic corría ANTES de navegar, así que
   * cualquier error suyo se llevaba puesta la navegación; y `window.open` es
   * el patrón que bloquean navegadores y extensiones cuando la tarjeta,
   * además, dice "Publicidad". El resultado era el peor: tocás y no pasa nada.
   *
   * Un <a href> no depende de que corra JavaScript, y trae gratis lo que había
   * que programar: se ve a dónde va al pasar el mouse, se abre en pestaña
   * nueva con el botón del medio, y un lector de pantalla lo anuncia como
   * enlace. El conteo pasa a ser un efecto secundario: si falla, la persona
   * igual llega. Al revés no.
   */
  const registrar = () => onOpen?.(item);
  const etiqueta = `${item.title}${item.summary ? `. ${item.summary}` : ""}`;
  const interno = destino.startsWith("/");

  // Sin url pero con acción: la lección, que abre una hoja en vez de navegar.
  const hit = !destino ? (
    <button
      type="button"
      className="ccard__hit"
      onClick={() => {
        item.onOpen?.();
        registrar();
      }}
      tabIndex={interactive ? 0 : -1}
      aria-label={etiqueta}
    />
  ) : interno ? (
    <Link
      className="ccard__hit"
      to={destino}
      onClick={registrar}
      tabIndex={interactive ? 0 : -1}
      aria-label={etiqueta}
    />
  ) : (
    <a
      className="ccard__hit"
      href={destino}
      target="_blank"
      // `noopener` para que el sitio del anunciante no pueda tocar la pestaña de
      // la app. Sin `rel="sponsored"`: hay listas de bloqueo que apuntan a ese
      // valor, la app está detrás de un login —ningún buscador la ve— y ya
      // sabemos lo que cuesta nombrar algo como el ad-tech.
      rel="noopener noreferrer"
      onClick={registrar}
      tabIndex={interactive ? 0 : -1}
      aria-label={etiqueta}
    />
  );

  return (
    <article ref={innerRef} className={clases} style={estilo}>
      {/* Cubre la tarjeta entera. Va DEBAJO del contenido en el orden de
          apilado, así el texto se puede seleccionar y las imágenes se ven, pero
          cualquier toque cae acá. Antes sólo el botón "Ver más" llevaba a algún
          lado: un blanco de 100px en una tarjeta de 350. */}
      {hit}
      {contenido}
    </article>
  );
}
