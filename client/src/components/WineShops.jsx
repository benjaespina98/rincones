import TrackedCard from "./TrackedCard";
import "../styles/components/DiscoverSections.css";

/**
 * "Dónde comprar": dos o tres vinotecas, chicas.
 *
 * ── POR QUÉ ESTO REEMPLAZA AL CARRUSEL DE PUBLICIDAD ────────────────────────
 * El espacio comercial era un carrusel de tarjetas grandes con imagen de fondo:
 * un banner, con todo lo que eso implica —se lee como aviso, se saltea como
 * aviso, y hace que la pantalla entera se sienta vendida—. Y encima rotaba solo,
 * que es la razón por la que la gente odia los carruseles.
 *
 * Acá lo mismo se convierte en una UTILIDAD. La pregunta "¿dónde compro esto?"
 * es real y la app no la contestaba en ningún lado; contestarla con dos o tres
 * vinotecas es un servicio que además se puede vender. La tarjeta es chica a
 * propósito: si una vinoteca ocupa media pantalla, volvimos al banner.
 *
 * ── LO PATROCINADO SE DECLARA, Y NADA MÁS ───────────────────────────────────
 * Una tienda que paga y una que recomendamos se ven IGUAL salvo por un badge
 * chico que dice "Publicidad". No hay tarjeta más grande, ni color distinto, ni
 * posición garantizada visible: el orden lo decide `priority` en el server, que
 * es donde se pacta. Eso es lo que hace que la sección se lea como una lista de
 * lugares y no como un espacio comprado.
 *
 * Sin vinotecas al aire no hay hueco: la sección entera no se renderiza.
 */
export default function WineShops({ shops = [] }) {
  if (shops.length === 0) return null;

  return (
    <section className="dsec" aria-label="Dónde comprar">
      {/* "Dónde comprar" era el rótulo de una categoría; "Dónde conseguirlo"
          contesta la pregunta que deja la recomendación de arriba, que es para
          lo que esta sección existe. El pronombre la ata a la botella. */}
      <div className="dsec__head">
        <h2 className="dsec__title">Dónde conseguirlo</h2>
        <span className="dsec__hint">
          {shops.length === 1 ? "Una vinoteca para tener a mano" : "Vinotecas que valen el viaje"}
        </span>
      </div>

      {/* Grilla: en celular una columna, en pantalla ancha dos. Es la única
          sección con grilla porque es la única cuyas tarjetas son chicas por
          diseño — estirar una tarjeta compacta a 900px la deja hueca. */}
      {/* `showType={false}`: acá todo es una vinoteca, así que el rótulo por
          tarjeta repetiría el título de la sección. Lo que SÍ aparece es el
          cartel de "Publicidad" en las pagas — ése no se oculta nunca, y sin el
          rótulo del tipo al lado se lee todavía más claro. */}
      <div className="dsec__grid">
        {shops.map((shop) => (
          <TrackedCard key={shop.id} item={shop} variant="compact" showType={false} />
        ))}
      </div>
    </section>
  );
}
