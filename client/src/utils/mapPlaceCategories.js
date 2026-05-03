export const MAP_PLACE_CATEGORIES = [
  { value: "all", label: "Todo", emoji: "◎" },
  { value: "vinoteca", label: "Vinotecas", emoji: "🍷" },
  { value: "winebar", label: "Wine Bars", emoji: "🥂" },
  { value: "degustacion", label: "Degustaciones", emoji: "🍇" },
  { value: "bodega", label: "Bodegas", emoji: "🏛" },
  { value: "feria_vino", label: "Ferias", emoji: "🧺" },
  { value: "restaurante", label: "Restaurantes", emoji: "🍽" },
  { value: "bar", label: "Bares", emoji: "🍺" },
];

export const getPlaceMarkerIcon = (category = "") => {
  switch (category) {
    case "vinoteca":
      return "🍷";
    case "winebar":
      return "🥂";
    case "degustacion":
      return "🍇";
    case "bodega":
      return "🏛";
    case "feria_vino":
      return "🧺";
    case "cafeteria":
      return "☕";
    case "restaurante":
      return "🍽";
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