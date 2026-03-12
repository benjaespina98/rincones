import { useState } from "react";
import { discoverExternalPlaces, reverseDiscoverLocation } from "../services/discoverApi";
import { categorias, formatearCategoria } from "../utils/categorias";
import { useAuth } from "../hooks/useAuth";
import StarRating from "../components/StarRating";

const QUICK_PROMPTS = [
  { text: "Ríos tranquilos para pasar la tarde", categoria: "rio" },
  { text: "Bares para ir de noche en Córdoba", categoria: "bar" },
  { text: "Cafeterías lindas para merendar", categoria: "cafeteria" },
  { text: "Restaurantes recomendados en Córdoba", categoria: "restaurante" },
  { text: "Birra artesanal en Córdoba", categoria: "bar" },
  { text: "Bares de vermú en Córdoba", categoria: "bar" },
];

const CATEGORY_VISUALS = {
  rio: { icon: "~", label: "Naturaleza" },
  montana: { icon: "^", label: "Aventura" },
  bar: { icon: "*", label: "Noche" },
  cafeteria: { icon: "+", label: "Cafe" },
  restaurante: { icon: "#", label: "Comer" },
  mirador: { icon: "^", label: "Vistas" },
  turistico: { icon: "o", label: "Paseo" },
};

const toShortZone = (value = "") => {
  const parts = String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!parts.length) {
    return "";
  }

  const compact = parts.slice(0, 2).join(", ");
  return compact.length > 44 ? `${compact.slice(0, 44)}...` : compact;
};

const normalizeForDedupe = (value = "") =>
  String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const dedupePlaces = (places = []) => {
  const unique = [];

  places.forEach((item) => {
    const name = normalizeForDedupe(item?.nombre);
    const address = normalizeForDedupe(item?.direccion || item?.ciudad || "");
    const lat = Number(item?.ubicacion?.latitud);
    const lng = Number(item?.ubicacion?.longitud);
    const byNameAddress = `${name}|${address}`;
    const byNameCoords = Number.isFinite(lat) && Number.isFinite(lng) ? `${name}|${lat.toFixed(3)}|${lng.toFixed(3)}` : "";

    const duplicate = unique.some((existing) => {
      const existingName = normalizeForDedupe(existing?.nombre);
      const existingAddress = normalizeForDedupe(existing?.direccion || existing?.ciudad || "");
      const existingLat = Number(existing?.ubicacion?.latitud);
      const existingLng = Number(existing?.ubicacion?.longitud);
      const existingByNameAddress = `${existingName}|${existingAddress}`;
      const existingByNameCoords =
        Number.isFinite(existingLat) && Number.isFinite(existingLng)
          ? `${existingName}|${existingLat.toFixed(3)}|${existingLng.toFixed(3)}`
          : "";

      return byNameAddress === existingByNameAddress || (byNameCoords && byNameCoords === existingByNameCoords);
    });

    if (!duplicate) {
      unique.push(item);
    }
  });

  return unique;
};

const getCategoryVisual = (categoria) => CATEGORY_VISUALS[categoria] || { icon: "o", label: "Lugar" };

