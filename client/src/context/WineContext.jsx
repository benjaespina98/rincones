import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import {
  getProfile,
  getUserStats,
} from "../services/authApi";

export const WineContext = createContext(null);

export const WineProvider = ({ children }) => {
  const [wines, setWines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Cargar vinos desde el API
  const cargarVinos = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      
      // Aquí irá la llamada a GET /api/wines cuando esté lista
      // Por ahora, vamos a simular datos
      setWines([]);
    } catch (requestError) {
      setError("No se pudieron cargar los vinos");
      console.error(requestError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarVinos();
  }, [cargarVinos]);

  // Agregar nuevo vino
  const agregarVino = useCallback((nuevoVino) => {
    setWines((prev) => [nuevoVino, ...prev]);
  }, []);

  // Actualizar vino existente
  const actualizarVino = useCallback((id, cambios) => {
    setWines((prev) =>
      prev.map((vino) =>
        vino._id === id ? { ...vino, ...cambios } : vino
      )
    );
  }, []);

  // Eliminar vino
  const eliminarVino = useCallback((id) => {
    setWines((prev) => prev.filter((vino) => vino._id !== id));
  }, []);

  const value = useMemo(
    () => ({
      wines,
      loading,
      error,
      cargarVinos,
      agregarVino,
      actualizarVino,
      eliminarVino,
    }),
    [wines, loading, error, cargarVinos, agregarVino, actualizarVino, eliminarVino]
  );

  return <WineContext.Provider value={value}>{children}</WineContext.Provider>;
};
