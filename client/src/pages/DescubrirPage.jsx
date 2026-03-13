import { useEffect, useRef, useState } from "react";
import { askDiscoverAssistant, discoverExternalPlaces, reverseDiscoverLocation } from "../services/discoverApi";
import { formatearCategoria } from "../utils/categorias";
import { useAuth } from "../hooks/useAuth";
import StarRating from "../components/StarRating";

const QUICK_PROMPTS = [
  { text: "Ríos tranquilos para pasar la tarde", categoria: "rio" },
  { text: "Bares", categoria: "bar" },
  { text: "Cafeterías", categoria: "cafeteria" },
  { text: "Restaurantes", categoria: "restaurante" },
  { text: "Birra artesanal", categoria: "bar" },
  { text: "Bares de vermú", categoria: "bar" },
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

const shouldUseExtendedRadius = ({ categoria, query }) => {
  const normalizedCategoria = String(categoria || "").toLowerCase();
  const normalizedQuery = String(query || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (normalizedCategoria === "rio") {
    return true;
  }

  return /(rio|río|laguna|arroyo|balneario|costanera|cascada|dique|embalse)/.test(normalizedQuery);
};

const ZONA_PREFERENCE_KEY = "rincones_zona_preference";

const getInitialZona = () => {
  try {
    return String(localStorage.getItem(ZONA_PREFERENCE_KEY) || "").trim();
  } catch {
    return "";
  }
};

const DescubrirPage = () => {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [categoria, setCategoria] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState([]);
  const [location, setLocation] = useState(null);
  const [zona, setZona] = useState(getInitialZona);
  const [useCurrentLocation, setUseCurrentLocation] = useState(false);
  const [currentCoords, setCurrentCoords] = useState(null);
  const [locationStatus, setLocationStatus] = useState("");
  const [currentLocationLabel, setCurrentLocationLabel] = useState("Tu zona actual");
  const [discoverMeta, setDiscoverMeta] = useState({});
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantResult, setAssistantResult] = useState(null);
  const [resultView, setResultView] = useState("cards");
  const [visibleCount, setVisibleCount] = useState(6);
  const [brokenImages, setBrokenImages] = useState({});
  const resultsSectionRef = useRef(null);
  const requestTokenRef = useRef(0);
  const assistantContextRef = useRef({
    recentQueries: [],
    previousSummary: "",
    previousPickIds: [],
  });
  const fetchLimit = 18;

  const markImageAsBroken = (key) => {
    setBrokenImages((prev) => {
      if (prev[key]) {
        return prev;
      }

      return {
        ...prev,
        [key]: true,
      };
    });
  };

  const saveZonaPreference = (nextZona) => {
    try {
      localStorage.setItem(ZONA_PREFERENCE_KEY, String(nextZona || "").trim());
    } catch {
      // Ignore localStorage write errors.
    }
  };

  useEffect(() => {
    if (!navigator.geolocation) {
      return;
    }

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
          setLocationStatus("Usando tu ubicación actual.");
        } catch {
          setCurrentLocationLabel("Tu ubicación actual");
          setLocationStatus("Usando tu ubicación actual.");
        }
      },
      () => {
        setUseCurrentLocation(false);
        setLocationStatus("Elegí un barrio o ciudad para buscar.");
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 }
    );
  }, []);

  const performSearch = async ({ query: nextQuery, categoria: nextCategoria }) => {
    if (loading) {
      return;
    }

    const requestToken = ++requestTokenRef.current;

    const normalized = nextQuery.trim();
    if (normalized.length < 3) {
      setError("Escribí al menos 3 caracteres para buscar.");
      return;
    }

    if (!useCurrentLocation && zona.trim().length < 3) {
      setError("Indicá un barrio o ciudad para buscar, o usá tu ubicación actual.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setAssistantResult(null);
      setDiscoverMeta({});
      const response = await discoverExternalPlaces({
        query: normalized,
        categoria: nextCategoria,
        limit: fetchLimit,
        zona,
        radiusKm: useCurrentLocation ? (shouldUseExtendedRadius({ categoria: nextCategoria, query: normalized }) ? 80 : 12) : undefined,
        lat: useCurrentLocation ? currentCoords?.lat : undefined,
        lng: useCurrentLocation ? currentCoords?.lng : undefined,
      });

      if (requestToken !== requestTokenRef.current) {
        return;
      }

      const dedupedPlaces = dedupePlaces(response.places);
      setResults(dedupedPlaces);
      setVisibleCount(6);
      setResultView("cards");
      setLocation(response.location);
      setDiscoverMeta(response.meta || {});
      setBrokenImages({});

      const nextRecentQueries = [...assistantContextRef.current.recentQueries, normalized].slice(-6);

      setAssistantLoading(true);
      const assistant = await askDiscoverAssistant({
        message: normalized,
        zona,
        categoria: nextCategoria,
        lat: useCurrentLocation ? currentCoords?.lat : undefined,
        lng: useCurrentLocation ? currentCoords?.lng : undefined,
        radiusKm: useCurrentLocation ? (shouldUseExtendedRadius({ categoria: nextCategoria, query: normalized }) ? 80 : 12) : undefined,
        candidates: dedupedPlaces.slice(0, 12),
        context: {
          recentQueries: nextRecentQueries,
          previousSummary: assistantContextRef.current.previousSummary,
          previousPickIds: assistantContextRef.current.previousPickIds,
          locationMode: useCurrentLocation ? "current-location" : "manual-zone",
          locationLabel: useCurrentLocation ? currentLocationLabel : zona,
          discoverSources: Array.isArray(response.meta?.sourcesUsed) ? response.meta.sourcesUsed : [],
        },
      });

      if (requestToken !== requestTokenRef.current) {
        return;
      }

      setAssistantResult(assistant || null);
      assistantContextRef.current = {
        recentQueries: nextRecentQueries,
        previousSummary: String(assistant?.summary || "").trim(),
        previousPickIds: Array.isArray(assistant?.picks) ? assistant.picks.map((pick) => String(pick.id || "")).filter(Boolean).slice(0, 6) : [],
      };
    } catch (requestError) {
      if (requestToken !== requestTokenRef.current) {
        return;
      }

      const message = requestError.response?.data?.message || "No se pudieron buscar lugares externos.";
      setError(message);
      setResults([]);
      setLocation(null);
      setDiscoverMeta({});
      setAssistantResult(null);
    } finally {
      if (requestToken === requestTokenRef.current) {
        setAssistantLoading(false);
        setLoading(false);
      }
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

  const handleToggleLocationMode = () => {
    if (useCurrentLocation) {
      handleDisableCurrentLocation();
      return;
    }

    handleUseCurrentLocation();
  };

  const handleQuickPrompt = async (prompt) => {
    setQuery(prompt.text);
    setCategoria(prompt.categoria);
    await performSearch({
      query: prompt.text,
      categoria: prompt.categoria,
    });
  };

  const handleClearSearch = () => {
    requestTokenRef.current += 1;
    assistantContextRef.current = {
      recentQueries: [],
      previousSummary: "",
      previousPickIds: [],
    };
    setQuery("");
    setCategoria("all");
    setResults([]);
    setLocation(null);
    setDiscoverMeta({});
    setAssistantResult(null);
    setVisibleCount(6);
    setBrokenImages({});
    setError("");
  };

  const sourceLabels = Array.isArray(discoverMeta?.sourcesUsed) ? discoverMeta.sourcesUsed.join(" + ") : "";

  const toResultDomId = (id) => `discover-result-${String(id || "").replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  const handleAssistantPickFocus = (pickId) => {
    const idx = results.findIndex((item) => String(item.id) === String(pickId));
    if (idx === -1) {
      return;
    }

    setResultView("cards");
    setVisibleCount((prev) => Math.max(prev, idx + 1));

    setTimeout(() => {
      const target = document.getElementById(toResultDomId(pickId));
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.classList.add("external-card--pulse");
        setTimeout(() => target.classList.remove("external-card--pulse"), 1300);
      } else if (resultsSectionRef.current) {
        resultsSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 80);
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
              {useCurrentLocation ? "Mi zona" : "Barrio o ciudad"}: {useCurrentLocation ? currentLocationLabel : toShortZone(zona) || "Elegir"}
            </span>

            <div className="discover-intro__zone-actions">
              <button
                className="button button--ghost button--compact"
                type="button"
                onClick={handleToggleLocationMode}
              >
                {useCurrentLocation ? "Cambiar zona" : "Usar mi ubicación"}
              </button>
            </div>

            {!useCurrentLocation && (
              <div className="discover-intro__zone-editor">
                <input
                  value={zona}
                  onChange={(event) => {
                    const nextZona = event.target.value;
                    setZona(nextZona);
                    saveZonaPreference(nextZona);
                  }}
                  placeholder="Barrio o ciudad, ej: Palermo, Cerro, Buenos Aires"
                  aria-label="Barrio o ciudad donde buscar"
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
              }}
              placeholder="Preguntá por lugares: cafeterías cerca, bares con patio, ríos para mate..."
              aria-label="Buscar lugares en internet"
            />
            <button className="button button--violet" type="submit" disabled={loading}>
              {loading ? "Buscando..." : "Buscar"}
            </button>
            <button className="button button--ghost" type="button" onClick={handleClearSearch} disabled={!query && !results.length}>
              Limpiar
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
        <p className="map-help discover-location-status">
          Fuentes: {sourceLabels || "Fuentes públicas"}
          {discoverMeta?.aiReranked ? " · Ranking IA activo" : " · Ranking heurístico"}
        </p>
      )}

      {!error && (assistantLoading || assistantResult) && (
        <section className="discover-assistant" aria-label="Asistente de recomendaciones">
          <div className="discover-assistant__head">
            <h2>Asistente</h2>
            {!assistantLoading && assistantResult?.provider && (
              <span className="discover-assistant__provider">{assistantResult.aiEnabled ? `IA: ${assistantResult.provider}` : "Asistente local"}</span>
            )}
          </div>
          {assistantLoading && <p className="map-help">Pensando recomendaciones para vos...</p>}
          {!assistantLoading && assistantResult?.summary && <p>{assistantResult.summary}</p>}

          {!assistantLoading && Array.isArray(assistantResult?.tips) && assistantResult.tips.length > 0 && (
            <ul className="discover-assistant__tips">
              {assistantResult.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          )}

          {!assistantLoading && Array.isArray(assistantResult?.picks) && assistantResult.picks.length > 0 && (
            <div className="discover-assistant__picks">
              {assistantResult.picks.slice(0, 3).map((pick) => (
                <article key={pick.id} className="discover-assistant__pick">
                  {!!pick.foto && !brokenImages[`assistant-${pick.id}`] && (
                    <img
                      src={pick.foto}
                      alt={pick.nombre}
                      className="discover-assistant__pick-image"
                      loading="lazy"
                      onError={() => markImageAsBroken(`assistant-${pick.id}`)}
                    />
                  )}
                  <strong>{pick.nombre}</strong>
                  <small>
                    {pick.categoria || "Lugar"}
                    {Number.isFinite(pick.distanciaKm) ? ` · ${pick.distanciaKm} km` : ""}
                  </small>
                  <div className="discover-assistant__pick-actions">
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${pick.nombre} ${pick.direccion || ""}`)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="button button--violet"
                    >
                      Ir a Maps
                    </a>
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={() => handleAssistantPickFocus(pick.id)}
                    >
                      Ver en resultados
                    </button>
                    {pick.osmUrl && (
                      <a href={pick.osmUrl} target="_blank" rel="noreferrer" className="button button--ghost">
                        Más info
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {!loading && !error && results.length > 0 && (
        <section ref={resultsSectionRef} className="discover-results-shell" aria-label="Resultados">
          <div className="discover-results-head">
            <p className="discover-note">Lugares combinados de comunidad y fuentes abiertas.</p>
            <div className="discover-results-tabs" role="tablist" aria-label="Cambiar vista de resultados">
              <button
                type="button"
                role="tab"
                aria-selected={resultView === "cards"}
                className={`discover-results-tab ${resultView === "cards" ? "discover-results-tab--active" : ""}`}
                onClick={() => setResultView("cards")}
              >
                Tarjetas
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={resultView === "list"}
                className={`discover-results-tab ${resultView === "list" ? "discover-results-tab--active" : ""}`}
                onClick={() => setResultView("list")}
              >
                Lista
              </button>
            </div>
          </div>

          {resultView === "cards" ? (
            <section className="external-grid" aria-label="Resultados en tarjetas">
              {results.slice(0, visibleCount).map((item) => {
                const visual = getCategoryVisual(item.categoria);
                const isCommunity = String(item.fuente || "").toLowerCase().includes("comunidad");

                return (
                  <article id={toResultDomId(item.id)} key={item.id} className={`external-card ${item.foto ? "" : "external-card--no-image"}`}>
                    <div className="external-card__image-wrap">
                      {item.foto && !brokenImages[`result-${item.id}`] ? (
                        <img
                          src={item.foto}
                          alt={item.nombre}
                          className="external-card__image"
                          loading="lazy"
                          onError={() => markImageAsBroken(`result-${item.id}`)}
                        />
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
                      <small>Score {item.ratingAproximado || 0}</small>
                    </div>
                    <p className="external-card__address">{item.direccion || item.ciudad || "Dirección no disponible"}</p>
                    <div className="external-card__meta">
                      <small>
                        {Number.isFinite(item.distanciaKm) ? `A ${item.distanciaKm} km` : "Distancia no disponible"}
                      </small>
                      <div className="external-card__actions">
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                            `${item.nombre} ${item.direccion || item.ciudad || ""}`
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          className="button button--violet"
                        >
                          Ver en Maps
                        </a>
                        {item.contacto?.instagramUrl && (
                          <a href={item.contacto.instagramUrl} target="_blank" rel="noreferrer" className="button button--ghost">
                            Instagram
                          </a>
                        )}
                        {item.osmUrl && (
                          <a href={item.osmUrl} target="_blank" rel="noreferrer" className="button button--ghost">
                            Fuente
                          </a>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          ) : (
            <section className="discover-list" aria-label="Resultados en lista">
              {results.slice(0, visibleCount).map((item) => {
                const isCommunity = String(item.fuente || "").toLowerCase().includes("comunidad");
                const visual = getCategoryVisual(item.categoria);

                return (
                  <article id={toResultDomId(item.id)} key={`list-${item.id}`} className="discover-list-item">
                    <div className="discover-list-item__main">
                      <span className="discover-list-item__icon" aria-hidden="true">
                        {visual.icon}
                      </span>
                      <div>
                        <strong className="discover-list-item__title">{item.nombre}</strong>
                        <p className="discover-list-item__address">{item.direccion || item.ciudad || "Dirección no disponible"}</p>
                        <div className="discover-list-item__meta">
                          <span className={`source-badge ${isCommunity ? "source-badge--community" : "source-badge--external"}`}>
                            {isCommunity ? "Comunidad" : "Externo"}
                          </span>
                          <span className="badge">{formatearCategoria(item.categoria)}</span>
                          <small>{Number.isFinite(item.distanciaKm) ? `A ${item.distanciaKm} km` : "Distancia no disponible"}</small>
                        </div>
                      </div>
                    </div>

                    <div className="discover-list-item__actions">
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          `${item.nombre} ${item.direccion || item.ciudad || ""}`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="button button--violet"
                      >
                        Ver en Maps
                      </a>
                      {item.contacto?.instagramUrl && (
                        <a href={item.contacto.instagramUrl} target="_blank" rel="noreferrer" className="button button--ghost">
                          Instagram
                        </a>
                      )}
                    </div>
                  </article>
                );
              })}
            </section>
          )}

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
        </section>
      )}

      {!loading && !error && query.trim().length >= 3 && results.length === 0 && (
        <div className="discover-empty">
          <p>No encontramos resultados. Probá cambiar la zona o usar una sugerencia rápida.</p>
          <button type="button" className="button button--ghost" onClick={() => handleQuickPrompt(QUICK_PROMPTS[2])}>
            Probar "Cafeterías cerca"
          </button>
        </div>
      )}
    </section>
  );
};

export default DescubrirPage;
