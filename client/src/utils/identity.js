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
