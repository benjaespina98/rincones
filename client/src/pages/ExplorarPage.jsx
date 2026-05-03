import { useEffect, useMemo, useState } from "react";
import ListaLugares from "../components/ListaLugares";
import MapaLugares from "../components/MapaLugares";
import { useLugares } from "../hooks/useLugares";
import { haversineDistanceKm } from "../utils/geo";
import { categorias } from "../utils/categorias";
import { getSuggestedCategories, rankLugaresBySmartQuery } from "../utils/busquedaInteligente";

const ExplorarPage = () => {
  const { lugares, loading, error } = useLugares();
  const [smartQuery, setSmartQuery] = useState("");
  const [cityQuery, setCityQuery] = useState("");
  const [categoriaQuery, setCategoriaQuery] = useState("all");
  const [userCoords, setUserCoords] = useState(null);
  const [geoError, setGeoError] = useState("");
  const [useNearby, setUseNearby] = useState(false);
  const [radiusKm, setRadiusKm] = useState(120);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError("Tu navegador no soporta geolocalización.");
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
        setGeoError("No se pudo obtener tu ubicación.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const suggestedCategorias = useMemo(() => getSuggestedCategories(smartQuery), [smartQuery]);

  const lugaresFiltrados = useMemo(() => {
    let list = [...lugares];

    if (smartQuery.trim()) {
      list = rankLugaresBySmartQuery(list, smartQuery);
    }

    if (cityQuery.trim()) {
      const normalized = cityQuery.trim().toLowerCase();
      list = list.filter((lugar) => String(lugar.ciudad || "").toLowerCase().includes(normalized));
    }

    if (categoriaQuery !== "all") {
      list = list.filter((lugar) => String(lugar.categoria || "").toLowerCase() === categoriaQuery);
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
  }, [lugares, smartQuery, cityQuery, categoriaQuery, useNearby, userCoords, radiusKm]);

  return (
    <section>
      <header className="page-header search-hero">
        <span className="page-kicker">Comunidad del vino</span>
        <h1>Lugares y experiencias cargadas por admins</h1>
        <p className="lead">
          Acá ves vinotecas, wine bars, bodegas y degustaciones curadas por el equipo. Podés filtrar por ciudad, categoría o cercanía.
        </p>

        <label className="search-hero__input-wrap">
          <input
            value={smartQuery}
            onChange={(event) => setSmartQuery(event.target.value)}
            placeholder="Buscar entre lugares y experiencias de vino"
          />
        </label>

        <div className="search-hero__meta">
          <div className="info-chip">{lugaresFiltrados.length} resultados</div>
          {(cityQuery || categoriaQuery !== "all" || useNearby) && (
            <button
              className="button button--ghost"
              type="button"
              onClick={() => {
                setCityQuery("");
                setCategoriaQuery("all");
                setUseNearby(false);
                setRadiusKm(120);
              }}
            >
              Limpiar filtros
            </button>
          )}
        </div>
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

        <label>
          Categoría
          <select value={categoriaQuery} onChange={(event) => setCategoriaQuery(event.target.value)}>
            <option value="all">Todas</option>
            {categorias.map((categoria) => (
              <option key={categoria.value} value={categoria.value}>
                {categoria.label}
              </option>
            ))}
          </select>
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

      {!!suggestedCategorias.length && (
        <div className="ai-suggestions">
          <span className="ai-suggestions__label">Sugerencias IA</span>
          <div className="ai-suggestions__chips">
            {suggestedCategorias.map((categoriaValue) => {
              const categoria = categorias.find((item) => item.value === categoriaValue);
              if (!categoria) {
                return null;
              }

              return (
                <button
                  key={categoria.value}
                  type="button"
                  className={`ai-chip ${categoriaQuery === categoria.value ? "ai-chip--active" : ""}`}
                  onClick={() => setCategoriaQuery(categoria.value)}
                >
                  {categoria.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

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
