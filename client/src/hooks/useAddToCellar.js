import { useCallback, useState } from "react";
import { createWine, deleteWine, updateWine } from "../services/wineApi";
import { getWishes, deleteWish, createWish } from "../services/wishApi";
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
    if (iguales.length === 0) return null;
    await Promise.all(iguales.map((d) => deleteWish(d._id)));
    limpiarCacheDeDeseos();
    // Lo que el deseo tenía y el vino tiene que heredar: el corazón y las notas.
    return {
      favorite: iguales.some((d) => d.favorite === true),
      notes: iguales.map((d) => String(d.notes || "").trim()).find(Boolean) || "",
      // Los deseos tal cual estaban: si se deshace el alta hay que devolverlos.
      borrados: iguales,
    };
  } catch {
    /* la lista queda como estaba */
    return null;
  }
};

/** Vuelve a crear los deseos que el alta había quitado. Es un detalle: si falla no rompe el deshacer. */
const devolverDeseos = async (heredado) => {
  const deseos = heredado?.borrados || [];
  await Promise.all(
    deseos.map((d) =>
      createWish({
        name: d.name,
        winery: d.winery,
        type: d.type,
        region: d.region,
        varietal: d.varietal,
        vintage: d.vintage,
        notes: d.notes,
        image: d.image,
        favorite: d.favorite,
        source: d.source,
        priority: d.priority,
      }).catch(() => {})
    )
  );
  if (deseos.length > 0) limpiarCacheDeDeseos();
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
        // Fuera de la espera del alta, y sin que un fallo la afecte: el corazón y las notas del deseo pasan al vino.
        const deseosQuitados = quitarDeGuardados(elegido);
        deseosQuitados.then(async (heredado) => {
          if (!heredado || (!heredado.favorite && !heredado.notes)) return;
          const cambios = {};
          if (heredado.favorite && creado.favorite !== true) cambios.favorite = true;
          if (heredado.notes && !String(creado.notes || "").trim()) cambios.notes = heredado.notes;
          if (Object.keys(cambios).length > 0) await updateWine(creado._id, cambios).catch(() => {});
        });

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
                // Si el vino salió de un deseo, deshacer el alta tiene que devolver el deseo:
                // si no, el toque equivocado borra las DOS cosas (vino y deseo).
                await devolverDeseos(await deseosQuitados);
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
