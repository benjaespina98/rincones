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

/*
 * Acá vivían los logros: ocho medallas con su estado. Se sacaron del perfil
 * porque seis de las ocho se veían apagadas, y una cuadrícula de pendientes es
 * un recordatorio de lo que NO hiciste. El nivel de arriba cuenta el mismo
 * avance con un número y sin señalar deudas.
 *
 * El código no se guarda "por si vuelven": si vuelven, van a tener otra forma, y
 * mientras tanto son cincuenta líneas que alguien tiene que leer y mantener sin
 * que nadie las ejecute. Están en el historial de git, que es donde va lo que ya
 * no se usa.
 */
