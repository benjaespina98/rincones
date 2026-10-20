import { normalizeSearchText } from "../utils/text";

/**
 * Una frase corta de maridaje para la tarjeta de recomendación de Descubrí: con qué se lleva
 * esta uva, dicho como lo diría un sommelier y sin prometer más de lo que es general.
 *
 * Es una guía de estilo, no de esta botella: va por uva y, si no hay uva conocida, por tipo. Las
 * frases salen de los maridajes clásicos de cada cepa; conviene que las revise quien sabe del tema
 * antes de agregar más.
 */
const POR_UVA = {
  malbec: "Carnes rojas a la parrilla y quesos curados",
  "cabernet sauvignon": "Asado, cordero y quesos de pasta dura",
  "cabernet franc": "Carnes asadas, hongos y cordero",
  syrah: "Carnes especiadas, cordero y parrilla",
  merlot: "Pastas con salsa, cerdo y carnes suaves",
  "pinot noir": "Aves, hongos y pescados de carne firme",
  tannat: "Carnes grasas, achuras y quesos intensos",
  bonarda: "Pastas, empanadas y milanesas",
  tempranillo: "Cordero, jamón y platos al horno",
  sangiovese: "Pastas con salsa de tomate y carnes a la parrilla",
  chardonnay: "Pescados, aves y pastas cremosas",
  "sauvignon blanc": "Mariscos, ensaladas y quesos de cabra",
  torrontes: "Cocina especiada, empanadas y sushi",
  semillon: "Pescados al horno y aves",
  viognier: "Aves, cocina picante y quesos suaves",
  riesling: "Cocina asiática, pescados y quesos azules",
  "chenin blanc": "Pescados, ensaladas y platos livianos",
  "pinot gris": "Pescados blancos, pastas livianas y verduras",
};

const POR_TIPO = {
  red: "Carnes a la parrilla, pastas y quesos",
  white: "Pescados, mariscos y ensaladas",
  "rosé": "Picadas, ensaladas y pescados a la plancha",
  sparkling: "Aperitivo, mariscos y platos fritos",
  fortified: "Postres, quesos azules y frutos secos",
};

/** La frase de maridaje para un vino, o "" si no hay nada sensato que decir. */
export const maridajeCorto = (wine) => {
  const uva = normalizeSearchText(wine?.varietal || "");
  if (uva && POR_UVA[uva]) return POR_UVA[uva];
  // "Blend", "Corte" y desconocidos caen al tipo: es lo único que se puede decir sin inventar.
  return POR_TIPO[wine?.type] || "";
};
