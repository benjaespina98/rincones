import { useEffect } from "react";

const MARCA = "Rincones";

/**
 * El título de la pestaña del navegador y del historial. Sin esto TODAS las pantallas se
 * llamaban «Rincones»: en el historial, en la lista de pestañas y para quien usa lector de
 * pantalla (que anuncia el título al navegar) no había forma de saber dónde se estaba.
 */
export const useDocumentTitle = (titulo) => {
  useEffect(() => {
    const limpio = String(titulo || "").trim();
    document.title = limpio ? `${limpio} · ${MARCA}` : MARCA;
  }, [titulo]);
};
