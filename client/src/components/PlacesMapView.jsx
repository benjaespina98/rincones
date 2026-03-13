import { useEffect, useMemo, useRef, useState } from "react";
import Map, { GeolocateControl, Marker as MapboxMarker, NavigationControl, Popup, Source, Layer } from "react-map-gl";
import { MapContainer, Marker as LeafletMarker, Popup as LeafletPopup, TileLayer } from "react-leaflet";
import { getNearbyPlaces } from "../services/placesApi";
import { MAP_PLACE_CATEGORIES, getPlaceMarkerIcon } from "../utils/mapPlaceCategories";
import PlacesBottomSheet from "./PlacesBottomSheet";

const defaultCenter = {
  latitude: -34.6037,
  longitude: -58.3816,
  zoom: 12,
};

const clusterLayer = {
  id: "clusters",
  type: "circle",
  source: "places",
  filter: ["has", "point_count"],
  paint: {
    "circle-color": "#7b67c7",
    "circle-radius": ["step", ["get", "point_count"], 18, 10, 24, 30, 30],
    "circle-stroke-width": 2,
    "circle-stroke-color": "#efe9ff",
  },
};

const clusterCountLayer = {
  id: "cluster-count",
  type: "symbol",
  source: "places",
  filter: ["has", "point_count"],
  layout: {
    "text-field": ["get", "point_count_abbreviated"],
    "text-size": 12,
  },
  paint: {
    "text-color": "#ffffff",
  },
};

