import { useState, useEffect, useCallback } from "react";
import {
  getWines,
  createWine as createWineApi,
  updateWine as updateWineApi,
  deleteWine as deleteWineApi,
  adjustWineStock,
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
      setError("Error al cargar los vinos");
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
    recargar: loadWines,
  };
};
