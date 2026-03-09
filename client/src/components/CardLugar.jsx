import { Link } from "react-router-dom";
import { formatearCategoria } from "../utils/categorias";

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1200&q=80&auto=format&fit=crop";

const CardLugar = ({ lugar }) => {
  const imagen = lugar.imagenes?.[0] || FALLBACK_IMAGE;

  return (
    <article className="card-lugar">
      <img
        src={imagen}
        alt={lugar.nombre}
        className="card-lugar__image"
        onError={(event) => {
          event.currentTarget.src = FALLBACK_IMAGE;
        }}
      />
      <div className="card-lugar__body">
        <span className="badge">{formatearCategoria(lugar.categoria)}</span>
        <h3 className="card-lugar__title">{lugar.nombre}</h3>
        <p className="card-lugar__description">{lugar.descripcion}</p>
        <div className="card-lugar__meta">
          <span>{lugar.ciudad}</span>
          <span>Rating: {Number(lugar.rating || 0).toFixed(1)}</span>
        </div>
        <Link to={`/lugares/${lugar._id}`} className="button button--ghost">
          Ver detalle
        </Link>
      </div>
    </article>
  );
};

export default CardLugar;
