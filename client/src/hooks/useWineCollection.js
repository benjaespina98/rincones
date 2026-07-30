import { useState, useEffect, useCallback } from "react";
import {
  getWines,
  createWine as createWineApi,
  updateWine as updateWineApi,
  deleteWine as deleteWineApi,
  adjustWineStock,
  openBottle as openBottleApi,
  undoOpenBottle as undoOpenBottleApi,
  getWineStats,
} from "../services/wineApi";

export const useWineCollection = () => {
  const [wines, setWines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState({
    winesCount: 0,
    tastedWines: 0,
    averageRating: 0,
  });

  // Cargar vinos desde el API
  const loadWines = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getWines();
      setWines(data);

      // Cargar stats
      const statsData = await getWineStats();
      setStats(statsData);
    } catch (err) {
      setError("No pudimos cargar tu bodega.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Cargar vinos al montar
  useEffect(() => {
    loadWines();
  }, [loadWines]);

  const addWine = useCallback(async (wineData) => {
    const newWine = await createWineApi(wineData);
    setWines((prev) => [newWine, ...prev]);
    return newWine;
  }, []);

  const deleteWine = useCallback(async (id) => {
    await deleteWineApi(id);
    setWines((prev) => prev.filter((wine) => wine._id !== id));
  }, []);

  const updateWine = useCallback(async (id, payload) => {
    const updated = await updateWineApi(id, payload);
    setWines((prev) => prev.map((wine) => (wine._id === id ? updated : wine)));
    return updated;
  }, []);

  const updateWineRating = useCallback(
    async (id, rating) => updateWine(id, { rating }),
    [updateWine]
  );

  const updateWineTasted = useCallback(
    async (id, tasted) => updateWine(id, { tasted }),
    [updateWine]
  );

  const toggleFavorite = useCallback(
    async (id, favorite) => updateWine(id, { favorite }),
    [updateWine]
  );

  const adjustStock = useCallback(async (id, delta) => {
    const updated = await adjustWineStock(id, delta);
    setWines((prev) => prev.map((wine) => (wine._id === id ? updated : wine)));
    return updated;
  }, []);

  /**
   * Abrir una botella: descuenta una y deja el vino como probado, de una.
   * "Probado" es un hecho de tu historial y no se toca solo; esto es lo que lo
   * enciende, porque abrir una botella sí es tomártela.
   */
  const openBottle = useCallback(async (id) => {
    const updated = await openBottleApi(id);
    setWines((prev) => prev.map((wine) => (wine._id === id ? updated : wine)));
    return updated;
  }, []);

  /** Deshacer una botella abierta: vuelve a su lote y el historial queda como estaba. */
  const undoOpenBottle = useCallback(async (id, wasTasted) => {
    const updated = await undoOpenBottleApi(id, wasTasted);
    setWines((prev) => prev.map((wine) => (wine._id === id ? updated : wine)));
    return updated;
  }, []);

  return {
    wines,
    loading,
    error,
    stats,
    addWine,
    deleteWine,
    updateWine,
    updateWineRating,
    updateWineTasted,
    toggleFavorite,
    adjustStock,
    openBottle,
    undoOpenBottle,
    recargar: loadWines,
  };
};
