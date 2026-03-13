import { getPlaceMarkerIcon } from "../utils/mapPlaceCategories";

const PlacesBottomSheet = ({ place, onClose, onSave }) => {
  if (!place) {
    return null;
  }

  return (
    <aside className="places-sheet" aria-label="Selected place details">
      <div className="places-sheet__handle" aria-hidden="true" />
      <div className="places-sheet__header">
        <div>
          <span className="places-sheet__icon">{getPlaceMarkerIcon(place.category)}</span>
          <h2>{place.name}</h2>
        </div>
        <button type="button" className="button button--ghost button--compact" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="places-sheet__meta">
        <span className="badge">{place.category}</span>
        {Number.isFinite(place.rating) && <span className="info-chip">Rating {place.rating}</span>}
        {Number.isFinite(place.distance) && <span className="info-chip">{place.distance} m</span>}
      </div>

      <p className="places-sheet__address">{place.address || "Address unavailable"}</p>

      <div className="places-sheet__actions">
        <button type="button" className="button button--violet">
          View details
        </button>
        <button type="button" className="button button--ghost" onClick={() => onSave?.(place)}>
          Save place
        </button>
      </div>
    </aside>
  );
};

export default PlacesBottomSheet;