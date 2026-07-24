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
    icon: "▶️",
    items: [
      { title: "Cómo catar un vino como sommelier", subtitle: "Video · principiantes", url: yt("cómo catar un vino sommelier paso a paso") },
      { title: "Malbec argentino: qué lo hace único", subtitle: "Video · terroir", url: yt("malbec argentino terroir mendoza documental") },
    ],
  },
  {
    id: "cursos",
    label: "Cursos",
    icon: "🎓",
    items: [
      { title: "Iniciación al mundo del vino", subtitle: "Curso online", url: google("curso iniciación al vino online argentina") },
      { title: "Formación de sommelier", subtitle: "Carreras y talleres", url: google("curso sommelier argentina presencial y online") },
    ],
  },
  {
    id: "eventos",
    label: "Eventos",
    icon: "📅",
    items: [
      { title: "Fiesta Nacional de la Vendimia", subtitle: "Mendoza · cada marzo", url: google("Fiesta Nacional de la Vendimia Mendoza fechas") },
      { title: "Catas y ferias cerca tuyo", subtitle: "Agenda", url: google("ferias y catas de vino en Argentina próximos eventos") },
    ],
  },
  {
    id: "comunidad",
    label: "Comunidad",
    icon: "💬",
    items: [
      { title: "Bodegas argentinas en Instagram", subtitle: "Seguí a tus favoritas", url: google("bodegas argentinas instagram") },
      { title: "r/wine en Reddit", subtitle: "Comunidad global", url: "https://www.reddit.com/r/wine/" },
    ],
  },
];
