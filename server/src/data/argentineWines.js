// Catálogo curado de vinos argentinos.
//
// Es la fuente PRIMARIA de la búsqueda: Open Food Facts tiene muy poca cobertura
// de vino argentino y sus nombres vienen sucios, así que apoyarse sólo en él hacía
// que búsquedas obvias ("Catena Malbec") no devolvieran nada.
//
// Cada entrada es una línea real de una bodega argentina. El nombre visible se
// arma como "<línea> <varietal>" para que coincida con cómo la gente busca.

const RAW = [
  // --- Catena Zapata ---
  ["Catena Zapata", "Catena", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Catena Zapata", "Catena", "Cabernet Sauvignon", "Luján de Cuyo, Mendoza", "red"],
  ["Catena Zapata", "Catena", "Chardonnay", "Luján de Cuyo, Mendoza", "white"],
  ["Catena Zapata", "Catena Alta", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Catena Zapata", "Catena Alta", "Chardonnay", "Luján de Cuyo, Mendoza", "white"],
  ["Catena Zapata", "Nicolás Catena Zapata", "Cabernet Sauvignon", "Luján de Cuyo, Mendoza", "red"],
  ["Catena Zapata", "Adrianna Vineyard White Stones", "Chardonnay", "Gualtallary, Mendoza", "white"],
  ["Catena Zapata", "Angélica Zapata", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Catena Zapata", "Saint Felicien", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Catena Zapata", "Saint Felicien", "Cabernet Sauvignon", "Luján de Cuyo, Mendoza", "red"],
  ["Catena Zapata", "Alamos", "Malbec", "Mendoza", "red"],
  ["Catena Zapata", "Alamos", "Torrontés", "Cafayate, Salta", "white"],

  // --- Rutini Wines ---
  ["Rutini Wines", "Rutini", "Malbec", "Tupungato, Mendoza", "red"],
  ["Rutini Wines", "Rutini", "Cabernet Malbec", "Tupungato, Mendoza", "red"],
  ["Rutini Wines", "Rutini", "Chardonnay", "Tupungato, Mendoza", "white"],
  ["Rutini Wines", "Rutini Single Vineyard", "Malbec", "Gualtallary, Mendoza", "red"],
  ["Rutini Wines", "Trumpeter", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Rutini Wines", "Trumpeter", "Torrontés", "Cafayate, Salta", "white"],
  ["Rutini Wines", "Antología", "Blend", "Valle de Uco, Mendoza", "red"],
  ["Rutini Wines", "Encuentro", "Malbec", "Valle de Uco, Mendoza", "red"],

  // --- Luigi Bosca ---
  ["Luigi Bosca", "Luigi Bosca", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Luigi Bosca", "Luigi Bosca", "Cabernet Sauvignon", "Luján de Cuyo, Mendoza", "red"],
  ["Luigi Bosca", "Luigi Bosca", "Sauvignon Blanc", "Luján de Cuyo, Mendoza", "white"],
  ["Luigi Bosca", "Luigi Bosca De Sangre", "Blend", "Luján de Cuyo, Mendoza", "red"],
  ["Luigi Bosca", "Finca Los Nobles", "Cabernet Bouchet", "Luján de Cuyo, Mendoza", "red"],
  ["Luigi Bosca", "Gala 1", "Malbec Petit Verdot", "Luján de Cuyo, Mendoza", "red"],
  ["Luigi Bosca", "Gala 3", "Blend Blanco", "Luján de Cuyo, Mendoza", "white"],
  ["Luigi Bosca", "La Linda", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Luigi Bosca", "La Linda", "Torrontés", "Luján de Cuyo, Mendoza", "white"],

  // --- Trapiche ---
  ["Trapiche", "Trapiche Medalla", "Cabernet Sauvignon", "Maipú, Mendoza", "red"],
  ["Trapiche", "Trapiche Broquel", "Malbec", "Maipú, Mendoza", "red"],
  ["Trapiche", "Trapiche Broquel", "Bonarda", "Maipú, Mendoza", "red"],
  ["Trapiche", "Trapiche Oak Cask", "Malbec", "Maipú, Mendoza", "red"],
  ["Trapiche", "Trapiche Iscay", "Malbec Cabernet Franc", "Maipú, Mendoza", "red"],
  ["Trapiche", "Trapiche Costa & Pampa", "Chardonnay", "Chapadmalal, Buenos Aires", "white"],
  ["Trapiche", "Fond de Cave", "Malbec", "Maipú, Mendoza", "red"],

  // --- Norton ---
  ["Norton", "Norton Reserva", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Norton", "Norton Reserva", "Cabernet Sauvignon", "Luján de Cuyo, Mendoza", "red"],
  ["Norton", "Norton Barrel Select", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Norton", "Norton Privada", "Blend", "Luján de Cuyo, Mendoza", "red"],
  ["Norton", "Norton Cosecha Especial", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Norton", "Norton", "Extra Brut", "Luján de Cuyo, Mendoza", "sparkling"],

  // --- Zuccardi / Familia Zuccardi ---
  ["Familia Zuccardi", "Zuccardi Serie A", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Familia Zuccardi", "Zuccardi Serie A", "Torrontés", "Valle de Uco, Mendoza", "white"],
  ["Familia Zuccardi", "Zuccardi Q", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Familia Zuccardi", "Zuccardi Q", "Cabernet Sauvignon", "Valle de Uco, Mendoza", "red"],
  ["Familia Zuccardi", "Zuccardi Aluvional", "Malbec", "Gualtallary, Mendoza", "red"],
  ["Familia Zuccardi", "Zuccardi Concreto", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Familia Zuccardi", "Zuccardi Poligonos", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Familia Zuccardi", "Santa Julia", "Malbec", "Maipú, Mendoza", "red"],
  ["Familia Zuccardi", "Santa Julia", "Torrontés", "Maipú, Mendoza", "white"],

  // --- Susana Balbo ---
  ["Susana Balbo Wines", "Susana Balbo Signature", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Susana Balbo Wines", "Susana Balbo Signature", "Torrontés", "Cafayate, Salta", "white"],
  ["Susana Balbo Wines", "Crios", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Susana Balbo Wines", "Crios", "Torrontés", "Cafayate, Salta", "white"],
  ["Susana Balbo Wines", "BenMarco", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Susana Balbo Wines", "Nosotros", "Malbec", "Valle de Uco, Mendoza", "red"],

  // --- El Enemigo / Aleanna ---
  ["El Enemigo", "El Enemigo", "Malbec", "Mendoza", "red"],
  ["El Enemigo", "El Enemigo", "Cabernet Franc", "Mendoza", "red"],
  ["El Enemigo", "El Enemigo", "Bonarda", "Mendoza", "red"],
  ["El Enemigo", "El Enemigo", "Chardonnay", "Mendoza", "white"],
  ["El Enemigo", "Gran Enemigo", "Cabernet Franc", "Gualtallary, Mendoza", "red"],

  // --- Achaval Ferrer ---
  ["Achaval Ferrer", "Achaval Ferrer", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Achaval Ferrer", "Finca Altamira", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Achaval Ferrer", "Finca Bella Vista", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Achaval Ferrer", "Quimera", "Blend", "Mendoza", "red"],

  // --- Salentein ---
  ["Bodegas Salentein", "Salentein Reserve", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Bodegas Salentein", "Salentein Reserve", "Pinot Noir", "Valle de Uco, Mendoza", "red"],
  ["Bodegas Salentein", "Salentein Numina", "Blend", "Valle de Uco, Mendoza", "red"],
  ["Bodegas Salentein", "Portillo", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Bodegas Salentein", "Portillo", "Sauvignon Blanc", "Valle de Uco, Mendoza", "white"],

  // --- Patagonia ---
  ["Bodega Chacra", "Chacra Treinta y Dos", "Pinot Noir", "Río Negro, Patagonia", "red"],
  ["Bodega Chacra", "Chacra Cincuenta y Cinco", "Pinot Noir", "Río Negro, Patagonia", "red"],
  ["Bodega Chacra", "Chacra Barda", "Pinot Noir", "Río Negro, Patagonia", "red"],
  ["Bodega Noemía", "Noemía", "Malbec", "Río Negro, Patagonia", "red"],
  ["Bodega Noemía", "J. Alberto", "Malbec", "Río Negro, Patagonia", "red"],
  ["Bodega Noemía", "A Lisa", "Malbec", "Río Negro, Patagonia", "red"],

  // --- Salta ---
  ["Bodega Colomé", "Colomé Estate", "Malbec", "Valle Calchaquí, Salta", "red"],
  ["Bodega Colomé", "Colomé Altura Máxima", "Malbec", "Valle Calchaquí, Salta", "red"],
  ["Bodega Colomé", "Colomé", "Torrontés", "Valle Calchaquí, Salta", "white"],
  ["El Esteco", "Don David", "Malbec", "Cafayate, Salta", "red"],
  ["El Esteco", "Don David", "Torrontés", "Cafayate, Salta", "white"],
  ["El Esteco", "Altimus", "Blend", "Cafayate, Salta", "red"],

  // --- Otras clásicas ---
  ["Terrazas de los Andes", "Terrazas Reserva", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Terrazas de los Andes", "Terrazas Grand", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Terrazas de los Andes", "Cheval des Andes", "Blend", "Luján de Cuyo, Mendoza", "red"],
  ["Mendel Wines", "Mendel", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Mendel Wines", "Mendel Unus", "Blend", "Luján de Cuyo, Mendoza", "red"],
  ["Mendel Wines", "Mendel Lunta", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Pulenta Estate", "Pulenta Estate", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Pulenta Estate", "Pulenta Estate", "Cabernet Franc", "Luján de Cuyo, Mendoza", "red"],
  ["Pulenta Estate", "Gran Corte", "Blend", "Luján de Cuyo, Mendoza", "red"],
  ["Doña Paula", "Doña Paula Estate", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Doña Paula", "Doña Paula Los Cardos", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Doña Paula", "Doña Paula Selección de Bodega", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Alta Vista", "Alta Vista Premium", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Alta Vista", "Alta Vista Terroir Selection", "Malbec", "Mendoza", "red"],
  ["Bodega Lagarde", "Lagarde Guarda", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Bodega Lagarde", "Lagarde Altas Cumbres", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Vistalba", "Vistalba Corte A", "Blend", "Luján de Cuyo, Mendoza", "red"],
  ["Vistalba", "Vistalba Corte B", "Blend", "Luján de Cuyo, Mendoza", "red"],
  ["Vistalba", "Tomero", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Weinert", "Weinert Cavas de Weinert", "Blend", "Luján de Cuyo, Mendoza", "red"],
  ["Weinert", "Weinert", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Trivento", "Trivento Golden Reserve", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Trivento", "Trivento Reserve", "Malbec", "Mendoza", "red"],
  ["Trivento", "Trivento White Malbec", "Malbec", "Mendoza", "white"],
  ["Finca Decero", "Decero Remolinos Vineyard", "Malbec", "Agrelo, Mendoza", "red"],
  ["Finca Decero", "Decero Amano", "Blend", "Agrelo, Mendoza", "red"],
  ["Bressia", "Bressia Profundo", "Blend", "Luján de Cuyo, Mendoza", "red"],
  ["Bressia", "Bressia Monteagrelo", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Tapiz", "Tapiz Alta", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Tapiz", "Tapiz Black Tears", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Riglos", "Riglos Gran", "Malbec", "Gualtallary, Mendoza", "red"],
  ["Riglos", "Riglos Quinto", "Blend", "Gualtallary, Mendoza", "red"],
  ["La Posta", "La Posta Pizzella", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["La Posta", "La Posta Paulucci", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Escorihuela Gascón", "Escorihuela Gascón", "Malbec", "Maipú, Mendoza", "red"],
  ["Escorihuela Gascón", "Don Miguel Gascón", "Malbec", "Maipú, Mendoza", "red"],
  ["Nieto Senetiner", "Nieto Senetiner Reserva", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Nieto Senetiner", "Nieto Senetiner Reserva", "Bonarda", "Luján de Cuyo, Mendoza", "red"],
  ["Nieto Senetiner", "Don Nicanor", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Chandon", "Chandon", "Extra Brut", "Agrelo, Mendoza", "sparkling"],
  ["Chandon", "Chandon Délice", "Demi Sec", "Agrelo, Mendoza", "sparkling"],
  ["Chandon", "Baron B", "Extra Brut", "Agrelo, Mendoza", "sparkling"],
  ["Cruzat", "Cruzat Cuvée", "Extra Brut", "Valle de Uco, Mendoza", "sparkling"],
  ["Cruzat", "Cruzat Premier", "Extra Brut", "Valle de Uco, Mendoza", "sparkling"],
  ["Bodega Garzón", "Garzón Reserva", "Tannat", "Maldonado, Uruguay", "red"],
  ["Familia Schroeder", "Saurus", "Pinot Noir", "Neuquén, Patagonia", "red"],
  ["Familia Schroeder", "Familia Schroeder", "Malbec", "Neuquén, Patagonia", "red"],
  ["Humberto Canale", "Humberto Canale Estate", "Pinot Noir", "Río Negro, Patagonia", "red"],
  ["Humberto Canale", "Humberto Canale Old Vineyard", "Malbec", "Río Negro, Patagonia", "red"],
];

// Normaliza texto para comparar sin acentos ni mayúsculas.
const fold = (text = "") =>
  String(text)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

const slug = (text) => fold(text).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const CATALOG = RAW.map(([winery, line, varietal, region, type]) => {
  // La línea ya identifica al vino ("Catena Alta", "Alamos"), así que el nombre
  // visible es "<línea> <varietal>" y la bodega se muestra aparte en la tarjeta.
  const name = `${line} ${varietal}`.trim();
  return {
    id: `ar-${slug(`${winery}-${line}-${varietal}`)}`,
    name,
    winery,
    region,
    varietal,
    type,
    image: "",
    vintage: "",
    rating: 0,
    barcode: "",
    country: region.includes("Uruguay") ? "Uruguay" : "Argentina",
    source: "catalogo-ar",
    // Índice de búsqueda precalculado.
    haystack: fold(`${line} ${varietal} ${winery} ${region}`),
  };
});

module.exports = { CATALOG, fold };
