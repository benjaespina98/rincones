import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { getLugares } from "../services/lugaresApi";

export const LugaresContext = createContext(null);

export const LugaresProvider = ({ children }) => {
  const [lugares, setLugares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const cargarLugares = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getLugares();
      setLugares(data);
    } catch (requestError) {
      setError("No se pudieron cargar los lugares");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarLugares();
  }, [cargarLugares]);

  const value = useMemo(
    () => ({
      lugares,
      loading,
      error,
      recargar: cargarLugares,
    }),
    [lugares, loading, error, cargarLugares]
  );

  return <LugaresContext.Provider value={value}>{children}</LugaresContext.Provider>;
};
