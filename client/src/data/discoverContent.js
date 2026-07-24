// Contenido curado para la sección "Descubrí": aprender, explorar, comunidad.
//
// Punto de partida editable. Para no inventar URLs específicas que podrían estar
// mal, la mayoría apunta a búsquedas (siempre válidas y útiles). Reemplazalos
// por tus propios enlaces/curaduría cuando quieras (canales, cursos, eventos).

const yt = (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
const google = (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;

export const DISCOVER_CONTENT = [
  {
    id: "videos",
    label: "Videos",
    icon: "play",
    accent: "#c6465f",
    items: [
      { title: "Cómo catar un vino como sommelier", subtitle: "6 min · para arrancar", url: yt("cómo catar un vino sommelier paso a paso") },
      { title: "Malbec: por qué es la joya argentina", subtitle: "Terroir de altura", url: yt("malbec argentino terroir mendoza documental") },
    ],
  },
  {
    id: "cursos",
    label: "Cursos",
    icon: "graduation",
    accent: "#7e59c9",
    items: [
      { title: "Iniciación al mundo del vino", subtitle: "Curso online", url: google("curso iniciación al vino online argentina") },
      { title: "Ser sommelier en Argentina", subtitle: "Carreras y talleres", url: google("curso sommelier argentina presencial y online") },
    ],
  },
  {
    id: "eventos",
    label: "Eventos",
    icon: "calendar",
    accent: "#2fb67b",
    items: [
      { title: "Fiesta Nacional de la Vendimia", subtitle: "Mendoza · cada marzo", url: google("Fiesta Nacional de la Vendimia Mendoza fechas") },
      { title: "Catas y ferias cerca tuyo", subtitle: "Agenda actualizada", url: google("ferias y catas de vino en Argentina próximos eventos") },
    ],
  },
  {
    id: "comunidad",
    label: "Comunidad",
    icon: "chat",
    accent: "#f2b737",
    items: [
      { title: "Bodegas argentinas en Instagram", subtitle: "Seguí a tus favoritas", url: google("bodegas argentinas instagram") },
      { title: "r/wine en Reddit", subtitle: "Comunidad global", url: "https://www.reddit.com/r/wine/" },
    ],
  },
];
