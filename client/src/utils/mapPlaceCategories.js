export const MAP_PLACE_CATEGORIES = [
  { value: "all", label: "All", emoji: "◎" },
  { value: "cafeteria", label: "Cafes", emoji: "☕" },
  { value: "restaurante", label: "Restaurants", emoji: "🍔" },
  { value: "bar", label: "Bars", emoji: "🍺" },
  { value: "rio", label: "Nature", emoji: "🌿" },
  { value: "mirador", label: "Viewpoints", emoji: "🌄" },
];

export const getPlaceMarkerIcon = (category = "") => {
  switch (category) {
    case "cafeteria":
      return "☕";
    case "restaurante":
      return "🍔";
    case "bar":
      return "🍺";
    case "mirador":
      return "🌄";
    case "rio":
      return "🌿";
    default:
      return "📍";
  }
};