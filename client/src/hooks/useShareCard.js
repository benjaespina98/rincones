import { useCallback, useState } from "react";
import { buildShareCardFile } from "../utils/shareCard";
import { wineDisplayName } from "../utils/wineIdentity";

/**
 * Compartir un vino (y, si hay, una cata) como ficha de historia.
 *
 * ── LAS DOS PUERTAS, EN ORDEN ────────────────────────────────────────────────
 * `navigator.share` con archivos existe hace tiempo; lo que no todos los
 * navegadores saben es si PUEDEN compartir ESE archivo en particular —
 * `canShare` es la forma correcta de preguntarlo antes de intentar, en vez de
 * lanzar `share()` a ciegas y enterarse por el catch. Cuando no se puede
 * (desktop, navegador viejo), se descarga el .jpg derecho: la persona se queda
 * con la imagen igual, y desde la galería la comparte por donde quiera.
 *
 * ── POR QUÉ ES UN HOOK Y NO UNA FUNCIÓN SUELTA ──────────────────────────────
 * Porque dibujar la ficha no es instantáneo (carga la imagen de la botella,
 * espera la tipografía) y el botón que lo dispara necesita saber que hay algo
 * en curso para no ofrecer un segundo toque mientras tanto. `buildShareCardFile`
 * —la parte pura, sin React— vive en utils/shareCard.js y se puede probar sin
 * montar nada; acá sólo se orquesta el estado y las dos puertas de salida.
 */
export const useShareCard = () => {
  const [sharing, setSharing] = useState(false);

  /**
   * Descarga forzada: el plan B cuando no hay Web Share (o cuando lo hay pero
   * falla por algo que no es "canceló la persona"). El link nunca se agrega
   * visible a la pantalla ni sobrevive más de lo que tarda el clic — y
   * `URL.revokeObjectURL` importa: sin él, cada ficha compartida en una sesión
   * larga deja su blob vivo en memoria.
   */
  const descargar = (file) => {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    // Un tick después: revocar en el mismo instante del click puede cortar la
    // descarga en algún navegador que la arranca de forma asíncrona.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /**
   * @param {object} wine El vino (nombre, bodega, uva, imagen…).
   * @param {object|null} moment Una cata puntual (puntaje, reseña, ocasión) o
   *   `null` para compartir el vino solo.
   * @returns "shared" | "downloaded" | "cancelled" | "error", para que quien
   *   llama decida qué avisar — acá no hay ningún toast, porque ese texto es
   *   decisión de la pantalla, no del hook.
   */
  const shareCard = useCallback(async (wine, moment = null) => {
    setSharing(true);
    try {
      const file = await buildShareCardFile(wine, moment);

      const puedeCompartirArchivo =
        typeof navigator !== "undefined" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });

      if (puedeCompartirArchivo) {
        try {
          await navigator.share({
            files: [file],
            title: "Rincones",
            text: `🍷 ${wineDisplayName(wine)} — desde Rincones`,
          });
          return "shared";
        } catch (err) {
          // Cerrar el menú de compartir sin elegir nada no es un error: es la
          // respuesta más común de todas y no tiene por qué caer al plan B.
          if (err?.name === "AbortError") return "cancelled";
          // Cualquier otra falla (permiso, navegador que miente en `canShare`)
          // sí cae al plan B: mejor una descarga que ningún archivo.
        }
      }

      descargar(file);
      return "downloaded";
    } catch {
      return "error";
    } finally {
      setSharing(false);
    }
  }, []);

  return { sharing, shareCard };
};
