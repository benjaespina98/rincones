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

/** Reduce la imagen antes de subirla: baja la latencia y el peso de red. */
export const resizeImage = (file, maxDim = 1280, quality = 0.85) =>
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
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      canvas.toBlob(
        (blob) => (blob ? resolve({ blob, dataUrl }) : reject(new Error("resize-failed"))),
        "image/jpeg",
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
