import { useState, useEffect, useCallback } from "react";
import {
  getWines,
  createWine as createWineApi,
  updateWine as updateWineApi,
  deleteWine as deleteWineApi,
  getWineStats,
} from "../services/winesApi";

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

  const addWine = useCallback(
    async (wineData) => {
      try {
        const newWine = await createWineApi(wineData);
        setWines((prev) => [newWine, ...prev]);
        return newWine;
      } catch (err) {
        setError("Error al agregar el vino");
        throw err;
      }
    },
    []
  );

  const deleteWine = useCallback(
    async (id) => {
      try {
        await deleteWineApi(id);
        setWines((prev) => prev.filter((wine) => wine._id !== id));
      } catch (err) {
        setError("Error al eliminar el vino");
        throw err;
      }
    },
    []
  );

  const updateWineRating = useCallback(
    async (id, rating) => {
      try {
        const updated = await updateWineApi(id, { rating });
        setWines((prev) =>
          prev.map((wine) =>
            wine._id === id ? { ...wine, rating } : wine
          )
        );
        return updated;
      } catch (err) {
        setError("Error al actualizar el vino");
        throw err;
      }
    },
    []
  );

  const updateWineTasted = useCallback(
    async (id, tasted) => {
      try {
        const updated = await updateWineApi(id, { tasted });
        setWines((prev) =>
          prev.map((wine) =>
            wine._id === id ? { ...wine, tasted } : wine
          )
        );
        return updated;
      } catch (err) {
        setError("Error al actualizar el vino");
        throw err;
      }
    },
    []
  );

  return {
    wines,
    loading,
    error,
    stats,
    addWine,
    deleteWine,
    updateWineRating,
    updateWineTasted,
    recargar: loadWines,
  };
};
