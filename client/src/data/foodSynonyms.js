/**
 * De lo que vas a comer a la categoría que entiende el recomendador.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * Los chips cubren diez comidas. El problema no es que sean pocas: es que la
 * comida real no viene en categorías. Alguien va a comer milanesas, sushi,
 * empanadas o un guiso, mira diez chips, no encuentra el suyo y se va. La app
 * sabía qué recomendarle —una milanesa es carne— y no se lo preguntaba.
 *
 * Esta tabla traduce lo que escribís a una de las categorías que ya existen. Es
 * local y no cuesta nada: escribís "milanesa" y la respuesta aparece sin esperar
 * a nadie. Lo que NO está acá cae en la IA (ver `classifyDish` en el server), que
 * clasifica el plato y guarda la respuesta para todos.
 *
 * Las claves son las de FOOD_PAIRINGS. `mariscos` y `ensalada` no tienen chip
 * pero sí maridaje: por escrito ahora se pueden alcanzar.
 */

const SINONIMOS = {
  asado: [
    "asado", "parrilla", "parrillada", "tira de asado", "costillar", "vacio",
    "chorizo", "morcilla", "achuras", "chinchulines", "entraña", "matambre",
    "provoleta", "choripan", "mollejas", "bife de chorizo", "ojo de bife",
  ],
  carne: [
    "carne", "bife", "milanesa", "milanesas", "lomo", "peceto", "estofado",
    "guiso", "locro", "hamburguesa", "cordero", "cerdo", "bondiola", "costillas",
    "albondigas", "empanada", "empanadas", "puchero", "carbonada", "pastel de papa",
    "chivito", "cabrito", "osobuco", "matambre a la pizza", "carne al horno",
  ],
  pollo: [
    "pollo", "pavo", "suprema", "supremas", "gallina", "pollo al horno",
    "pollo a la parrilla", "alitas", "pato",
  ],
  pasta: [
    "pasta", "pastas", "fideos", "ravioles", "raviolis", "ñoquis", "noquis",
    "canelones", "lasaña", "lasagna", "sorrentinos", "tallarines", "spaghetti",
    "espaguetis", "tuco", "bolognesa", "risotto", "polenta", "penne",
  ],
  pizza: ["pizza", "pizzas", "fugazzeta", "faina", "calzone", "muzzarella"],
  pescado: [
    "pescado", "salmon", "merluza", "trucha", "atun", "ceviche", "sushi",
    "sashimi", "lenguado", "brotola", "corvina", "bacalao", "pejerrey",
  ],
  mariscos: [
    "mariscos", "camarones", "langostinos", "calamares", "rabas", "mejillones",
    "pulpo", "paella", "cazuela de mariscos", "vieiras",
  ],
  picada: [
    "picada", "picadita", "tabla", "fiambre", "fiambres", "jamon", "salame",
    "aceitunas", "papas fritas", "nachos", "snacks", "bruschetta", "bruschettas",
    "tapeo", "antipasto",
  ],
  queso: [
    "queso", "quesos", "fondue", "raclette", "tabla de quesos", "brie",
    "roquefort", "gruyere", "burrata", "provolone",
  ],
  ensalada: [
    "ensalada", "ensaladas", "verduras", "vegetariano", "vegetariana", "vegano",
    "tarta", "tarta de verduras", "tortilla", "wok", "hummus", "falafel",
    "berenjenas", "zapallo", "sopa", "revuelto",
  ],
  postre: [
    "postre", "postres", "chocolate", "helado", "torta", "flan", "tiramisu",
    "cheesecake", "alfajor", "dulce de leche", "budin", "fruta", "frutas",
    "panqueques", "brownie",
  ],
  solo: ["nada", "sin comida", "solo", "sin nada", "charlar", "ninguna"],
};

const fold = (text = "") =>
  String(text)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

// Se ordenan por largo descendente una sola vez: "milanesa de pollo" tiene que
// ganarle a "pollo" y a "milanesa", y eso lo decide el término más específico
// que aparezca en el texto, no el orden en que quedó escrita la tabla.
const INDICE = Object.entries(SINONIMOS)
  .flatMap(([food, terminos]) => terminos.map((termino) => ({ food, termino: fold(termino) })))
  .sort((a, b) => b.termino.length - a.termino.length);

/**
 * Resuelve un texto libre a una categoría de maridaje.
 * Devuelve { food, termino } o null si no lo reconocemos acá (ahí decide la IA).
 */
export const resolveFood = (texto) => {
  const t = fold(texto);
  if (t.length < 3) return null;

  const hit = INDICE.find(({ termino }) => t.includes(termino));
  return hit ? { food: hit.food, termino: hit.termino } : null;
};
