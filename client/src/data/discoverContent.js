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
//     badge?,                               // lo que conviene saber ANTES de tocar
//     tags?, featured?
//   }
//
// ── SOBRE `badge` ───────────────────────────────────────────────────────────
// Los seis ítems se veían exactamente iguales, así que un curso pago del Reino
// Unido pesaba lo mismo que un video argentino de diez minutos, y sólo te
// enterabas después del clic. El badge dice lo único que cambia la decisión de
// tocar o no: si es gratis, si está en inglés. Va sólo donde aporta — poner
// "en castellano" en los cuatro que lo están es ruido, no jerarquía.
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
// Lo que queda acá es lo que NO caduca: videos y cursos. La música casi toda se
// genera (ver `musicItems`); el único fijo es el bloque de Deep Progressive, que
// no depende de la hora y por eso vive escrito.

import { suggestedPlaylists, playlistUrl, DEEP_PROGRESSIVE } from "./playlists";

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
    id: "lecturas",
    label: "Para leer",
    hint: "Para leer con una copa",
    icon: "list",
    accent: "#7e59c9",
  },
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
  /* ── Los dos grupos que hoy nacen vacíos ─────────────────────────────────
     No tienen ítems curados: se llenan sólo con lo que se cargue desde el
     panel (notas, bodegas, eventos que no se llevaron la tarjeta grande). Un
     grupo sin ítems no se renderiza, así que estar declarados acá no cuesta un
     píxel — y el día que se cargue la primera nota, aparece en su lugar sin
     tocar código.

     Ésta es la parte concreta de "preparar la arquitectura para soportar
     distintos tipos de contenido": el tipo nuevo ya tiene dónde caer. */
  /* Los `hint` de acá arriba ("Catas y guías para ver tranquilo", "De la
     curiosidad al diploma") ya tienen voz propia y se quedan como están. Los de
     estos dos decían "Notas y lecturas sobre vino" y "Bodegas y eventos": el
     rótulo repetido en otras palabras, que es exactamente el relleno que se
     escribe cuando un campo pide texto y no hay nada que agregar. */
  {
    id: "lugares",
    label: "Para ir",
    hint: "Para salir a conocer",
    icon: "map-pin",
    accent: "#f2b737",
  },
  /* ── Música ───────────────────────────────────────────────────────────────
     Reemplazó a "Comunidad" (un canal de YouTube y r/wine). Esos dos eran los
     enlaces más flojos de la lista: uno en inglés, los dos hacia foros que no
     tienen nada que ver con la botella que tenés en la mano, y ninguno con una
     razón para volver. Si alguna vez hay comunidad de verdad, va a ser adentro
     de la app y no un link a Reddit.

     La música, en cambio, sí es parte de tomar un vino, ya estaba probada en la
     ficha (el plan de la botella sugiere una playlist) y a diferencia del resto
     de esta sección CAMBIA: las dos que salen dependen de la hora y del día.
     Verde, que es el color con el que todo el mundo lee "Spotify". */
  {
    id: "musica",
    label: "Música",
    hint: "Para poner mientras descorchás",
    icon: "music",
    accent: "#1db954",
  },
];

/**
 * El `kind` de cada ítem pasó a ser `type`, la misma clave que usan las
 * campañas del panel (ver data/contentTypes.js). No es un renombre cosmético:
 * es lo que permite que un video curado y un video cargado desde el panel caigan
 * en el mismo grupo y los dibuje la misma tarjeta, sin que el feed tenga que
 * saber de dónde vino cada uno.
 */
export const DISCOVER_ITEMS = [
  {
    id: "cata-martin-bruno",
    group: "videos",
    type: "video",
    title: "Cómo catar vino, por Martín Bruno",
    summary: "Los cuatro pasos de una cata, explicados sin vueltas",
    source: { name: "YouTube", url: "https://www.youtube.com/watch?v=GgjdxzuW7l8" },
    tags: ["cata", "básico"],
  },
  {
    id: "cata-principiantes",
    group: "videos",
    type: "video",
    title: "Cata de vino para principiantes",
    summary: "Desde cero: qué mirar, oler y sentir en la copa",
    source: { name: "YouTube", url: "https://www.youtube.com/watch?v=to-oQp5UzPs" },
    tags: ["cata", "básico"],
  },
  {
    id: "sol-sommelier",
    group: "cursos",
    type: "course",
    title: "Sol Sommelier",
    summary: "Masterclasses y e-books gratuitos, en castellano",
    source: { name: "Web oficial", url: "https://www.solsommelier.com.ar/" },
    place: { province: "Argentina" },
    tags: ["gratis"],
    badge: "Gratis",
  },
  {
    id: "wset",
    group: "cursos",
    type: "course",
    title: "WSET",
    summary: "La certificación de vino más reconocida del mundo",
    source: { name: "Web oficial", url: "https://www.wsetglobal.com/" },
    tags: ["certificación"],
    badge: "Pago · inglés",
  },
  /* ── Libros ────────────────────────────────────────────────────────────────
     En español, y sólo los que se verificaron abriendo la página oficial del editor (Blume) y que
     carguen. Antes de sumar uno, abrir la URL y confirmar título y autor: no se inventan enlaces. */
  {
    id: "libro-atlas-mundial-del-vino",
    group: "lecturas",
    type: "book",
    title: "Atlas mundial del vino",
    summary: "Hugh Johnson y Jancis Robinson: las regiones del mundo, con 230 mapas",
    source: { name: "Blume", url: "https://blume.net/enologia/2026-atlas-mundial-del-vino-9788418075933.html" },
    tags: ["regiones", "referencia"],
    badge: "En español",
  },
  {
    id: "libro-permitame-que-le-hable-sobre-el-vino",
    group: "lecturas",
    type: "book",
    title: "Permítame que le hable sobre el vino",
    summary: "Oz Clarke: cómo elegir, servir y disfrutar el vino, sin tecnicismos",
    source: { name: "Blume", url: "https://blume.net/enologia/25-permitame-que-le-hable-sobre-el-vino-9788416138005.html" },
    tags: ["básico", "guía"],
    badge: "En español",
  },
];

