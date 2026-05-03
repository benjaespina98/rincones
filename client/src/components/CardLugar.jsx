import React from "react";
import { Link } from "react-router-dom";
import { formatearCategoria } from "../utils/categorias";
import StarRating from "./StarRating";

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1200&q=80&auto=format&fit=crop";

const CardLugar = ({ lugar }) => {
  if (!lugar) {
    return null;
  }

  const imagen = lugar.imagenes?.[0] || FALLBACK_IMAGE;
  const descripcionCorta = lugar.descripcion?.length > 120 
    ? lugar.descripcion.substring(0, 120) + "..." 
    : lugar.descripcion;

  const handleImageError = (event) => {
    event.currentTarget.src = FALLBACK_IMAGE;
    event.currentTarget.style.objectFit = "cover";
  };

  return (
    <article className="card-lugar">
      <img
        src={imagen}
        alt={lugar.nombre || "Lugar"}
        className="card-lugar__image"
        loading="lazy"
        onError={handleImageError}
      />
      <div className="card-lugar__body">
        <span className="badge" title={lugar.categoria}>
          {formatearCategoria(lugar.categoria)}
        </span>
        <h3 className="card-lugar__title" title={lugar.nombre}>
          {lugar.nombre}
        </h3>
        <p className="card-lugar__description">
          {descripcionCorta}
        </p>
        <div className="card-lugar__meta">
          <span className="card-lugar__location" title={lugar.ciudad}>
            📍 {lugar.ciudad}
          </span>
          <StarRating value={lugar.rating || 0} size="sm" />
        </div>
        <Link 
          to={`/lugares/${lugar._id}`} 
          className="button button--ghost"
          style={{ marginTop: "var(--space-md)" }}
        >
          Ver detalle
        </Link>
      </div>
    </article>
  );
};

// Memoize to prevent unnecessary re-renders
export default React.memo(CardLugar);
