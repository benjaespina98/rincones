// Cómo se muestra la persona en la app.
//
// Antes cada pantalla hacía `user.email.split("@")[0]`, así que el saludo de la
// home decía "Buenas noches, benjaespina98" aunque el usuario ya tuviera el
// nombre cargado en su perfil. El mail es el último recurso, no el default.

/** Nombre para saludar y para el header. Prefiere el nombre real. */
export const displayName = (user) => {
  const first = String(user?.firstName || "").trim();
  if (first) {
    // Los nombres cargados en mayúsculas ("BENJAMIN") se ven gritados.
    return first.length > 2 && first === first.toUpperCase()
      ? first[0] + first.slice(1).toLowerCase()
      : first;
  }
  const email = String(user?.email || "").trim();
  return email ? email.split("@")[0] : "Mi cuenta";
};

/** Iniciales para el avatar del header. */
export const initials = (user) => {
  const first = String(user?.firstName || "").trim();
  const last = String(user?.lastName || "").trim();
  if (first) return (first[0] + (last[0] || "")).toUpperCase();

  const email = String(user?.email || "");
  if (!email) return "U";
  const parts = email.split("@")[0].split(/[._-]/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || email[0].toUpperCase();
};

/** true si la cuenta es administradora. */
export const isAdminUser = (user) => user?.role === "admin";

/**
 * ── EL AVATAR DEJÓ DE SER UN EMOJI ──────────────────────────────────────────
 *
 * El perfil se elegía de una fila de ocho emojis: 👤 🍷 🍇 🥂 🍾 🧑‍🌾 😎 🌟.
 * Eran el único lugar de la app donde la identidad de una persona se dibujaba
 * con un glifo del sistema operativo, y por eso desentonaban de dos maneras a
 * la vez:
 *
 *   · Se ven DISTINTO en cada teléfono. El mismo perfil es un dibujo de Apple
 *     en un iPhone, uno de Google en un Android y uno de Microsoft en Windows;
 *     ninguno de los tres combina con el resto de la iconografía, que es un set
 *     propio de trazo fino y un solo color.
 *   · Y no identificaban a nadie. Con ocho opciones y muchos usuarios, dos
 *     personas con la misma copita son indistinguibles — que es justo lo
 *     contrario de para qué existe un avatar.
 *
 * Ahora la identidad son las INICIALES, que ya se mostraban en la barra de
 * arriba y en las reseñas, sobre un color que la persona elige. Es lo que hacen
 * Notion, Linear o Google Calendar, y por la misma razón: distingue de verdad,
 * se dibuja igual en todos lados y es del producto, no del sistema operativo.
 *
 * La foto de Google, cuando existe, sigue mandando sobre las dos cosas: es la
 * foto de verdad.
 *
 * ── QUÉ PASA CON LOS QUE YA HABÍAN ELEGIDO UN EMOJI ─────────────────────────
 * Nada, y a propósito: `avatarColor` sólo reconoce los siete colores y a
 * cualquier otra cosa —un emoji viejo, un valor vacío, algo tocado a mano— le
 * devuelve el primero. Así no hace falta migrar la base ni arriesgar un script
 * sobre datos de gente; el campo simplemente deja de leerse como texto.
 */
export const AVATAR_COLORS = [
  { id: "violeta", label: "Violeta" },
  { id: "vino", label: "Vino" },
  { id: "oro", label: "Oro" },
  { id: "verde", label: "Verde" },
  { id: "cielo", label: "Cielo" },
  { id: "coral", label: "Coral" },
  { id: "piedra", label: "Piedra" },
];

const IDS = new Set(AVATAR_COLORS.map((c) => c.id));

export const avatarColor = (valor) => (IDS.has(valor) ? valor : AVATAR_COLORS[0].id);
