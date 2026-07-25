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
  asado:    { types: ["red"],                       varietals: ["Malbec", "Cabernet Sauvignon", "Syrah", "Bonarda", "Tannat", "Petit Verdot"] },
  carne:    { types: ["red"],                       varietals: ["Malbec", "Cabernet Sauvignon", "Syrah", "Tannat", "Petit Verdot"] },
  pollo:    { types: ["white", "red"],              varietals: ["Chardonnay", "Pinot Noir", "Torrontés", "Viognier"] },
  pasta:    { types: ["red", "white"],              varietals: ["Merlot", "Bonarda", "Chardonnay", "Pinot Noir", "Sangiovese"] },
  pizza:    { types: ["red"],                       varietals: ["Bonarda", "Sangiovese", "Malbec", "Tempranillo"] },
  pescado:  { types: ["white", "sparkling"],        varietals: ["Sauvignon Blanc", "Torrontés", "Chardonnay", "Pinot Grigio", "Viognier"] },
  mariscos: { types: ["white", "sparkling"],        varietals: ["Sauvignon Blanc", "Chardonnay", "Pinot Grigio", "Albariño"] },
  picada:   { types: ["red", "white"],              varietals: ["Malbec", "Bonarda", "Torrontés", "Chardonnay"] },
  queso:    { types: ["red", "white", "fortified"], varietals: ["Malbec", "Chardonnay", "Sémillon", "Gewürztraminer"] },
  ensalada: { types: ["white", "rosé", "sparkling"],varietals: ["Sauvignon Blanc", "Torrontés", "Pinot Grigio"] },
  postre:   { types: ["sparkling", "fortified"],    varietals: ["Torrontés", "Gewürztraminer", "Chenin Blanc", "Moscato"] },
  solo:     { types: [],                            varietals: [] },
};

export const FOOD_LABELS = {
  asado:    "Asado",
  carne:    "Carnes",
  pollo:    "Pollo",
  pasta:    "Pasta",
  pizza:    "Pizza",
  pescado:  "Pescado",
  picada:   "Picada",
  queso:    "Quesos",
  postre:   "Postres",
  solo:     "Sin comida",
};
