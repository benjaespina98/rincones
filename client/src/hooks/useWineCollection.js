import { useState, useEffect, useCallback, useRef } from "react";
import {
  getWines,
  createWine as createWineApi,
  updateWine as updateWineApi,
  deleteWine as deleteWineApi,
  adjustWineStock,
  openBottle as openBottleApi,
  undoOpenBottle as undoOpenBottleApi,
  bulkWines,
} from "../services/wineApi";

/**
 * Acá había un `stats` que pedía `/wines/stats/summary` en cada carga de Mi
 * Bodega y en cada acción en lote, y que NO LEÍA NADIE: el único consumidor del
 * hook (BodyPage) nunca lo desestructuraba, y las estadísticas que sí se
 * muestran salen de `useWineStats`, que es otro endpoint.
 *
 * No era sólo una variable de más. Ese endpoint bajaba la colección COMPLETA del
 * usuario —documentos enteros, con descripciones, momentos y lotes— para contar
 * cinco números que después se tiraban. Era la consulta más cara de la app, en
 * la pantalla más usada, al pedo.
 */
export const useWineCollection = () => {
  const [wines, setWines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /**
   * Qué carga fue la última. Sin esto, dos cargas encimadas —tocar "Reintentar"
   * mientras la primera todavía viaja— pueden resolverse al revés y dejar en
   * pantalla la respuesta VIEJA, o un error de una petición que ya no importa.
   */
  const cargaActual = useRef(0);

  /**
   * Carga la bodega y los contadores.
   *
   * Eran DOS viajes a la red en serie —la lista y unos contadores que nadie
   * leía— así que Mi Bodega esperaba el doble de lo necesario para pintar.
   * Ahora es uno solo.
   */
  const loadWines = useCallback(async () => {
    const carga = (cargaActual.current += 1);

    setLoading(true);
    setError("");

    try {
      const data = await getWines();
      if (cargaActual.current !== carga) return;
      setWines(data);
    } catch (err) {
      if (cargaActual.current !== carga) return;
      console.error(err);
      setError("No se pudo cargar tu bodega.");
    } finally {
      if (cargaActual.current === carga) setLoading(false);
    }
  }, []);

  // Cargar vinos al montar
  useEffect(() => {
    loadWines();
  }, [loadWines]);

  /**
   * Agrega un vino a la colección… o actualiza el que ya estaba.
   *
   * El server distingue los dos casos y lo dice en `merged`: cargar un vino que
   * ya tenías es una REPOSICIÓN —le suma botellas a la fila existente— y no un
   * vino nuevo. Acá se ignoraba ese dato y se hacía `[nuevo, ...prev]` siempre,
   * así que una reposición metía en la lista un segundo objeto con el MISMO
   * `_id`: el vino aparecía dos veces y React se quedaba con dos hijos de la
   * misma key.
   *
   * No se notaba de milagro —quien lo llamaba desde el escaneo tenía su propia
   * copia del estado, que se descartaba al navegar— pero era una fila duplicada
   * esperando a que alguien compartiera esta lista.
   */
  const addWine = useCallback(async (wineData) => {
    const { wine } = await createWineApi(wineData);
    setWines((prev) => {
      // Se busca por `_id` y no se confía en `merged` a secas: el server puede
      // haber reconocido un vino que esta lista no tiene cargado (se filtró, o
      // se agregó desde otra pantalla). Reemplazar lo que está y agregar lo que
      // no cubre los dos casos sin poder duplicar en ninguno.
      const estaba = prev.some((w) => w._id === wine._id);
      if (estaba) return prev.map((w) => (w._id === wine._id ? wine : w));
      return [wine, ...prev];
    });
    return wine;
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
   * Abrir botellas: descuenta las que digas y deja el vino como probado, de una.
   * "Probado" es un hecho de tu historial y no se toca solo; esto es lo que lo
   * enciende, porque abrir una botella sí es tomártela.
   *
   * Abrir tres de una cuenta como UN consumo, no como tres: es una noche en la
   * que tomaste ese vino, y el contador del perfil cuenta ocasiones.
   */
  const openBottle = useCallback(async (id, cantidad = 1) => {
    const updated = await openBottleApi(id, cantidad);
    setWines((prev) => prev.map((wine) => (wine._id === id ? updated : wine)));
    return updated;
  }, []);

  /** Deshacer botellas abiertas: vuelven a su lote y el historial queda como estaba. */
  const undoOpenBottle = useCallback(async (id, wasTasted, cantidad = 1) => {
    const updated = await undoOpenBottleApi(id, wasTasted, cantidad);
    setWines((prev) => prev.map((wine) => (wine._id === id ? updated : wine)));
    return updated;
  }, []);

  /**
   * Una acción sobre varios vinos. El estado local se actualiza de una sola vez
   * y sin volver a pedir la lista: con doscientos vinos, recargar todo para
   * reflejar un cambio que ya sabemos cuál es hace parpadear la pantalla entera.
   */
  const bulkAction = useCallback(async (ids, action) => {
    const afectados = await bulkWines(ids, action);
    const seleccion = new Set(ids.map(String));

    setWines((prev) => {
      if (action === "delete") return prev.filter((w) => !seleccion.has(String(w._id)));
      const cambio = {
        tasted: { tasted: true },
        untasted: { tasted: false },
        favorite: { favorite: true },
        unfavorite: { favorite: false },
      }[action];
      if (!cambio) return prev;
      return prev.map((w) => (seleccion.has(String(w._id)) ? { ...w, ...cambio } : w));
    });

    return afectados;
  }, []);

  return {
    wines,
    loading,
    error,
    addWine,
    deleteWine,
    updateWine,
    updateWineRating,
    updateWineTasted,
    toggleFavorite,
    adjustStock,
    openBottle,
    undoOpenBottle,
    bulkAction,
    recargar: loadWines,
  };
};
