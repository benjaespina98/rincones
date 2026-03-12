import { useEffect, useMemo, useState } from "react";
import ListaLugares from "../components/ListaLugares";
import MapaLugares from "../components/MapaLugares";
import { useLugares } from "../hooks/useLugares";
import { haversineDistanceKm } from "../utils/geo";

const ExplorarPage = () => {
  const { lugares, loading, error } = useLugares();
  const [cityQuery, setCityQuery] = useState("");
  const [userCoords, setUserCoords] = useState(null);
  const [geoError, setGeoError] = useState("");
  const [useNearby, setUseNearby] = useState(false);
  const [radiusKm, setRadiusKm] = useState(120);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError("Tu navegador no soporta geolocalizacion.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setUseNearby(true);
      },
      () => {
        setGeoError("No se pudo obtener tu ubicacion.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const lugaresFiltrados = useMemo(() => {
    let list = [...lugares];

    if (cityQuery.trim()) {
      const normalized = cityQuery.trim().toLowerCase();
      list = list.filter((lugar) => String(lugar.ciudad || "").toLowerCase().includes(normalized));
    }

    if (useNearby && userCoords) {
      list = list
        .map((lugar) => ({
          ...lugar,
          _distanceKm: haversineDistanceKm(userCoords, {
            lat: lugar.ubicacion?.latitud,
            lng: lugar.ubicacion?.longitud,
          }),
        }))
        .filter((lugar) => Number.isFinite(lugar._distanceKm) && lugar._distanceKm <= radiusKm)
        .sort((a, b) => a._distanceKm - b._distanceKm);
    }

    return list;
  }, [lugares, cityQuery, useNearby, userCoords, radiusKm]);

  return (
    <section>
      <header className="page-header page-header--compact">
        <span className="page-kicker">Mapa interactivo</span>
        <h1>Explorar lugares</h1>
        <p className="lead">Filtra por ciudad o cercanía a tu ubicación para descubrir lugares relevantes.</p>
        <div className="info-chip">{lugaresFiltrados.length} resultados</div>
      </header>

      <div className="explore-filters">
        <label>
          Ciudad
          <input
            value={cityQuery}
            onChange={(event) => setCityQuery(event.target.value)}
            placeholder="Buscar por ciudad"
          />
        </label>

        <label className="toggle-control">
          <input
            type="checkbox"
            checked={useNearby}
            onChange={(event) => setUseNearby(event.target.checked)}
            disabled={!userCoords}
          />
          <span>Mostrar cercanos a mi ubicación</span>
        </label>

        {useNearby && (
          <label>
            Radio (km)
            <input
              type="range"
              min="20"
              max="300"
              step="10"
              value={radiusKm}
              onChange={(event) => setRadiusKm(Number(event.target.value))}
            />
            <small>{radiusKm} km</small>
          </label>
        )}
      </div>

      {geoError && <p className="error-text">{geoError}</p>}

      {loading && <p>Cargando lugares...</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && (
        <>
          <MapaLugares lugares={lugaresFiltrados} />
          <ListaLugares lugares={lugaresFiltrados} />
        </>
      )}
    </section>
  );
};

export default ExplorarPage;
