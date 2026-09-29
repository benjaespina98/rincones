import { useState } from "react";
import Icon from "./Icon";
import "./CollapsibleSection.css";

/**
 * Una sección que se abre.
 *
 * ── POR QUÉ ES UN COMPONENTE Y NO UN <details> ──────────────────────────────
 * Porque hacía falta el `hint`: el renglón que dice qué hay adentro sin abrirlo
 * ("3 opiniones", "Promedio de 12 personas"). Sin eso, plegar información es
 * esconderla — la persona tiene que abrir cada sección para averiguar si le
 * interesa, y termina abriendo todas, que es peor que no haber plegado nada.
 *
 * ── DÓNDE SE USA Y DÓNDE NO ─────────────────────────────────────────────────
 * En la ficha del vino, para lo que es MATERIAL DE CONSULTA: lo que opinan otros
 * y el precio de referencia. Son cosas ciertas y útiles que casi nadie mira en
 * los primeros cinco segundos, y que estiraban la ficha a tres pantallas.
 *
 * No se usa para nada que sea del usuario ni accionable. Tu puntuación, tus
 * notas y tus momentos quedan a la vista: plegar lo propio comunica que es
 * secundario, y en esta app es exactamente al revés.
 */
export default function CollapsibleSection({
  title,
  icon,
  hint,
  children,
  defaultOpen = false,
  id,
}) {
  const [abierto, setAbierto] = useState(defaultOpen);
  const panelId = id ? `${id}-panel` : undefined;

  return (
    <section className={`collapsible ${abierto ? "is-open" : ""}`}>
      <button
        type="button"
        className="collapsible__head"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-controls={panelId}
      >
        <span className="collapsible__title">
          {icon && <Icon name={icon} size={16} />}
          {title}
        </span>
        {/* El resumen sigue visible con la sección cerrada: es lo que permite
            decidir si vale la pena abrirla. */}
        {hint && <span className="collapsible__hint">{hint}</span>}
        <Icon
          name="chevron-down"
          size={18}
          className="collapsible__caret"
        />
      </button>

      {/* Se anima con grid-template-rows (0fr → 1fr) en vez de aparecer de
          golpe: es el mismo gesto de abrir/cerrar en toda la app (ver también
          WineAbout), y sin él plegar una sección se sentía como un salto, no
          como un movimiento. El contenido queda siempre montado —no cuesta
          nada, lo que hay adentro ya se pidió antes de llegar acá— así que la
          altura real existe para que el navegador la pueda animar. */}
      {/* Tres capas y no dos, y la del medio no es decorativa: `__panel` es lo
          que el grid encoge a cero y por eso tiene que ser una caja vacía —el
          relleno va en `__panel-inner`, o queda asomando por debajo del
          encabezado cuando la sección está cerrada. Ver CollapsibleSection.css. */}
      <div className="collapsible__panel-wrap" aria-hidden={!abierto}>
        <div className="collapsible__panel" id={panelId}>
          <div className="collapsible__panel-inner">
          {children}

          {/* El camino de vuelta, al final de lo que se abrió.
              El encabezado también cierra, pero con la sección abierta queda
              arriba del contenido: hay que scrollear hacia atrás para encontrar
              el mismo botón que se acaba de tocar. Cerrar tiene que costar lo
              mismo que abrir, y desde donde quedaste. */}
          <button
            type="button"
            className="collapsible__close"
            tabIndex={abierto ? 0 : -1}
            onClick={() => setAbierto(false)}
          >
            <Icon name="chevron-up" size={15} />
            Cerrar {String(title).toLowerCase()}
          </button>
          </div>
        </div>
      </div>
    </section>
  );
}