const DescubrirPage = () => {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [categoria, setCategoria] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState([]);
  const [location, setLocation] = useState(null);
  const [zona, setZona] = useState("Córdoba");
  const [editingZona, setEditingZona] = useState(false);
  const [useCurrentLocation, setUseCurrentLocation] = useState(false);
  const [currentCoords, setCurrentCoords] = useState(null);
  const [locationStatus, setLocationStatus] = useState("");
  const [currentLocationLabel, setCurrentLocationLabel] = useState("Córdoba");
  const [searchRadiusKm, setSearchRadiusKm] = useState(8);
  const [visibleCount, setVisibleCount] = useState(6);
  const fetchLimit = 18;

  const performSearch = async ({ query: nextQuery, categoria: nextCategoria }) => {
    const normalized = nextQuery.trim();
    if (normalized.length < 3) {
      setError("Escribí al menos 3 caracteres para buscar.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      const response = await discoverExternalPlaces({
        query: normalized,
        categoria: nextCategoria,
        limit: fetchLimit,
        zona,
        radiusKm: useCurrentLocation ? searchRadiusKm : undefined,
        lat: useCurrentLocation ? currentCoords?.lat : undefined,
        lng: useCurrentLocation ? currentCoords?.lng : undefined,
      });
      setResults(dedupePlaces(response.places));
      setVisibleCount(6);
      setLocation(response.location);
    } catch (requestError) {
      const message = requestError.response?.data?.message || "No se pudieron buscar lugares externos.";
      setError(message);
      setResults([]);
      setLocation(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (event) => {
    event.preventDefault();
    await performSearch({ query, categoria });
  };

  const handleUseCurrentLocation = () => {
    if (currentCoords) {
      setUseCurrentLocation(true);
      setLocationStatus("Priorizando resultados cerca tuyo.");
      return;
    }

    if (!navigator.geolocation) {
      setError("Tu navegador no soporta geolocalización.");
      return;
    }

    setError("");
    setLocationStatus("Obteniendo ubicación actual...");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        setCurrentCoords({ lat, lng });
        setUseCurrentLocation(true);

        try {
          const resolved = await reverseDiscoverLocation({ lat, lng });
          if (resolved?.nombre) {
            const shortZone = toShortZone(resolved.nombre);
            setZona(shortZone);
            setCurrentLocationLabel(shortZone);
          } else {
            setCurrentLocationLabel("Tu ubicación actual");
          }
          setLocationStatus("Ubicación actual activada. Priorizando lugares cerca tuyo.");
        } catch {
          setCurrentLocationLabel("Tu ubicación actual");
          setLocationStatus("Ubicación actual activada. Priorizando lugares cerca tuyo.");
        }
      },
      () => {
        setLocationStatus("");
        setError("No pudimos obtener tu ubicación. Probá permitiendo el acceso del navegador.");
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  const handleDisableCurrentLocation = () => {
    setUseCurrentLocation(false);
    setLocationStatus("");
  };

  const handleQuickPrompt = async (prompt) => {
    setQuery(prompt.text);
    setCategoria(prompt.categoria);
    await performSearch({
      query: prompt.text,
      categoria: prompt.categoria,
    });
  };

  return (
    <section className="discover-shell">
      <header className="discover-intro">
        <div className="discover-intro__row">
          <div>
            <p className="discover-intro__hello">✦ Hola{user?.email ? `, ${user.email.split("@")[0]}` : ""}</p>
            <h1>¿Por dónde empezamos?</h1>
          </div>

          <div className="discover-intro__zone-tools" aria-label="Controles de zona">
            <span className="discover-location-hint discover-location-hint--subtle">
              {useCurrentLocation ? "Mi zona" : "Zona"}: {useCurrentLocation ? currentLocationLabel : toShortZone(zona)}
            </span>

            <div className="discover-intro__zone-actions">
              <button className="button button--ghost button--compact" type="button" onClick={handleUseCurrentLocation}>
                Mi ubicación
              </button>

              <button
                className="button button--ghost button--compact"
                type="button"
                onClick={() => setEditingZona((prev) => !prev)}
              >
                {editingZona ? "Ocultar" : "Cambiar zona"}
              </button>

              {useCurrentLocation && (
                <button className="button button--ghost button--compact" type="button" onClick={handleDisableCurrentLocation}>
                  Manual
                </button>
              )}
            </div>

            {useCurrentLocation && (
              <div className="discover-radius-switch" aria-label="Alcance de búsqueda cerca mío">
                {[6, 12, 25].map((radius) => (
                  <button
                    key={radius}
                    type="button"
                    className={`discover-radius-chip ${searchRadiusKm === radius ? "discover-radius-chip--active" : ""}`}
                    onClick={() => setSearchRadiusKm(radius)}
                  >
                    {radius} km
                  </button>
                ))}
              </div>
            )}

            {editingZona && (
              <div className="discover-intro__zone-editor">
                <input
                  value={zona}
                  onChange={(event) => {
                    setZona(event.target.value);
                    if (useCurrentLocation) {
                      setUseCurrentLocation(false);
                      setLocationStatus("Usando zona manual.");
                    }
                  }}
                  placeholder="Ej: Córdoba, Palermo, Mendoza"
                  aria-label="Zona donde buscar"
                />
              </div>
            )}
          </div>
        </div>
      </header>

      <section className="discover-prompt-card" aria-label="Buscador principal">
        <form className="discover-chat" onSubmit={handleSearch}>
          <div className="discover-chat__prompt-row">
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                if (categoria !== "all") {
                  setCategoria("all");
                }
              }}
              placeholder="Preguntá por lugares: ríos para mate, bares en Córdoba, cafeterías con patio..."
              aria-label="Buscar lugares en internet"
            />
            <button className="button button--violet" type="submit" disabled={loading}>
              {loading ? "Buscando..." : "Buscar"}
            </button>
          </div>

          {locationStatus && <p className="map-help discover-location-status">{locationStatus}</p>}
        </form>

        <div className="discover-quick-grid" aria-label="Sugerencias rápidas">
          {QUICK_PROMPTS.map((item) => (
            <button
              key={item.text}
              type="button"
              className="discover-quick-chip"
              onClick={() => handleQuickPrompt(item)}
            >
              {item.text}
            </button>
          ))}
        </div>
      </section>

      {error && <p className="error-text">{error}</p>}

      {!loading && !error && location && (
        <p className="map-help discover-location-status">
          Resultados en zona: {toShortZone(location.nombre)}
        </p>
      )}

      {!loading && !error && results.length > 0 && (
        <>
          <p className="discover-note">
            Mezclamos lugares de la Comunidad Rincones y fuentes abiertas (OpenStreetMap). El puntaje es una señal de relevancia, no reviews verificadas.
          </p>
          <section className="external-grid" aria-label="Resultados externos">
          {results.slice(0, visibleCount).map((item) => {
            const visual = getCategoryVisual(item.categoria);
            const isCommunity = String(item.fuente || "").toLowerCase().includes("comunidad");

            return (
            <article key={item.id} className={`external-card ${item.foto ? "" : "external-card--no-image"}`}>
              <div className="external-card__image-wrap">
                {item.foto ? (
                  <img src={item.foto} alt={item.nombre} className="external-card__image" loading="lazy" />
                ) : (
                  <div className="external-card__image external-card__image--placeholder" aria-hidden="true">
                    <div className="external-card__placeholder-main">
                      <span className="external-card__placeholder-icon">{visual.icon}</span>
                      <strong>{visual.label}</strong>
                    </div>
                  </div>
                )}
              </div>
              <div className="external-card__head">
                <strong>{item.nombre}</strong>
                <div className="external-card__badges">
                  <span className={`source-badge ${isCommunity ? "source-badge--community" : "source-badge--external"}`}>
                    {isCommunity ? "Comunidad" : "Externo"}
                  </span>
                  <span className="badge">{formatearCategoria(item.categoria)}</span>
                </div>
              </div>
              <div className="external-card__rating">
                <StarRating value={item.ratingAproximado || 0} size="sm" />
                <small>Puntaje estimado {item.ratingAproximado || 0} / Relevancia {item.relevancia || 0}</small>
              </div>
              <p>{item.direccion || item.ciudad || "Dirección no disponible"}</p>
              {Number.isFinite(item.distanciaKm) && (
                <small className="map-help">A {item.distanciaKm} km aprox.</small>
              )}
              <div className="external-card__meta">
                <small>{item.fuente}</small>
                <div className="external-card__actions">
                  {item.contacto?.instagramUrl && (
                    <a href={item.contacto.instagramUrl} target="_blank" rel="noreferrer" className="button button--ghost">
                      Instagram
                    </a>
                  )}
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      Number.isFinite(item.ubicacion?.latitud) && Number.isFinite(item.ubicacion?.longitud)
                        ? `${item.ubicacion.latitud},${item.ubicacion.longitud}`
                        : `${item.nombre} ${item.direccion || item.ciudad || ""}`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="button button--ghost"
                  >
                    Abrir en Maps
                  </a>
                  {item.osmUrl && (
                    <a href={item.osmUrl} target="_blank" rel="noreferrer" className="button button--ghost">
                      Ver fuente
                    </a>
                  )}
                </div>
              </div>
            </article>
            );
          })}
          </section>

          {results.length > visibleCount && (
            <div className="external-grid__footer">
              <button
                className="button button--ghost"
                type="button"
                onClick={() => setVisibleCount((prev) => prev + 6)}
              >
                Mostrar más
              </button>
              <small className="map-help">Mostrando {Math.min(visibleCount, results.length)} de {results.length} resultados</small>
            </div>
          )}
        </>
      )}

      {!loading && !error && query.trim().length >= 3 && results.length === 0 && (
        <p>No encontramos resultados. Probá con otra ciudad o una categoría distinta.</p>
      )}
    </section>
  );
};

export default DescubrirPage;
