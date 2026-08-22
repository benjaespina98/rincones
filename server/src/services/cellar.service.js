/**
 * ¿En qué punto de su ventana de guarda está este vino?
 *
 * ── ESTE MÓDULO CLASIFICA; NO REDACTA ───────────────────────────────────────
 * Devolvía además la frase que veía la persona ("Esperá 2 años", "Óptimo —
 * quedan 4 años") y esa mitad se borró, porque era una segunda redacción que
 * había quedado vieja. La que se usa hoy vive en client/src/utils/cellarStatus.js
 * y dice otra cosa: "Mejor a partir de 2028", con la ventana en años.
 *
 * No eran dos formas de decir lo mismo, eran dos textos distintos para el mismo
 * dato, y se notó en pantalla: `getCellarReady` mandaba su `cellarStatus` en cada
 * respuesta y la tarjeta de la home no mostraba nada, porque esperaba un campo
 * (`detail`) que esta mitad de la app no tenía. El cliente terminó recalculando
 * todo y el campo viajaba para que nadie lo leyera.
 *
 * El reparto que queda es el que corresponde: el servidor decide QUIÉNES entran
 * a la lista y cuánto puntúan (necesita `status`, nada más); cómo se le dice a
 * la persona lo decide el cliente, que es donde vive la redacción que ya usan
 * todas las pantallas.
 *
 * ── LOS RANGOS ESTÁN EN DOS LADOS ───────────────────────────────────────────
 * Esta tabla es igual a la de client/src/utils/cellarStatus.js y tiene que
 * seguir siéndolo: si se toca una, se toca la otra. No se comparte en un módulo
 * porque el cliente y el servidor son dos workspaces sin paquete común, y armar
 * uno para trece renglones de datos costaría más de lo que arregla. Si algún día
 * hay un paquete compartido, esto es lo primero que debería mudarse.
 */

const OPTIMAL_RANGES = {
  red: {
    default:              [3, 8],
    "Cabernet Sauvignon": [5, 15],
    "Malbec":             [3, 10],
    "Tannat":             [5, 15],
    "Pinot Noir":         [2, 7],
    "Merlot":             [2, 6],
    "Syrah":              [3, 8],
    "Cabernet Franc":     [3, 10],
    "Petit Verdot":       [4, 12],
    "Bonarda":            [2, 5],
    "Tempranillo":        [3, 8],
  },
  white: {
    default:           [0, 3],
    "Chardonnay":      [1, 5],
    "Torrontés":       [0, 2],
    "Sauvignon Blanc": [0, 2],
    "Sémillon":        [2, 8],
    "Viognier":        [0, 3],
  },
  rosé:      { default: [0, 2] },
  sparkling: { default: [0, 3] },
  fortified: { default: [5, 20] },
};

/**
 * Devuelve `{ status, from, until }`.
 *
 * `status` es "early" | "peak" | "past" | "unknown", y es lo único que mira el
 * servidor. `from`/`until` viajan por si hace falta ordenar o explicar una
 * decisión del ranking; no son texto para mostrar.
 */
function getCellarStatus(wine) {
  const currentYear = new Date().getFullYear();

  // Lo que cargó el usuario manda sobre cualquier estimación.
  const manualFrom = wine.cellar?.drinkFrom;
  const manualUntil = wine.cellar?.drinkUntil;

  if (manualFrom || manualUntil) {
    return buildResult(currentYear, manualFrom || currentYear, manualUntil || currentYear + 50);
  }

  // Sin añada no se puede calcular.
  if (!wine.vintage) return { status: "unknown" };

  const typeRanges = OPTIMAL_RANGES[wine.type];
  if (!typeRanges) return { status: "unknown" };

  // Por varietal (coincidencia parcial, sin distinguir mayúsculas).
  const varietal = wine.varietal || "";
  const rangeKey = Object.keys(typeRanges).find(
    (k) => k !== "default" && varietal.toLowerCase().includes(k.toLowerCase())
  );
  const [minYears, maxYears] = typeRanges[rangeKey] || typeRanges.default;

  return buildResult(currentYear, wine.vintage + minYears, wine.vintage + maxYears);
}

function buildResult(currentYear, from, until) {
  if (currentYear < from) return { status: "early", from, until };
  if (currentYear > until) return { status: "past", from, until };
  return { status: "peak", from, until };
}

module.exports = { getCellarStatus };
