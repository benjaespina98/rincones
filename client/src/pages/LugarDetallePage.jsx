import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import MapaLugares from "../components/MapaLugares";
import { getLugarById } from "../services/lugaresApi";
import { formatearCategoria } from "../utils/categorias";
import StarRating from "../components/StarRating";

const LugarDetallePage = () => {
  const { id } = useParams();
  const [lugar, setLugar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadLugar = async () => {
      try {
        setLoading(true);
        setError("");
        const data = await getLugarById(id);
        setLugar(data);
      } catch (requestError) {
        setError("No se pudo cargar el detalle del lugar");
      } finally {
        setLoading(false);
      }
    };

    loadLugar();
  }, [id]);

  if (loading) {
    return <p>Cargando detalle...</p>;
  }

  if (error) {
    return <p className="error-text">{error}</p>;
  }

  if (!lugar) {
    return <p className="error-text">Lugar no encontrado.</p>;
  }

  const instagramHref = lugar.contacto?.instagram
    ? lugar.contacto.instagram.startsWith("http")
      ? lugar.contacto.instagram
      : `https://instagram.com/${lugar.contacto.instagram.replace(/^@/, "")}`
    : "";

  return (
    <section className="detail-page">
      <h1>{lugar.nombre}</h1>
      <p className="lead">{lugar.descripcion}</p>
      <div className="detail-meta">
        <span className="info-chip">Categoría: {formatearCategoria(lugar.categoria)}</span>
        <span className="info-chip">Ciudad: {lugar.ciudad}</span>
        <span className="info-chip">Dirección: {lugar.direccion}</span>
        <span className="info-chip">Rating: <StarRating value={lugar.rating || 0} size="sm" /></span>
      </div>

      {(lugar.contacto?.telefono || lugar.contacto?.instagram || lugar.contacto?.sitioWeb) && (
        <div className="detail-contact">
          <h2>Contacto</h2>
          <div className="detail-contact__grid">
            {lugar.contacto?.telefono && (
              <a href={`tel:${lugar.contacto.telefono}`} className="info-chip">
                Telefono: {lugar.contacto.telefono}
              </a>
            )}
            {lugar.contacto?.instagram && (
              <a href={instagramHref} target="_blank" rel="noreferrer" className="info-chip">
                Instagram: {lugar.contacto.instagram}
              </a>
            )}
            {lugar.contacto?.sitioWeb && (
              <a href={lugar.contacto.sitioWeb} target="_blank" rel="noreferrer" className="info-chip">
                Sitio web
              </a>
            )}
          </div>
        </div>
      )}

      {lugar.imagenes?.length > 0 && (
        <div className="detail-gallery">
          {lugar.imagenes.map((imagen, index) => (
            <img key={`${imagen}-${index}`} src={imagen} alt={`${lugar.nombre}-${index + 1}`} />
          ))}
        </div>
      )}

      <MapaLugares lugares={[lugar]} />
    </section>
  );
};

export default LugarDetallePage;
