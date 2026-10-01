import Icon from "./Icon";
import "./RespuestaAcciones.css";

/**
 * Lo que se puede hacer con una respuesta del Sommelier: decir si sirvió y pedir
 * otra.
 *
 * ── EL PULGAR ───────────────────────────────────────────────────────────────
 * Es la única señal de cuándo la guía se equivoca: sin esto, una respuesta mala
 * y una buena se ven igual desde adentro. Sólo aparece si la respuesta se
 * guardó en el historial (tiene `mensajeId`), porque el pulgar se apunta al
 * mensaje por su id. Tocar el mismo pulgar otra vez lo quita.
 *
 * ── "OTRA OPCIÓN" ───────────────────────────────────────────────────────────
 * Sólo en la ÚLTIMA respuesta: pedir otra a una de hace diez mensajes cambiaría
 * el pasado de la charla. Reemplaza la respuesta en su lugar; no agrega un turno
 * ni repite la pregunta.
 */
export default function RespuestaAcciones({ mensaje, esUltima, ocupado, onPulgar, onOtra }) {
  const puedeOpinar = Boolean(mensaje.mensajeId);
  if (!puedeOpinar && !esUltima) return null;

  return (
    <div className="resp-acciones">
      {puedeOpinar && (
        <>
          <button
            type="button"
            className={`resp-acciones__pulgar${mensaje.feedback === "up" ? " is-on" : ""}`}
            aria-pressed={mensaje.feedback === "up"}
            aria-label="Me sirvió"
            onClick={() => onPulgar(mensaje, "up")}
          >
            <Icon name="thumb-up" size={16} />
          </button>
          <button
            type="button"
            className={`resp-acciones__pulgar${mensaje.feedback === "down" ? " is-on is-down" : ""}`}
            aria-pressed={mensaje.feedback === "down"}
            aria-label="No me sirvió"
            onClick={() => onPulgar(mensaje, "down")}
          >
            <Icon name="thumb-down" size={16} />
          </button>
        </>
      )}
      {esUltima && (
        <button type="button" className="resp-acciones__otra" disabled={ocupado} onClick={onOtra}>
          <Icon name="refresh" size={14} />
          Otra opción
        </button>
      )}
    </div>
  );
}
