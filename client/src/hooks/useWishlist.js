import { useState, useEffect, useCallback } from "react";
import { getWishes, createWish, updateWish, deleteWish, convertWishToWine } from "../services/wishApi";

export function useWishlist(onWineAdded) {
  const [wishes, setWishes] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadWishes = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getWishes();
      setWishes(data);
    } catch {
      setWishes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadWishes(); }, [loadWishes]);

  const addWish = useCallback(async (payload) => {
    const wish = await createWish(payload);
    setWishes((prev) => [wish, ...prev]);
    return wish;
  }, []);

  const removeWish = useCallback(async (id) => {
    await deleteWish(id);
    setWishes((prev) => prev.filter((w) => w._id !== id));
  }, []);

  const toggleWishFavorite = useCallback(async (id, favorite) => {
    const updated = await updateWish(id, { favorite });
    setWishes((prev) => prev.map((w) => (w._id === id ? updated : w)));
    return updated;
  }, []);

  const convertToWine = useCallback(async (id, purchaseData) => {
    const wine = await convertWishToWine(id, purchaseData);
    setWishes((prev) => prev.filter((w) => w._id !== id));
    onWineAdded?.(wine);
    return wine;
  }, [onWineAdded]);

  return { wishes, loading, addWish, removeWish, toggleWishFavorite, convertToWine, reload: loadWishes };
}
