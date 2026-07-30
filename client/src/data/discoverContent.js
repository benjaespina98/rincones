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
// ── ACÁ NO VAN EVENTOS ──────────────────────────────────────────────────────
// La regla es una sola: si tiene FECHA, va por el panel; si es atemporal, va acá.
//
// Esta lista tenía un grupo "Eventos" con la Fiesta de la Vendimia adentro. Se
// escribió cuando no existía el panel de campañas, y su propio comentario decía
// que la arquitectura quedaba lista "para que se agreguen desde el panel admin más
// adelante". Ese más adelante ya llegó.
//
// Tener eventos en los dos lados no rompía nada, pero permitía que el MISMO evento
// apareciera dos veces en la misma pantalla —una desde el panel, otra desde acá— y
// ninguna de las dos fuentes sabe de la existencia de la otra. Con el evento en un
// solo lugar, eso no puede pasar.
//
// Además, un evento que vive en el código sólo se puede apagar desplegando: si se
// suspende una feria, la app la sigue anunciando hasta el próximo deploy. Una
// campaña se apaga con un toque y tiene su ventana de vigencia.
//
// Lo que queda acá es lo que NO caduca: videos, cursos y comunidad.

/**
 * Las secciones, en orden de aparición.
 *
 * El título dice QUÉ es, sin vueltas: en una app que quiere verse profesional,
 * tener que interpretar un nombre para saber qué vas a encontrar es fricción.
 * El `hint` es el que aporta el contexto y el tono.
 *
 * Agregar una sección es agregar una línea acá: los grupos sin ítems no se
 * renderizan, así que se puede dejar preparada antes de tener el contenido.
 */
export const DISCOVER_GROUPS = [
  {
    id: "videos",
    label: "Videos",
    hint: "Catas y guías para ver tranquilo",
    icon: "play",
    accent: "#e0637d",
  },
  {
    id: "cursos",
    label: "Cursos",
    hint: "De la curiosidad al diploma",
    icon: "graduation",
    accent: "#7e59c9",
  },
  {
    id: "comunidad",
    label: "Comunidad",
    hint: "Donde se sigue hablando de vino",
    icon: "chat",
    accent: "#f2b737",
  },
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
const isLive = (item, today) => {
  const end = item.when?.end || item.when?.start;
  return !end || new Date(end).getTime() >= today;
};

/**
 * El contenido protagonista de la sección.
 *
 * Prioridad: lo marcado como `featured`, después lo que tenga fecha más próxima
 * (un evento que se viene siempre es más interesante que un video que va a estar
 * ahí siempre), y si no hay nada de eso, el primer ítem.
 *
 * Cuando mañana se carguen ferias y catas reales, el destacado se elige solo:
 * no hay que tocar el render ni marcar nada a mano.
 */
export const pickFeatured = (now = new Date()) => {
  const today = now.getTime();
  const live = DISCOVER_ITEMS.filter((i) => isLive(i, today));
  if (live.length === 0) return null;

  const flagged = live.filter((i) => i.featured);
  const pool = flagged.length > 0 ? flagged : live;

  const when = (i) => {
    if (i.when?.start) return new Date(i.when.start).getTime();
    if (i.when?.recurrence) {
      const m = Number(i.when.recurrence) - 1;
      const year = m < now.getMonth() ? now.getFullYear() + 1 : now.getFullYear();
      return new Date(year, m, 1).getTime();
    }
    return Infinity; // sin fecha: nunca urge
  };

  return [...pool].sort((a, b) => when(a) - when(b))[0];
};

/**
 * Ítems visibles hoy, agrupados. Los eventos con fecha ya pasada se ocultan
 * solos: antes la Vendimia se mostraba igual en julio, que es justo cuando no
 * sirve de nada. Los grupos que quedan sin ítems no se renderizan.
 *
 * `excludeId` saca del listado al que ya se está mostrando como destacado, para
 * que no aparezca dos veces en la misma pantalla.
 */
export const visibleContent = (now = new Date(), excludeId = null) => {
  const today = now.getTime();
  const live = DISCOVER_ITEMS.filter((i) => isLive(i, today) && i.id !== excludeId);

  return DISCOVER_GROUPS.map((group) => ({
    ...group,
    items: live.filter((i) => i.group === group.id),
  })).filter((g) => g.items.length > 0);
};
