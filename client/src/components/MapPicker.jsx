import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";

const defaultCenter = [-34.6037, -58.3816];

const ClickHandler = ({ onSelect }) => {
  useMapEvents({
    click(event) {
      onSelect(event.latlng);
    },
  });

  return null;
};

const MapPicker = ({ latitud, longitud, onSelect }) => {
  const hasPoint = Number.isFinite(latitud) && Number.isFinite(longitud);
  const center = hasPoint ? [latitud, longitud] : defaultCenter;

  return (
    <div className="map-picker">
      <MapContainer center={center} zoom={hasPoint ? 12 : 5} scrollWheelZoom className="map-container">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onSelect={onSelect} />
        {hasPoint && <Marker position={[latitud, longitud]} />}
      </MapContainer>
      <p className="map-help">Hace click en el mapa para definir la ubicacion exacta.</p>
    </div>
  );
};

export default MapPicker;