const PlacesMapView = () => {
  const hasMapboxToken = Boolean(import.meta.env.VITE_MAPBOX_TOKEN);
  const [viewState, setViewState] = useState(defaultCenter);
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sourceInfo, setSourceInfo] = useState("");
  const [locationInfo, setLocationInfo] = useState("");
  const [usingDefaultLocation, setUsingDefaultLocation] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedPlace, setSelectedPlace] = useState(null);
  const hasInitializedRef = useRef(false);
  const requestIdRef = useRef(0);

  const loadPlaces = async ({ latitude, longitude, category = selectedCategory }) => {
    const requestId = ++requestIdRef.current;

    try {
      setLoading(true);
      setError("");
      const isNatureSearch = category === "rio";
      const primaryRadius = isNatureSearch ? 12000 : 3000;
      const fallbackRadius = isNatureSearch ? 80000 : 12000;

      const primaryResult = await getNearbyPlaces({
        lat: latitude,
        lng: longitude,
        radius: primaryRadius,
        category,
      });

      let finalResult = primaryResult;
      const shouldRetryBroaderArea = !primaryResult.places?.length;

      if (shouldRetryBroaderArea) {
        finalResult = await getNearbyPlaces({
          lat: latitude,
          lng: longitude,
          radius: fallbackRadius,
          category: category === "all" ? "all" : category,
        });
      }

      const shouldTryAnyCategory = !finalResult.places?.length && category !== "all";
      if (shouldTryAnyCategory) {
        finalResult = await getNearbyPlaces({
          lat: latitude,
          lng: longitude,
          radius: fallbackRadius,
          category: "all",
        });
      }

      if (requestId !== requestIdRef.current) {
        return;
      }

      setPlaces(finalResult.places || []);
      setSourceInfo(String(finalResult.meta?.source || ""));
    } catch (requestError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setError(requestError.response?.data?.message || "No pudimos cargar lugares cercanos en este momento.");
      setPlaces([]);
      setSourceInfo("");
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!navigator.geolocation) {
      setUsingDefaultLocation(true);
      setLocationInfo("Tu navegador no soporta geolocalización. Mostrando zona por defecto.");
      loadPlaces(defaultCenter);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextView = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          zoom: 13,
        };
        setUsingDefaultLocation(false);
        setLocationInfo("Ubicación actual detectada. Mostrando lugares cerca tuyo.");
        setViewState(nextView);
        hasInitializedRef.current = true;
        loadPlaces(nextView);
      },
      () => {
        setUsingDefaultLocation(true);
        setLocationInfo("No se pudo usar tu ubicación. Mostrando zona por defecto.");
        hasInitializedRef.current = true;
        loadPlaces(defaultCenter);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  useEffect(() => {
    if (!hasInitializedRef.current) {
      return;
    }

    loadPlaces(viewState);
  }, [selectedCategory]);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError("Tu navegador no soporta geolocalización.");
      return;
    }

    setError("");
    setLocationInfo("Obteniendo tu ubicación actual...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextView = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          zoom: 13,
        };
        setUsingDefaultLocation(false);
        setLocationInfo("Ubicación actual activada. Resultados actualizados.");
        setViewState(nextView);
        loadPlaces(nextView);
      },
      () => {
        setLocationInfo("No pudimos obtener tu ubicación. Revisá permisos del navegador.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const geojson = useMemo(
    () => ({
      type: "FeatureCollection",
      features: places.map((place) => ({
        type: "Feature",
        properties: {
          id: place.id,
          name: place.name,
          category: place.category,
        },
        geometry: {
          type: "Point",
          coordinates: [place.longitude, place.latitude],
        },
      })),
    }),
    [places]
  );

  const dataStatusMessage = useMemo(() => {
    if (loading || error) {
      return "";
    }

    if (sourceInfo === "community-fallback-nearest" && places.length > 0) {
      return "No había lugares cercanos. Te mostramos opciones de la comunidad más próximas.";
    }

    if (sourceInfo === "community-fallback-nearest-any" && places.length > 0) {
      return "No encontramos en esta categoría. Te mostramos lugares cercanos de otras categorías.";
    }

    if (sourceInfo === "osm-fallback" && places.length > 0) {
      return "Usando fuentes abiertas de OpenStreetMap para mostrar lugares cercanos.";
    }

    if (sourceInfo === "community-fallback" && places.length > 0) {
      return "Mostrando lugares de la comunidad cerca de tu zona.";
    }

    if (!places.length) {
      return "No encontramos resultados directos para este filtro. Probá 'All' o tocá 'Usar mi ubicación'.";
    }

    return "";
  }, [loading, error, sourceInfo, places.length]);

  return (
    <section className="places-map-page">
      <div className="places-map-toolbar">
        <div className="places-map-toolbar__chips">
          {MAP_PLACE_CATEGORIES.map((category) => (
            <button
              key={category.value}
              type="button"
              className={`places-filter-chip ${selectedCategory === category.value ? "places-filter-chip--active" : ""}`}
              onClick={() => setSelectedCategory(category.value)}
            >
              <span>{category.emoji}</span>
              {category.label}
            </button>
          ))}
        </div>
        <div className="places-map-toolbar__status">
          <span className="map-help">
            {locationInfo || (usingDefaultLocation ? "Mostrando zona por defecto." : "Usando tu ubicación actual.")}
          </span>
          <button type="button" className="button button--ghost button--compact" onClick={handleUseCurrentLocation}>
            Usar mi ubicación
          </button>
        </div>
        {loading && <span className="map-help">Loading places...</span>}
        {!!dataStatusMessage && <span className="map-help">{dataStatusMessage}</span>}
        {error && <span className="error-text">{error}</span>}
      </div>

      <div className="places-map-shell">
        {hasMapboxToken ? (
          <Map
            mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
            initialViewState={defaultCenter}
            {...viewState}
            onMove={(event) => setViewState(event.viewState)}
            mapStyle="mapbox://styles/mapbox/light-v11"
            reuseMaps
          >
            <NavigationControl position="top-right" />
            <GeolocateControl
              position="top-right"
              trackUserLocation
              onGeolocate={(position) => {
                const nextView = {
                  latitude: position.coords.latitude,
                  longitude: position.coords.longitude,
                  zoom: 13,
                };
                setUsingDefaultLocation(false);
                setLocationInfo("Ubicación actual detectada. Mostrando lugares cerca tuyo.");
                setViewState(nextView);
                loadPlaces(nextView);
              }}
            />

            <Source id="places" type="geojson" data={geojson} cluster clusterRadius={45} clusterMaxZoom={13}>
              <Layer {...clusterLayer} />
              <Layer {...clusterCountLayer} />
            </Source>

            {places.map((place) => (
              <MapboxMarker
                key={place.id}
                longitude={place.longitude}
                latitude={place.latitude}
                anchor="bottom"
                onClick={(event) => {
                  event.originalEvent.stopPropagation();
                  setSelectedPlace(place);
                }}
              >
                <button type="button" className="places-marker" aria-label={place.name}>
                  {getPlaceMarkerIcon(place.category)}
                </button>
              </MapboxMarker>
            ))}

            {selectedPlace && (
              <Popup
                longitude={selectedPlace.longitude}
                latitude={selectedPlace.latitude}
                anchor="top"
                onClose={() => setSelectedPlace(null)}
                offset={18}
                closeButton={false}
              >
                <div className="places-popup">
                  <strong>{selectedPlace.name}</strong>
                  <small>{selectedPlace.address || "Address unavailable"}</small>
                </div>
              </Popup>
            )}
          </Map>
        ) : (
          <MapContainer
            key={`leaflet-${viewState.latitude.toFixed(3)}-${viewState.longitude.toFixed(3)}`}
            center={[viewState.latitude, viewState.longitude]}
            zoom={viewState.zoom}
            scrollWheelZoom
            className="places-map-leaflet"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {places.map((place) => (
              <LeafletMarker
                key={place.id}
                position={[place.latitude, place.longitude]}
                eventHandlers={{
                  click: () => setSelectedPlace(place),
                }}
              >
                <LeafletPopup>
                  <strong>{place.name}</strong>
                  <br />
                  {place.address || "Address unavailable"}
                </LeafletPopup>
              </LeafletMarker>
            ))}
          </MapContainer>
        )}
      </div>

      <PlacesBottomSheet place={selectedPlace} onClose={() => setSelectedPlace(null)} onSave={(place) => console.log("save", place)} />
    </section>
  );
};

export default PlacesMapView;