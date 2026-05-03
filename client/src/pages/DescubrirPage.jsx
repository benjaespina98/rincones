import { useEffect, useRef, useState } from "react";
import { askDiscoverAssistant, discoverExternalPlaces, reverseDiscoverLocation } from "../services/discoverApi";
import { formatearCategoria } from "../utils/categorias";
import { useAuth } from "../hooks/useAuth";
import StarRating from "../components/StarRating";
import LabelScanner from "../components/LabelScanner";

const QUICK_PROMPTS = [
  { text: "Wine bars con copas por menos de 9000", categoria: "winebar" },
  { text: "Vinotecas con buena selección de malbec", categoria: "vinoteca" },
  { text: "Degustaciones para hoy a la noche", categoria: "degustacion" },
  { text: "Bodegas para visitar cerca", categoria: "bodega" },
];

const CATEGORY_VISUALS = {
  vinoteca: { icon: "o", label: "Vinoteca" },
  winebar: { icon: "*", label: "Wine Bar" },
  degustacion: { icon: "+", label: "Degustación" },
  bodega: { icon: "^", label: "Bodega" },
  feria_vino: { icon: "#", label: "Feria" },
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

  if (["rio", "bodega"].includes(normalizedCategoria)) {
    return true;
  }

  return /(rio|río|laguna|arroyo|balneario|costanera|cascada|dique|embalse)/.test(normalizedQuery);
};

const SOMMELIER_OCCASIONS = [
  { value: "cena-pareja", label: "Cena en pareja" },
  { value: "amigos", label: "Salida con amigos" },
  { value: "regalo", label: "Comprar para regalo" },
  { value: "despues-oficina", label: "After office" },
];

const SOMMELIER_FOODS = [
  { value: "carnes", label: "Carnes / parrilla", styleHint: "malbec" },
  { value: "pastas", label: "Pastas", styleHint: "sangiovese" },
  { value: "quesos", label: "Quesos y picada", styleHint: "pinot noir" },
  { value: "pescados", label: "Pescados", styleHint: "chardonnay" },
  { value: "sin-comida", label: "Sin comida (solo copas)", styleHint: "espumante" },
];

const SOMMELIER_BUDGETS = [
  { value: "economico", label: "Económico", maxPrice: 9000 },
  { value: "medio", label: "Medio", maxPrice: 18000 },
  { value: "alto", label: "Alto", maxPrice: 32000 },
];

const SOMMELIER_OCCASION_TEXT = {
  "cena-pareja": "ambiente íntimo",
  amigos: "ambiente relajado para grupo",
  regalo: "opciones de regalo con buena presentación",
  "despues-oficina": "plan corto para after office",
};

const SOMMELIER_CATEGORY_BY_OCCASION = {
  "cena-pareja": "winebar",
  amigos: "degustacion",
  regalo: "vinoteca",
  "despues-oficina": "winebar",
};

