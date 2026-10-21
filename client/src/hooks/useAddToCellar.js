import { useCallback, useState } from "react";
import { createWine, deleteWine } from "../services/wineApi";
import { getWishes, deleteWish } from "../services/wishApi";
import { limpiarCacheDeDeseos } from "./useWishlist";
import { catalogWineToPayload, esElMismoVino } from "../utils/catalogWine";
import { mensajeDelServidor } from "../utils/mensajeDelServidor";
import { successHaptic } from "../utils/haptics";
import { trackEvent } from "../services/analyticsApi";
import { useToast } from "../context/ToastContext";

/**
 * Si lo habías guardado para probar, ya no: tenerlo en las dos listas dice a la vez "lo quiero" y "lo tengo".
 * Es un detalle, no el alta: si falla no se avisa.
 */
const quitarDeGuardados = async (wine) => {
  try {
    const deseos = await getWishes();
    const iguales = deseos.filter((d) => esElMismoVino(d, wine));
    if (iguales.length === 0) return;
    await Promise.all(iguales.map((d) => deleteWish(d._id)));
    limpiarCacheDeDeseos();
  } catch {
    /* la lista queda como estaba */
  }
};

/**
 * Agregar a la bodega un vino que salió de buscar, sin pasar por la cámara ni por la pantalla de
 * revisión. Maneja la hoja (qué vino está abierto), el alta y los avisos, con el mismo "Deshacer"
 * que tiene el escáner: recién se creó, así que deshacer es borrarlo.
 *
 * `alAgregar(wine, { quantity, merged, deshecho })` deja a la pantalla marcar ese vino como suyo.
 */
export function useAddToCellar({ alAgregar, source = "busqueda" } = {}) {
  const { addToast, removeToast, showSuccess, showError } = useToast();
  const [vino, setVino] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const abrir = useCallback((wine) => setVino(wine), []);
  const cerrar = useCallback(() => setVino(null), []);

  const confirmar = useCallback(
    async (cantidad) => {
      if (!vino || guardando) return;
      const elegido = vino;
      setGuardando(true);
      try {
        const { wine: creado, merged, added } = await createWine(catalogWineToPayload(elegido, cantidad));
        successHaptic();
        trackEvent("wine_added", { source, destino: cantidad === 0 ? "afuera" : "bodega" });
        setVino(null);
        alAgregar?.(elegido, { quantity: cantidad, merged });
        quitarDeGuardados(elegido);

        if (merged) {
          const n = Number(added) || 0;
          addToast(
            n > 0
              ? `Ya tenías "${creado.name}": sumamos ${n === 1 ? "1 botella" : `${n} botellas`}`
              : `Ya tenías "${creado.name}": quedó como estaba`,
            "success",
            6000
          );
          return;
        }
        const id = addToast(
          cantidad === 0 ? `"${creado.name}" anotado como ya tomado` : `"${creado.name}" agregado a tu bodega`,
          "success",
          8000,
          {
            label: "Deshacer",
            onClick: async () => {
              removeToast(id);
              try {
                await deleteWine(creado._id);
                alAgregar?.(elegido, { quantity: 0, merged: false, deshecho: true });
                showSuccess(`"${creado.name}" ya no está en tu bodega`);
              } catch {
                showError("No se pudo deshacer");
              }
            },
          }
        );
      } catch (err) {
        showError(mensajeDelServidor(err, "No se pudo agregar el vino. Probá de nuevo."));
      } finally {
        setGuardando(false);
      }
    },
    [vino, guardando, alAgregar, source, addToast, removeToast, showSuccess, showError]
  );

  return { vino, guardando, abrir, cerrar, confirmar };
}
