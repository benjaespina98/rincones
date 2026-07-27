// Contenido curado para "Aprendé y explorá": aprender, explorar, comunidad.
//
// Enlaces DIRECTOS a recursos reales (no búsquedas). Verificados a julio 2026 —
// si algo se da de baja con el tiempo, actualizá la URL acá.
//
// ── Por qué este shape ──────────────────────────────────────────────────────
// El modelo anterior tenía el `subtitle` armado a mano como un string único
// ("Mendoza · cada marzo"), con fecha, lugar y plataforma fusionados. Eso servía
// para 9 ítems y para nada más: no se podía ordenar por fecha, ni ocultar lo que
// ya pasó, ni filtrar por provincia. El ícono además vivía en el GRUPO, así que
// todos los eventos tenían que verse igual.
//
// Ahora cada ítem lleva sus campos por separado y el subtítulo se DERIVA. Sumar
// una feria real es completar un objeto; no hay que tocar el render.
//
//   {
//     id,                                   // único y estable
//     kind,                                 // "video" | "curso" | "evento" | "comunidad" | "visita"
//     title,
//     summary,                              // una línea: qué es y por qué importa
//     source: { name, url },                // siempre citamos de dónde sale
//     when?:  { start, end, recurrence },   // ISO, o mes recurrente ("03" = marzo)
//     place?: { city, province, venue },
//     icon?,                                // pisa el ícono del grupo
//     tags?, featured?
//   }
//
// NO invento eventos: cargar ferias y catas reales es curaduría, y datos falsos
// serían peor que no tener la sección. La arquitectura queda lista para que se
// agreguen a mano o desde el panel admin más adelante.

export const DISCOVER_GROUPS = [
  { id: "videos", label: "Para ver", icon: "play", accent: "#c6465f" },
  { id: "cursos", label: "Para aprender", icon: "graduation", accent: "#7e59c9" },
  { id: "eventos", label: "Para ir", icon: "calendar", accent: "#2fb67b" },
  { id: "comunidad", label: "Para compartir", icon: "chat", accent: "#f2b737" },
];

export const DISCOVER_ITEMS = [
  {
    id: "cata-martin-bruno",
    group: "videos",
    kind: "video",
    title: "Cómo catar vino, por Martín Bruno",
    summary: "Los cuatro pasos de una cata, explicados sin vueltas",
    source: { name: "YouTube", url: "https://www.youtube.com/watch?v=GgjdxzuW7l8" },
    tags: ["cata", "básico"],
  },
  {
    id: "cata-principiantes",
    group: "videos",
    kind: "video",
    title: "Cata de vino para principiantes",
    summary: "Desde cero: qué mirar, oler y sentir en la copa",
    source: { name: "YouTube", url: "https://www.youtube.com/watch?v=to-oQp5UzPs" },
    tags: ["cata", "básico"],
  },
  {
    id: "sol-sommelier",
    group: "cursos",
    kind: "curso",
    title: "Sol Sommelier",
    summary: "Masterclasses y e-books gratuitos, en castellano",
    source: { name: "Web oficial", url: "https://www.solsommelier.com.ar/" },
    place: { province: "Argentina" },
    tags: ["gratis"],
  },
  {
    id: "wset",
    group: "cursos",
    kind: "curso",
    title: "WSET",
    summary: "La certificación de vino más reconocida del mundo",
    source: { name: "Web oficial", url: "https://www.wsetglobal.com/" },
    tags: ["certificación"],
  },
  {
    id: "vendimia",
    group: "eventos",
    kind: "evento",
    title: "Fiesta Nacional de la Vendimia",
    summary: "La celebración de la cosecha más grande del país",
    source: {
      name: "Wikipedia",
      url: "https://es.wikipedia.org/wiki/Fiesta_Nacional_de_la_Vendimia",
    },
    when: { recurrence: "03" }, // cada marzo
    place: { city: "Mendoza", province: "Mendoza" },
    featured: true,
  },
  {
    id: "catatu",
    group: "comunidad",
    kind: "comunidad",
    title: "CataTú",
    summary: "Canal de vino en español, con catas y recomendaciones",
    source: {
      name: "YouTube",
      url: "https://www.youtube.com/channel/UCnX3wjgErD_rZMoDNcbjxlg",
    },
  },
  {
    id: "reddit-wine",
    group: "comunidad",
    kind: "comunidad",
    title: "r/wine",
    summary: "Preguntas, hallazgos y debates de todo el mundo",
    source: { name: "Reddit", url: "https://www.reddit.com/r/wine/" },
  },
];

const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/**
 * Fecha legible a partir de `when`, o null si el ítem no tiene fecha.
 *
 * Para los eventos anuales calcula la PRÓXIMA edición en vez de decir "cada
 * marzo": en julio esa frase se lee como si estuviera pasando ahora, cuando en
 * realidad faltan ocho meses. "marzo 2027" ubica sin engañar.
 */
const formatWhen = (when, now = new Date()) => {
  if (!when) return null;
  if (when.recurrence) {
    const idx = Number(when.recurrence) - 1;
    if (!MONTHS[idx]) return null;
    const year = idx < now.getMonth() ? now.getFullYear() + 1 : now.getFullYear();
    return `${MONTHS[idx]} ${year}`;
  }
  if (!when.start) return null;
  return new Date(when.start).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
  });
};

/**
 * Subtítulo derivado de los campos estructurados, en vez de escrito a mano.
 * Orden: lugar · fecha · fuente — de lo más concreto a lo más genérico.
 */
export const itemSubtitle = (item) => {
  const parts = [
    item.place?.venue || item.place?.city || item.place?.province,
    formatWhen(item.when),
    item.source?.name,
  ];
  return parts.filter(Boolean).join(" · ");
};

/**
 * Ítems visibles hoy, agrupados. Los eventos con fecha ya pasada se ocultan
 * solos: antes la Vendimia se mostraba igual en julio, que es justo cuando no
 * sirve de nada. Los grupos que quedan sin ítems no se renderizan.
 */
export const visibleContent = (now = new Date()) => {
  const today = now.getTime();

  const live = DISCOVER_ITEMS.filter((item) => {
    const end = item.when?.end || item.when?.start;
    return !end || new Date(end).getTime() >= today;
  });

  return DISCOVER_GROUPS.map((group) => ({
    ...group,
    items: live.filter((i) => i.group === group.id),
  })).filter((g) => g.items.length > 0);
};
