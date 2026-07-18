// Base de referencia curada de vinos (sin dependencia de APIs externas ni keys).
// Se usa para autocompletar bodega / región / varietal mientras se edita un vino.

export const WINE_TYPES = [
  { value: "red", label: "Tinto" },
  { value: "white", label: "Blanco" },
  { value: "rosé", label: "Rosado" },
  { value: "sparkling", label: "Espumante" },
  { value: "fortified", label: "Fortificado" },
];

export const WINE_TYPE_LABELS = WINE_TYPES.reduce(
  (acc, { value, label }) => ({ ...acc, [value]: label }),
  { unknown: "Sin tipo" }
);

export const WINERIES = [
  "Catena Zapata", "Rutini Wines", "Luigi Bosca", "Norton", "Trapiche",
  "Zuccardi", "Bodega Chacra", "Bodegas Salentein", "Trivento", "Bodega Colomé",
  "Susana Balbo Wines", "Bodega Noemía", "Achaval Ferrer", "Alta Vista",
  "Bodega Lagarde", "El Enemigo", "Finca Decero", "Mendel Wines", "Pulenta Estate",
  "Tapiz", "Terrazas de los Andes", "Vistalba", "Weinert", "Bressia",
  "Bodega Garzón", "Familia Zuccardi", "Doña Paula", "La Posta", "Riglos",
];

export const REGIONS = [
  "Luján de Cuyo, Mendoza", "Valle de Uco, Mendoza", "Maipú, Mendoza",
  "San Rafael, Mendoza", "Tupungato, Mendoza", "Cafayate, Salta",
  "San Juan", "La Rioja", "Neuquén, Patagonia", "Río Negro, Patagonia",
  "Tunuyán, Mendoza", "Agrelo, Mendoza", "Perdriel, Mendoza", "Gualtallary, Mendoza",
];

export const VARIETALS = [
  "Malbec", "Cabernet Sauvignon", "Merlot", "Syrah", "Pinot Noir",
  "Cabernet Franc", "Bonarda", "Tempranillo", "Petit Verdot", "Tannat",
  "Chardonnay", "Sauvignon Blanc", "Torrontés", "Sémillon", "Viognier",
  "Chenin Blanc", "Gewürztraminer", "Pinot Grigio",
];

export const STORES = [
  "Tonel Privado", "El Mundo del Vino", "Vinoteca Urbana",
  "Winery", "Mercado Libre", "Coto", "Disco", "Carrefour",
  "Bodega directa", "Vinoteca local",
];

export const FOOD_PAIRINGS = {
  carne:   { types: ["red"],                    varietals: ["Malbec", "Cabernet Sauvignon", "Syrah", "Tannat", "Petit Verdot"] },
  pasta:   { types: ["red", "white"],           varietals: ["Merlot", "Bonarda", "Chardonnay", "Pinot Noir", "Barbera"] },
  pescado: { types: ["white", "sparkling"],     varietals: ["Sauvignon Blanc", "Torrontés", "Chardonnay", "Pinot Grigio", "Viognier"] },
  queso:   { types: ["red", "white", "fortified"], varietals: ["Malbec", "Chardonnay", "Sémillon", "Gewürztraminer"] },
  postre:  { types: ["sparkling", "fortified"], varietals: ["Torrontés", "Gewürztraminer", "Chenin Blanc"] },
  solo:    { types: [],                         varietals: [] },
};

export const FOOD_LABELS = {
  carne:   "Carnes",
  pasta:   "Pasta",
  pescado: "Pescado",
  queso:   "Queso",
  postre:  "Postre",
  solo:    "Sin maridaje",
};

export const MOOD_LABELS = {
  liviano:    "Liviano",
  robusto:    "Robusto",
  festivo:    "Festivo",
  cualquiera: "Cualquiera",
};
