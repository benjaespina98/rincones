import { useState, useCallback } from "react";
import { getSuggestedWines } from "../services/wineApi";

export function useRecommendations() {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [context, setContext] = useState({ food: null, mood: null });

  const fetchSuggestions = useCallback(async (newContext) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSuggestedWines(newContext);
      setSuggestions(data);
      setContext(newContext);
    } catch {
      setError("No se pudieron cargar las sugerencias");
    } finally {
      setLoading(false);
    }
  }, []);

  const clearContext = useCallback(() => {
    setSuggestions([]);
    setContext({ food: null, mood: null });
    setError(null);
  }, []);

  return { suggestions, loading, error, context, fetchSuggestions, clearContext };
}
