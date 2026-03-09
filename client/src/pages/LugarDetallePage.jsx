import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import MapaLugares from "../components/MapaLugares";
import { getLugarById } from "../services/lugaresApi";

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

  return (
    <section className="detail-page">
      <h1>{lugar.nombre}</h1>
      <p className="lead">{lugar.descripcion}</p>
      <div className="detail-meta">
        <span>Categoria: {lugar.categoria}</span>
        <span>Ciudad: {lugar.ciudad}</span>
        <span>Direccion: {lugar.direccion}</span>
        <span>Rating: {Number(lugar.rating || 0).toFixed(1)}</span>
      </div>

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
