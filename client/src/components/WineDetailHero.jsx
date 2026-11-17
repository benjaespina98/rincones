import Icon from "./Icon";
import WinePhoto from "./WinePhoto";
import { wineDisplayName } from "../utils/wineIdentity";
import { cssUrl } from "../utils/image";

/**
 * El encabezado de una ficha de vino: la botella grande, su nombre y su origen.
 *
 * ── POR QUÉ ES UN COMPONENTE ────────────────────────────────────────────────
 * Existen dos fichas —la del vino tuyo y la del catálogo— y son dos pantallas
 * distintas porque los datos y las acciones son distintos. Pero el encabezado
 * es el mismo, y estaba escrito dos veces: la del catálogo era una copia
 * recortada que se fue quedando atrás. No tenía el fondo ambiental, no tenía el
 * marco dorado de los vinos muy puntuados, y hasta hace dos commits tampoco
 * tenía el color del tipo. Nadie los rompió: se arreglaba uno y el otro seguía
 * como estaba, porque nada dice que son el mismo encabezado.
 *
 * ── LO QUE CAMBIA ENTRE LAS DOS, ENTRA POR PROPS ────────────────────────────
 * Las acciones de la esquina (`acciones`) y si la foto se puede ampliar
 * (`onAmpliar`). Nada más: todo lo demás se deriva del vino.
 *
 * ── EL FONDO ────────────────────────────────────────────────────────────────
 * Con foto, sale de la propia foto ampliada y desenfocada: el aire alrededor de
 * la botella pasa a ser el de su etiqueta y el borde se disuelve, en vez de
 * verse como un recorte pegado sobre un rectángulo de color. Sin foto, manda
 * `data-wine-type`. Las dos cosas apuntan a lo mismo — que el encabezado sea de
 * ESTE vino y no de la app.
 */
/**
 * El crédito de la foto, sólo en el visor a pantalla completa. Las fotos que no subió quien tiene el vino (las del pool
 * y las de la comunidad) son de las bodegas o de otras personas: se dice y se da un contacto para pedir que se retiren.
 */
const creditoDeFoto = (wine) =>
  wine?.imageSource === "pool" || wine?.imageSource === "community"
    ? "Foto de la bodega o de la comunidad. Para pedir que se retire: rincones.wines@gmail.com"
    : "";

export default function WineDetailHero({
  wine,
  /** Nodos para la esquina superior derecha: compartir, editar. */
  acciones,
  /** Si se pasa, la foto se vuelve un botón que la amplía. */
  onAmpliar,
  /** El marco dorado, reservado para los que puntuaste muy alto. */
  destacado = false,
}) {
  const nombre = wineDisplayName(wine);
  const foto = (
    <WinePhoto
      src={wine.image}
      type={wine.type}
      alt={nombre}
      artSize={220}
      fit="contain"
      marca={wine.winery || wine.name}
      priority
      className={destacado ? "wine-photo--gold" : ""}
    />
  );

  return (
    <div
      className={`wine-detail-hero ${wine.image ? "has-photo" : ""}`}
      data-wine-type={wine.type || undefined}
    >
      {wine.image && (
        <div
          className="wine-detail-hero__ambient"
          style={{ backgroundImage: cssUrl(wine.image) }}
          aria-hidden="true"
        />
      )}

      {wine.image && onAmpliar ? (
        <button
          type="button"
          className="wine-detail-hero__placeholder wine-detail-hero__photo-btn"
          onClick={() => onAmpliar({ src: wine.image, alt: nombre, caption: creditoDeFoto(wine) })}
          aria-label="Ampliar la foto del vino"
        >
          {foto}
          <span className="wine-detail-hero__zoom" aria-hidden="true">
            <Icon name="expand" size={14} />
          </span>
        </button>
      ) : (
        <div className="wine-detail-hero__placeholder">{foto}</div>
      )}

      {/* Sin medallas sobre la foto: "favorito" y "probado" ya están, con su
          palabra y a un toque de distancia, en la misma pantalla y sin
          scrollear. Eran los mismos dos estados dichos dos veces, y arriba en
          una versión que no se podía tocar. */}

      {acciones && <div className="wine-detail-hero__actions">{acciones}</div>}

      <div className="wine-detail-hero__overlay">
        {/* h2 y no h1: la barra superior (AppLayout) ya pone un h1 genérico
            ("Vino") en todas las fichas. Éste, con el nombre real, es el título
            que importa en la página, pero no puede ser un segundo h1. */}
        <h2 className="wine-detail-hero__name">{nombre}</h2>
        {/* Sólo la región. La bodega vive en la ficha de datos, donde tiene su
            rótulo y se lee sin competir con la foto. Si no hay región no se
            anuncia el hueco: la ficha de abajo ya ofrece completar los datos. */}
        {wine.region && <p className="wine-detail-hero__origin">{wine.region}</p>}
      </div>
    </div>
  );
}
