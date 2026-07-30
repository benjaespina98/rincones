/**
 * Cuándo tomarse un vino: la ventana de guarda.
 *
 * ── POR QUÉ CAMBIÓ CÓMO SE DICE ─────────────────────────────────────────────
 * Antes decía "Esperá 2 años", y nadie entiende eso. Le faltan las dos cosas que
 * lo vuelven información: DE QUÉ está hablando (¿esperar para qué?) y CONTRA QUÉ
 * se mide (¿2 años desde cuándo?). Un cartel amarillo que dice "Esperá 2 años" al
 * lado de la uva y la cosecha se lee como una advertencia sin objeto.
 *
 * Ahora se dice con el año puesto —"Mejor a partir de 2028"— y con una línea que
 * explica de dónde sale. Un año es verificable contra el calendario; "2 años" hay
 * que calcularlo mentalmente y encima envejece mal: el mismo texto guardado en una
 * captura de pantalla ya es falso al año siguiente.
 *
 * ── DE DÓNDE SALEN LOS AÑOS ─────────────────────────────────────────────────
 * De la cosecha más una ventana típica por tipo y varietal. Es una guía general del
 * ESTILO, no una medición de la botella, y la ficha lo dice con esas palabras: un
 * Malbec de guarda y un Malbec joven de la misma cosecha no tienen la misma
 * ventana, y esto no puede distinguirlos. Si el usuario carga sus propias fechas en
 * la ficha, esas mandan siempre.
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

export function getCellarStatus(wine) {
  const currentYear = new Date().getFullYear();

  const manualFrom  = wine.cellar?.drinkFrom;
  const manualUntil = wine.cellar?.drinkUntil;

  // Lo que cargó el usuario manda sobre cualquier estimación.
  if (manualFrom || manualUntil) {
    const from  = manualFrom  || currentYear;
    const until = manualUntil || currentYear + 50;
    return buildResult(currentYear, from, until, "manual");
  }

  if (!wine.vintage) return { status: "unknown", label: "" };

  const typeRanges = OPTIMAL_RANGES[wine.type];
  if (!typeRanges) return { status: "unknown", label: "" };

  const varietal = wine.varietal || "";
  const rangeKey = Object.keys(typeRanges).find(
    (k) => k !== "default" && varietal.toLowerCase().includes(k.toLowerCase())
  );
  const [minYears, maxYears] = typeRanges[rangeKey] || typeRanges.default;

  return buildResult(
    currentYear,
    wine.vintage + minYears,
    wine.vintage + maxYears,
    // Si acertamos el varietal la guía es más específica que el promedio del tipo.
    rangeKey ? "varietal" : "type"
  );
}

/**
 * `label` es el titular (corto, con el año adentro) y `detail` la línea que lo
 * explica. Son dos campos y no uno porque la pantalla los usa distinto: el titular
 * entra en un espacio chico y el detalle debajo, y meter todo en un solo string
 * obligaba a elegir entre ser corto o ser entendible.
 */
function buildResult(currentYear, from, until, source) {
  const base = { from, until, source };

  if (currentYear < from) {
    const faltan = from - currentYear;
    return {
      ...base,
      status: "early",
      label: `Mejor a partir de ${from}`,
      detail:
        faltan === 1
          ? "Es joven todavía: en un año se le pone la mejor cara."
          : `Es joven todavía: le faltan ${faltan} años para su mejor momento.`,
      yearsLeft: faltan,
    };
  }

  if (currentYear > until) {
    const pasaron = currentYear - until;
    return {
      ...base,
      status: "past",
      label: "Pasó su mejor momento",
      detail:
        pasaron === 1
          ? "Su ventana ideal cerró el año pasado. Se puede tomar igual; no esperes más."
          : `Su ventana ideal cerró en ${until}. Se puede tomar igual; no esperes más.`,
      yearsOver: pasaron,
    };
  }

  const quedan = until - currentYear;
  return {
    ...base,
    status: "peak",
    label: quedan === 0 ? `Tomalo este año` : `Listo para tomar`,
    detail:
      quedan === 0
        ? `Es su último año dentro de la ventana ideal.`
        : `Está en su mejor momento y lo sigue estando hasta ${until}.`,
    yearsLeft: quedan,
  };
}

/** De dónde salió la ventana, dicho sin vueltas. */
export const cellarSourceNote = (status) => {
  if (status?.source === "manual") return "Según las fechas que cargaste vos.";
  if (status?.source === "varietal") return "Estimado para el varietal, no medido en la botella.";
  return "Estimado para el tipo de vino, no medido en la botella.";
};
