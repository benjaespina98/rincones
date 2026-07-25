// Compartir un vino. Usa la Web Share API (menú nativo del celu: WhatsApp,
// Instagram, etc.). Si no está disponible (desktop viejo), cae a WhatsApp web
// y, si todo falla, copia al portapapeles.

const APP_URL = "https://rincones.vercel.app";

const buildText = (wine) => {
  const origin = [wine.winery, wine.region].filter(Boolean).join(" · ");
  const lines = [
    `🍷 ${wine.name}${origin ? ` — ${origin}` : ""}`,
    wine.varietal ? `Varietal: ${wine.varietal}` : "",
    "Te lo recomiendo desde Rincones 🍇",
  ].filter(Boolean);
  return lines.join("\n");
};

// Devuelve "shared" | "whatsapp" | "copied" | "error" para que la UI avise.
export const shareWine = async (wine) => {
  const text = buildText(wine);
  const shareData = { title: "Rincones", text, url: APP_URL };

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share(shareData);
      return "shared";
    } catch (err) {
      // El usuario canceló el menú: no es error.
      if (err?.name === "AbortError") return "shared";
    }
  }

  // Fallback: WhatsApp con el texto + link.
  const wa = `https://wa.me/?text=${encodeURIComponent(`${text}\n${APP_URL}`)}`;
  try {
    window.open(wa, "_blank", "noopener,noreferrer");
    return "whatsapp";
  } catch {
    // Último recurso: copiar.
  }

  try {
    await navigator.clipboard.writeText(`${text}\n${APP_URL}`);
    return "copied";
  } catch {
    return "error";
  }
};
