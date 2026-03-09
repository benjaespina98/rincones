import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import { Link } from "react-router-dom";

const defaultCenter = [-34.6037, -58.3816];

const MapaLugares = ({ lugares }) => {
  const lugaresConUbicacion = lugares.filter(
    (lugar) => lugar.ubicacion && Number.isFinite(lugar.ubicacion.latitud) && Number.isFinite(lugar.ubicacion.longitud)
  );

  if (!lugaresConUbicacion.length) {
    return <p>No hay ubicaciones para mostrar en el mapa.</p>;
  }

  return (
    <div className="map-wrapper">
      <MapContainer center={defaultCenter} zoom={5} scrollWheelZoom className="map-container">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {lugaresConUbicacion.map((lugar) => (
          <Marker key={lugar._id} position={[lugar.ubicacion.latitud, lugar.ubicacion.longitud]}>
            <Popup>
              <strong>{lugar.nombre}</strong>
              <br />
              {lugar.ciudad}
              <br />
              <Link to={`/lugares/${lugar._id}`}>Ver detalle</Link>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default MapaLugares;