const buildSommelierPrompt = ({ occasion, food, budget }) => {
  const occasionText = SOMMELIER_OCCASION_TEXT[occasion] || "plan con vino";
  const foodInfo = SOMMELIER_FOODS.find((item) => item.value === food);
  const budgetInfo = SOMMELIER_BUDGETS.find((item) => item.value === budget);
  const maridaje = foodInfo?.styleHint || "vino equilibrado";
  const maxPrice = budgetInfo?.maxPrice || 18000;

  return `Quiero ${occasionText}, opciones con ${maridaje}, presupuesto por persona hasta ${maxPrice}, con buena relación precio calidad.`;
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
  const [labelScans, setLabelScans] = useState([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [sommelierOpen, setSommelierOpen] = useState(false);
  const [brokenImages, setBrokenImages] = useState({});
  const [sommelierOccasion, setSommelierOccasion] = useState("cena-pareja");
  const [sommelierFood, setSommelierFood] = useState("carnes");
  const [sommelierBudget, setSommelierBudget] = useState("medio");
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

  const handleLabelCapture = (data) => {
    setLabelScans((prev) => [data, ...prev]);
  };

  const handleScannerCapture = (data) => {
    handleLabelCapture(data);
    setScannerOpen(false);
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

  const handleSommelierSearch = async () => {
    const suggestedCategory = SOMMELIER_CATEGORY_BY_OCCASION[sommelierOccasion] || "winebar";
    const sommelierPrompt = buildSommelierPrompt({
      occasion: sommelierOccasion,
      food: sommelierFood,
      budget: sommelierBudget,
    });

    setQuery(sommelierPrompt);
    setCategoria(suggestedCategory);
    await performSearch({
      query: sommelierPrompt,
      categoria: suggestedCategory,
    });
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
            <p className="discover-intro__hello">Buenas{user?.email ? `, ${user.email.split("@")[0]}` : ""}</p>
            <h1>¿Qué estás buscando?</h1>
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
              placeholder="Buscar bodegas, lugares, cafeterías..."
              aria-label="Buscar lugares en internet"
            />
            <button className="button button--violet" type="submit" disabled={loading}>
              {loading ? "..." : "Buscar"}
            </button>
            <button className="button button--ghost" type="button" onClick={handleClearSearch} disabled={!query && !results.length}>
              ✖
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
              {item.categoria === "winebar" && "🍷 "}
              {item.categoria === "vinoteca" && "🍾 "}
              {item.categoria === "degustacion" && "🍇 "}
              {item.categoria === "bodega" && "🏘️ "}
              {item.text}
            </button>
          ))}
        </div>

        <button 
          className="button button--ghost sommelier-toggle" 
          onClick={() => setSommelierOpen(!sommelierOpen)}
        >
          {sommelierOpen ? "Ocultar sommelier" : "✨ Ayuda del Sommelier"}
        </button>

        {sommelierOpen && (
          <div className="discover-sommelier" aria-label="Mini sommelier">
            <p className="map-help" style={{ marginTop: 0 }}>Encontrá tu vino ideal respondiendo esto:</p>

          <div className="discover-sommelier__grid">
            <label>
              Ocasión
              <select value={sommelierOccasion} onChange={(event) => setSommelierOccasion(event.target.value)}>
                {SOMMELIER_OCCASIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Comida
              <select value={sommelierFood} onChange={(event) => setSommelierFood(event.target.value)}>
                {SOMMELIER_FOODS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Presupuesto
              <select value={sommelierBudget} onChange={(event) => setSommelierBudget(event.target.value)}>
                {SOMMELIER_BUDGETS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button className="button button--primary" type="button" onClick={handleSommelierSearch} disabled={loading}>
            {loading ? "Buscando..." : "Dame opciones"}
          </button>
        </div>
        )}
      </section>

      {/* Floating Scan Label CTA for Mobile */}
      <button 
        type="button" 
        className="floating-scan-btn" 
        onClick={() => setScannerOpen(true)}
        aria-label="Escanear etiqueta de vino"
      >
        <span className="floating-scan-btn__icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
        </span>
        <span className="floating-scan-btn__label">Escanear</span>
      </button>

      {error && <p className="error-text">{error}</p>}

      {!loading && !error && location && (
        <p className="map-help discover-location-status">
          Resultados en zona: {toShortZone(location.nombre)}
        </p>
      )}

      {!loading && !error && results.length > 0 && (
        <p className="map-help discover-location-status">
          Fuentes: {sourceLabels || "Fuentes públicas"}
          {discoverMeta?.fallbackUsed ? " · Cobertura ampliada" : discoverMeta?.aiReranked ? " · Ranking IA activo" : " · Ranking heurístico"}
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

      {labelScans.length > 0 && (
        <section className="label-scans-shell">
          <h3>Etiquetas guardadas</h3>
          <div className="label-scans-grid">
            {labelScans.slice(0, 6).map((scan, i) => (
              <div key={i} className="label-scan-card">
                {scan.preview && <img src={scan.preview} alt={scan.filename || 'Etiqueta'} />}
                <div>
                  <strong>{scan.label || scan.filename || 'Etiqueta'}</strong>
                  {scan.vintage && <small> · {scan.vintage}</small>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {scannerOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-sheet">
            <header className="modal-sheet__header">
              <strong>Escanear etiqueta</strong>
              <button className="button button--ghost" onClick={() => setScannerOpen(false)}>Cerrar</button>
            </header>
            <div className="modal-sheet__body">
              <LabelScanner onCapture={handleScannerCapture} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default DescubrirPage;
