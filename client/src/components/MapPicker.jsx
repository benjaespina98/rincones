import { useEffect, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import api from "../services/api";

const defaultCenter = [-34.6037, -58.3816];

const ClickHandler = ({ onSelect }) => {
  useMapEvents({
    click(event) {
      onSelect(event.latlng);
    },
  });

  return null;
};

const MapMover = ({ target }) => {
  const map = useMap();

  useEffect(() => {
    if (!target) {
      return;
    }

    map.flyTo([target.lat, target.lng], 13, {
      duration: 0.8,
    });
  }, [map, target]);

  return null;
};

const MapPicker = ({ latitud, longitud, onSelect }) => {
  const [query, setQuery] = useState("");
  const [searchError, setSearchError] = useState("");
  const [searching, setSearching] = useState(false);
  const [target, setTarget] = useState(null);
  const [suggestions, setSuggestions] = useState([]);

  const hasPoint = Number.isFinite(latitud) && Number.isFinite(longitud);
  const center = hasPoint ? [latitud, longitud] : defaultCenter;

  useEffect(() => {
    const normalized = query.trim();

    if (normalized.length < 3) {
      setSuggestions([]);
      setSearchError("");
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const response = await api.get("/geocode", {
          params: {
            q: normalized,
          },
        });

        setSuggestions(response.data?.suggestions || []);
      } catch {
        setSuggestions([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const applySuggestion = (suggestion) => {
    const found = {
      lat: Number(suggestion.latitud),
      lng: Number(suggestion.longitud),
    };

    if (!Number.isFinite(found.lat) || !Number.isFinite(found.lng)) {
      setSearchError("No se pudo interpretar la ubicacion encontrada.");
      return;
    }

    setTarget(found);
    onSelect(found);
    setQuery(suggestion.nombre || query);
    setSuggestions([]);
    setSearchError("");
  };

  const handleSearch = async () => {
    const normalized = query.trim();
    if (!normalized) {
      setSearchError("Escribe una direccion o lugar para buscar.");
      return;
    }

    try {
      setSearching(true);
      setSearchError("");

      const response = await api.get("/geocode", {
        params: {
          q: normalized,
        },
      });

      const primary = response.data?.data;
      if (!primary) {
        setSearchError("No encontramos resultados para esa busqueda.");
        return;
      }

      applySuggestion(primary);
    } catch {
      setSearchError("No se pudo encontrar esa ubicacion. Proba con una direccion mas precisa.");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="map-picker">
      <div className="map-search">
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (suggestions.length > 0) {
                applySuggestion(suggestions[0]);
              } else {
                handleSearch();
              }
            }
          }}
          placeholder="Buscar direccion o lugar (ej: Cafeteria Palermo)"
          aria-label="Buscar lugar en mapa"
        />
        <button className="button" type="button" onClick={handleSearch} disabled={searching}>
          {searching ? "Buscando..." : "Buscar"}
        </button>
      </div>

      {suggestions.length > 0 && (
        <ul className="map-suggestions" role="listbox" aria-label="Sugerencias de ubicacion">
          {suggestions.map((item, index) => (
            <li key={`${item.nombre}-${index}`}>
              <button type="button" onClick={() => applySuggestion(item)}>
                {item.nombre}
              </button>
            </li>
          ))}
        </ul>
      )}

      <MapContainer center={center} zoom={hasPoint ? 12 : 5} scrollWheelZoom className="map-container">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapMover target={target} />
        <ClickHandler onSelect={onSelect} />
        {hasPoint && <Marker position={[latitud, longitud]} />}
      </MapContainer>

      {searchError && <p className="error-text">{searchError}</p>}
      <p className="map-help">Hace click en el mapa para definir la ubicacion exacta.</p>
    </div>
  );
};

export default MapPicker;
