import TrackedCard from "./TrackedCard";
import "../styles/components/DiscoverSections.css";

/**
 * "Eventos destacados": UNA tarjeta grande, o nada.
 *
 * ── POR QUÉ UNA SOLA ────────────────────────────────────────────────────────
 * Porque es la única forma de que "destacado" signifique algo. El carrusel
 * anterior mostraba hasta seis con el mismo tamaño y la misma prominencia, y
 * cuando todo está destacado no hay nada destacado: la persona aprende que ese
 * bloque es "la parte de los avisos" y deja de mirarlo. Los eventos que no se
 * llevan este lugar no se pierden — caen al feed de "Aprendé y explorá", que es
 * donde un evento sin imagen se ve mejor de todos modos.
 *
 * ── POR QUÉ SE PUEDE QUEDAR VACÍA ───────────────────────────────────────────
 * Y por qué eso está bien: sin evento que califique, la sección no existe. Un
 * encabezado "Eventos destacados" sobre un espacio en blanco, o sobre una
 * tarjeta de relleno, es peor que no tener la sección. La regla de qué califica
 * está en `deservesHero` (contentTypes.js): imagen Y fecha, porque una tarjeta
 * grande sin imagen es un rectángulo con dos renglones en el medio.
 *
 * ── SE SIENTE CONTENIDO, NO PUBLICIDAD ──────────────────────────────────────
 * Un evento patrocinado entra acá igual que uno propio y con la misma tarjeta;
 * lo único que cambia es el badge. Eso es deliberado: una feria auspiciada
 * sigue siendo una feria a la que alguien puede querer ir, y esconderla o
 * marcarla como aviso le quita valor a algo que es genuinamente útil.
 */
export default function FeaturedEvent({ event }) {
  if (!event) return null;

  return (
    <section className="dsec" aria-label="Evento destacado">
      <div className="dsec__head">
        <h2 className="dsec__title">Eventos</h2>
      </div>

      <TrackedCard item={event} variant="hero" />
    </section>
  );
}