/*
 * Acá estaban `catatu` (canal de YouTube) y `reddit-wine`, el grupo "Comunidad".
 * Se fueron con el grupo: ver el comentario en DISCOVER_GROUPS. Están en el
 * historial de git si alguna vez vuelven.
 */

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

/*
 * Acá estaba `pickFeatured`, que elegía el contenido protagonista de la sección.
 * El destacado se sacó de la home: mostraba en grande un ítem que ya estaba en
 * la lista —había que excluirlo del listado para no verlo dos veces— en la parte
 * más pesada de una pantalla que ya estaba cargada.
 */

/**
 * Ítems visibles hoy, agrupados. Los eventos con fecha ya pasada se ocultan
 * solos: antes la Vendimia se mostraba igual en julio, que es justo cuando no
 * sirve de nada. Los grupos que quedan sin ítems no se renderizan.
 *
 * Ya no recibe un `excludeId`: existía para sacar del listado al que se mostraba
 * como destacado, y ese destacado no está más.
 */
/**
 * Las dos playlists del momento, con el shape de un ítem del directorio.
 *
 * A diferencia de los videos y los cursos, estas NO están escritas en la lista
 * de arriba: se derivan de la hora y del día (ver data/playlists.js). Es lo
 * único de esta sección que cambia solo, y por eso vale la pena el rodeo de
 * generarlas en vez de tipear dos enlaces fijos más.
 *
 * Las playlists son las mismas siete oficiales de Spotify que ya usa el plan de
 * la ficha, verificadas una por una: no se suma ni un link que se pueda romper.
 */
const musicItems = (now) => [
  ...suggestedPlaylists(now.getHours(), now.getDay()).map((p) => ({
    id: `playlist-${p.id}`,
    group: "musica",
    type: "playlist",
    title: p.name,
    summary: p.mood,
    // Para qué mesa es. Es lo que convierte dos links a Spotify en parte de una
    // app de vino: la música sola no dice nada, pegada a un momento sí. Sale de
    // la misma hora y el mismo día que ya eligieron la playlist (ver
    // data/playlists.js), así que no afirma nada que no estemos suponiendo ya.
    badge: p.momento || "",
    source: { name: "Spotify", url: playlistUrl(p) },
  })),
  // El bloque fijo: no lo elige la hora, así que no lleva "para qué mesa es"
  // (`badge` vacío) — decir un momento inventado sería afirmar algo que esta
  // playlist no supone. Va tercera y no reemplaza a ninguna de las dos de
  // arriba: son gustos distintos, no la misma oferta con otra etiqueta.
  {
    id: `playlist-${DEEP_PROGRESSIVE.id}`,
    group: "musica",
    type: "playlist",
    title: DEEP_PROGRESSIVE.name,
    summary: DEEP_PROGRESSIVE.mood,
    badge: "",
    source: { name: "Spotify", url: playlistUrl(DEEP_PROGRESSIVE) },
  },
];

/**
 * Un ítem curado con la forma que espera `ContentCard`.
 *
 * La curaduría se sigue escribiendo con los campos que le quedan cómodos a
 * quien la edita (`source`, `place`, `when`), y acá se traduce a la forma común
 * —igual que `fromPromotion` traduce lo que viene del panel—. Las dos fuentes
 * llegan a la tarjeta iguales y la tarjeta no sabe cuál es cuál.
 */
const aContenido = (item) => ({
  id: item.id,
  type: item.type,
  title: item.title,
  summary: item.summary,
  url: item.source?.url || "",
  meta: itemSubtitle(item),
  badge: item.badge || "",
});

export const visibleContent = (now = new Date()) => {
  const today = now.getTime();
  const live = [...DISCOVER_ITEMS.filter((i) => isLive(i, today)), ...musicItems(now)];

  return DISCOVER_GROUPS.map((group) => ({
    ...group,
    items: live.filter((i) => i.group === group.id).map(aContenido),
  })).filter((g) => g.items.length > 0);
};

/** En qué grupo del feed cae cada tipo que puede venir del panel. */
const GRUPO_POR_TIPO = {
  video: "videos",
  course: "cursos",
  article: "lecturas",
  book: "lecturas",
  winery: "lugares",
  event: "lugares",
};

/**
 * Mezcla la curaduría con lo que se cargó desde el panel, en los mismos grupos.
 *
 * Es la pieza que convierte "Aprendé y explorá" de una lista de enlaces fijos en
 * un feed: un video curado y un video cargado desde el panel terminan en el
 * mismo grupo, con la misma tarjeta, y el feed no sabe cuál es cuál.
 *
 * Lo del panel va PRIMERO dentro de su grupo: es lo que cambia y lo que alguien
 * acaba de publicar; lo curado es el fondo estable que siempre está.
 */
export const mergeIntoGroups = (curados, delPanel = []) => {
  const porGrupo = new Map(DISCOVER_GROUPS.map((g) => [g.id, []]));

  for (const g of curados) {
    if (porGrupo.has(g.id)) porGrupo.get(g.id).push(...g.items);
  }

  for (const item of delPanel) {
    const destino = GRUPO_POR_TIPO[item.type];
    if (destino && porGrupo.has(destino)) porGrupo.get(destino).unshift(item);
  }

  return DISCOVER_GROUPS.map((g) => ({ ...g, items: porGrupo.get(g.id) || [] }));
};
