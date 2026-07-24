// Gamificación derivada de las estadísticas del usuario (sin backend nuevo).
//
// A partir de los datos que ya calcula la app (cantidad de vinos, probados,
// varietales, regiones, rating promedio) armamos: nivel + título, progreso al
// siguiente nivel, y una grilla de logros. Todo client-side.

const LEVELS = [
  { min: 0, title: "Curioso" },
  { min: 3, title: "Aficionado" },
  { min: 8, title: "Explorador" },
  { min: 15, title: "Conocedor" },
  { min: 30, title: "Sibarita" },
  { min: 50, title: "Sommelier" },
];

// Devuelve nivel (1-based), título, y progreso [0..1] hacia el siguiente nivel.
export const getLevel = (total = 0) => {
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i += 1) {
    if (total >= LEVELS[i].min) idx = i;
  }
  const current = LEVELS[idx];
  const next = LEVELS[idx + 1] || null;

  const progress = next
    ? Math.min(1, (total - current.min) / (next.min - current.min))
    : 1;

  return {
    level: idx + 1,
    title: current.title,
    isMax: !next,
    nextTitle: next?.title || null,
    toNext: next ? Math.max(0, next.min - total) : 0,
    progress,
  };
};

// Lista de logros con estado (desbloqueado o no) a partir de las stats.
export const getAchievements = (stats) => {
  const total = stats?.totals?.total || 0;
  const consumed = stats?.totals?.consumed || 0;
  const avg = stats?.avgRating || 0;
  const regions = stats?.topRegions?.length || 0;
  const varietals = stats?.topVarietals?.length || 0;
  const typesCovered = (stats?.countsByType || []).filter((t) => t.count > 0).length;

  const list = [
    { id: "first", icon: "🍷", label: "Primer vino", hint: "Sumá tu primer vino", done: total >= 1 },
    { id: "ten", icon: "📦", label: "Coleccionista", hint: "Llegá a 10 vinos", done: total >= 10 },
    { id: "taste1", icon: "👅", label: "Primera cata", hint: "Marcá 1 vino como probado", done: consumed >= 1 },
    { id: "taste5", icon: "🎯", label: "Catador", hint: "Probá 5 vinos", done: consumed >= 5 },
    { id: "regions", icon: "🗺️", label: "Explorador", hint: "Vinos de 3 regiones distintas", done: regions >= 3 },
    { id: "varietals", icon: "🍇", label: "Curador", hint: "5 varietales diferentes", done: varietals >= 5 },
    { id: "palate", icon: "⭐", label: "Buen paladar", hint: "Rating promedio 4+", done: avg >= 4 },
    { id: "variety", icon: "🌈", label: "Bodega surtida", hint: "3 tipos de vino distintos", done: typesCovered >= 3 },
  ];

  return list.map((a) => ({ ...a }));
};

export const countUnlocked = (achievements = []) => achievements.filter((a) => a.done).length;
