// Helpers de imagen compartidos.
//
// Vivían dentro de LabelScanner, así que el escáner redimensionaba antes de
// subir pero el formulario de momentos NO: una foto de 5 MB del celular se
// mandaba entera como base64 (~6.7 MB de JSON) sin aviso ni progreso.

export const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

/**
 * Reduce la imagen antes de subirla: baja la latencia y el peso de red.
 *
 * `mime` es JPEG por defecto porque para una foto pesa la mitad. Para un LOGO hay
 * que pasarle "image/png": el JPEG no tiene transparencia, así que el fondo
 * transparente se rellena de negro y el logo aparece dentro de un cuadrado sólido.
 */
export const resizeImage = (file, maxDim = 1280, quality = 0.85, mime = "image/jpeg") =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (Math.max(width, height) > maxDim) {
        if (width >= height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL(mime, quality);
      canvas.toBlob(
        (blob) => (blob ? resolve({ blob, dataUrl }) : reject(new Error("resize-failed"))),
        mime,
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image-decode-failed"));
    };
    img.src = url;
  });

/**
 * Data URL lista para guardar: redimensiona y, si el navegador no puede
 * decodificar el archivo, cae al original.
 */
export const toUploadableDataUrl = async (file, maxDim = 1280) => {
  try {
    const { dataUrl } = await resizeImage(file, maxDim);
    return dataUrl;
  } catch {
    return fileToDataUrl(file);
  }
};

/**
 * Un logo listo para subir: PNG y chico.
 *
 * PNG porque un logo casi siempre tiene fondo transparente, y pasarlo a JPEG lo
 * mete en un cuadrado negro —se ve roto y nadie entiende por qué—. Y 320px porque
 * en la tarjeta se muestra a 20px de alto: subir 2000px sería mandar cien veces
 * más datos de los que se van a ver.
 */
export const toUploadableLogo = async (file, maxDim = 320) => {
  try {
    const { dataUrl } = await resizeImage(file, maxDim, 1, "image/png");
    return dataUrl;
  } catch {
    return fileToDataUrl(file);
  }
};

/**
 * Una URL para `background-image: url(...)`, a prueba de comillas y paréntesis.
 * Los datos viejos pueden traer caracteres que cierran el literal y dejarían
 * inyectar otra declaración CSS; se codifican en vez de confiar en el filtro.
 */
export const cssUrl = (src) => {
  const limpio = String(src ?? "").replace(/["'()\\\s<>]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
  return `url("${limpio}")`;
};
