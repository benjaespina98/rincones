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

export function getCellarStatus(wine) {
  const currentYear = new Date().getFullYear();

  const manualFrom  = wine.cellar?.drinkFrom;
  const manualUntil = wine.cellar?.drinkUntil;

  if (manualFrom || manualUntil) {
    const from  = manualFrom  || currentYear;
    const until = manualUntil || currentYear + 50;
    return buildResult(currentYear, from, until);
  }

  if (!wine.vintage) return { status: "unknown", label: "" };

  const typeRanges = OPTIMAL_RANGES[wine.type];
  if (!typeRanges) return { status: "unknown", label: "" };

  const varietal = wine.varietal || "";
  const rangeKey = Object.keys(typeRanges).find(
    (k) => k !== "default" && varietal.toLowerCase().includes(k.toLowerCase())
  );
  const [minYears, maxYears] = typeRanges[rangeKey] || typeRanges.default;

  return buildResult(currentYear, wine.vintage + minYears, wine.vintage + maxYears);
}

function buildResult(currentYear, from, until) {
  if (currentYear < from) {
    const yearsLeft = from - currentYear;
    return { status: "early", label: `Esperá ${yearsLeft} ${yearsLeft === 1 ? "año" : "años"}`, yearsLeft };
  }
  if (currentYear > until) {
    const yearsOver = currentYear - until;
    return { status: "past", label: `Pasó su mejor momento`, yearsOver };
  }
  const yearsLeft = until - currentYear;
  return {
    status: "peak",
    label: yearsLeft === 0 ? "Último año óptimo" : `Óptimo — ${yearsLeft} ${yearsLeft === 1 ? "año más" : "años más"}`,
    yearsLeft,
  };
}
