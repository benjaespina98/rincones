import { useState, useEffect, useCallback } from "react";
import { getWishes, createWish, updateWish, deleteWish } from "../services/wishApi";

/**
 * ── LA LISTA QUE YA SE BAJÓ NO SE VUELVE A ESPERAR ──────────────────────────
 * Mismo caché de módulo que `useWineCollection`, y por la misma razón: desde
 * que "Quiero probar" es una vista de Mi Bodega, este hook se monta junto con
 * la colección en la pantalla más usada de la app. Sin caché, cada entrada a
 * Mi Bodega —incluida la vuelta desde la ficha de un vino— pagaba un viaje de
 * red para redibujar exactamente lo mismo.
 *
 * `null` es "nunca se cargó" y es distinto de `[]`, que es una lista vacía de
 * verdad: sin esa distinción, quien todavía no guardó nada vería el estado
 * vacío antes de que llegara la respuesta.
 *
 * Se revalida SIEMPRE al montar: lo guardado se muestra, no se cree.
 */
let cacheDeDeseos = null;

/**
 * Tira el caché. La llama el cierre de sesión, igual que con la bodega: la
 * lista es de una persona y el siguiente que entre en este navegador no puede
 * ver ni medio segundo de la del anterior.
 */
export const limpiarCacheDeDeseos = () => {
  cacheDeDeseos = null;
};

/**
 * Cuántas escrituras se aplicaron. Una carga que salió antes de una escritura y
 * vuelve después trae la lista de antes: se descarta y se pide de nuevo.
 */
let escrituras = 0;

/** Sólo para tests: el contador es del módulo y sobrevive entre casos. */
export const reiniciarEscrituras = () => {
  escrituras = 0;
};

export function useWishlist() {
  const [wishes, setWishes] = useState(() => cacheDeDeseos || []);
  const [loading, setLoading] = useState(cacheDeDeseos === null);
  // Distinguir "no tenés guardados" de "no pudimos cargarlos": mostrar el estado
  // vacío ante un fallo de red hace creer al usuario que perdió sus vinos.
  const [error, setError] = useState(null);

  const loadWishes = useCallback(async () => {
    // Con algo ya en pantalla esto es una revalidación: ni esqueleto ni error.
    const revalidando = cacheDeDeseos !== null;
    try {
      if (!revalidando) setLoading(true);
      setError(null);
      let data;
      let fresca = false;
      for (let intento = 0; intento < 3 && !fresca; intento += 1) {
        const antes = escrituras;
        data = await getWishes();
        fresca = escrituras === antes;
      }
      // Tres cargas viejas seguidas: con caché (que ya tiene las escrituras) se
      // lo deja; sin caché, lo último recibido es mejor que un vacío que miente.
      if (!fresca && revalidando) return;
      cacheDeDeseos = data;
      setWishes(data);
    } catch {
      // Si la red falla pero ya tenemos una lista buena, no hay nada que
      // avisar: reemplazarla por un cartel sería perder datos válidos por un
      // problema pasajero.
      if (!revalidando) setError("No se pudieron cargar tus guardados.");
    } finally {
      if (!revalidando) setLoading(false);
    }
  }, []);

  useEffect(() => { loadWishes(); }, [loadWishes]);

  /**
   * Toda escritura pasa por acá: el caché y lo que se ve tienen que moverse
   * juntos, o al volver a entrar reaparece la versión vieja.
   */
  const aplicar = useCallback((actualizar) => {
    escrituras += 1;
    setWishes((prev) => {
      const siguiente = actualizar(prev);
      cacheDeDeseos = siguiente;
      return siguiente;
    });
  }, []);

  const addWish = useCallback(async (payload) => {
    const wish = await createWish(payload);
    aplicar((prev) => [wish, ...prev.filter((w) => w._id !== wish._id)]);
    return wish;
  }, [aplicar]);

  const removeWish = useCallback(async (id) => {
    await deleteWish(id);
    aplicar((prev) => prev.filter((w) => w._id !== id));
  }, [aplicar]);

  const toggleWishFavorite = useCallback(async (id, favorite) => {
    const updated = await updateWish(id, { favorite });
    aplicar((prev) => prev.map((w) => (w._id === id ? updated : w)));
    return updated;
  }, [aplicar]);

  return { wishes, loading, error, addWish, removeWish, toggleWishFavorite, reload: loadWishes };
}
