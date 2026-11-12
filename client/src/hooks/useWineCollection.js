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
/**
 * ── LA BODEGA QUE YA SE BAJÓ NO SE VUELVE A ESPERAR ─────────────────────────
 * Este hook pedía la colección entera en CADA montaje. Y Mi Bodega se monta
 * cada vez que se entra a la pestaña: mirabas un vino, volvías con el botón de
 * atrás, y la lista que acababas de ver se borraba para mostrar un esqueleto
 * mientras la red traía exactamente lo mismo. La espera no era de datos —ya los
 * teníamos hace diez segundos—, era de ida y vuelta.
 *
 * El caché vive en el módulo y no en un estado de React a propósito: tiene que
 * sobrevivir al desmontaje del componente, que es justamente el momento que
 * queremos que deje de costar. Se sigue revalidando SIEMPRE al montar —lo
 * guardado se muestra, no se cree— así que un cambio hecho en otra pestaña
 * aparece igual; lo que cambia es que la lista vieja se queda en pantalla
 * mientras tanto en lugar de dejar el hueco.
 *
 * `null` significa "nunca se cargó" y es distinto de `[]`, que es una bodega
 * vacía de verdad: sin esa distinción, quien todavía no cargó ningún vino vería
 * el mensaje de bodega vacía antes de que llegara la respuesta.
 */
let cacheDeBodega = null;

/**
 * Tira el caché. La llama el cierre de sesión: los vinos son de una persona, y
 * si el siguiente que entra en este mismo navegador viera la lista del anterior
 * —aunque fuera medio segundo, hasta que la revalidación la reemplace— sería una
 * filtración de datos privados, no un problema de rendimiento.
 */
export const limpiarCacheDeBodega = () => {
  cacheDeBodega = null;
};

/**
 * Quiénes están mirando la bodega ahora. El caché es del módulo, pero cada
 * montaje del hook tiene su propia copia en estado: sin avisarles, una escritura
 * hecha por OTRO lado —el «Deshacer» de un aviso que sobrevive a la pantalla que
 * lo creó, otra instancia montada— cambiaba el caché y dejaba la lista montada
 * mostrando el valor de antes hasta la próxima revalidación.
 */
const oyentes = new Set();

/**
 * Aplica un cambio sobre el caché y avisa a las listas montadas. Funciona aunque
 * la pantalla que lo disparó ya se haya desmontado (el aviso con «Deshacer» dura
 * ocho segundos y puede sobrevivirla): un setState sobre un componente desmontado
 * no hace nada, y el caché se quedaba con el valor viejo.
 */
const aplicarACache = (actualizar) => {
  if (cacheDeBodega === null) return false;
  cacheDeBodega = actualizar(cacheDeBodega);
  oyentes.forEach((avisar) => avisar(cacheDeBodega));
  return true;
};

/** Reemplaza un vino ya cargado por su versión nueva, en el caché y en las listas montadas. */
export const reemplazarVinoEnBodega = (wine) =>
  aplicarACache((prev) => prev.map((w) => (w._id === wine?._id ? wine : w)));

export const useWineCollection = () => {
  const [wines, setWines] = useState(() => cacheDeBodega || []);
  // Sólo se anuncia carga si no hay nada que mostrar. Con caché, lo que sigue
  // es una revalidación y tiene que ser invisible.
  const [loading, setLoading] = useState(cacheDeBodega === null);
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
    // Con algo ya en pantalla esto es una revalidación: ni esqueleto ni error.
    // Si la red falla pero tenemos una lista buena, no hay nada que avisar —
    // reemplazarla por un cartel rojo sería perder datos válidos por un
    // problema pasajero.
    const revalidando = cacheDeBodega !== null;

    if (!revalidando) setLoading(true);
    setError("");

    try {
      const data = await getWines();
      if (cargaActual.current !== carga) return;
      cacheDeBodega = data;
      setWines(data);
    } catch (err) {
      if (cargaActual.current !== carga) return;
      console.error(err);
      if (!revalidando) setError("No se pudo cargar tu bodega.");
    } finally {
      if (cargaActual.current === carga && !revalidando) setLoading(false);
    }
  }, []);

  // Cargar vinos al montar. Con caché esto es una revalidación silenciosa: la
  // lista de la vez pasada ya está en pantalla desde el primer frame.
  useEffect(() => {
    loadWines();
  }, [loadWines]);

  // Escucha los cambios que se aplican sobre el caché, vengan de donde vengan.
  useEffect(() => {
    oyentes.add(setWines);
    return () => oyentes.delete(setWines);
  }, []);

  /**
   * Toda escritura pasa por acá.
   *
   * El caché y lo que se ve tienen que moverse juntos: si una acción actualizara
   * sólo el estado, al volver a entrar a Mi Bodega reaparecería la versión vieja
   * —el vino que borraste, el stock que ya ajustaste— hasta que terminara la
   * revalidación. Un caché que miente por medio segundo es peor que no tenerlo.
   */
  const aplicar = useCallback((actualizar) => {
    // Con caché, el cambio pasa por el módulo y llega a todas las listas montadas
    // (incluida ésta). Sin caché —todavía no cargó nada— queda el camino local.
    if (aplicarACache(actualizar)) return;
    setWines((prev) => {
      const siguiente = actualizar(prev);
      cacheDeBodega = siguiente;
      return siguiente;
    });
  }, []);

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
    aplicar((prev) => {
      // Se busca por `_id` y no se confía en `merged` a secas: el server puede
      // haber reconocido un vino que esta lista no tiene cargado (se filtró, o
      // se agregó desde otra pantalla). Reemplazar lo que está y agregar lo que
      // no cubre los dos casos sin poder duplicar en ninguno.
      const estaba = prev.some((w) => w._id === wine._id);
      if (estaba) return prev.map((w) => (w._id === wine._id ? wine : w));
      return [wine, ...prev];
    });
    return wine;
  }, [aplicar]);

  const deleteWine = useCallback(async (id) => {
    await deleteWineApi(id);
    aplicar((prev) => prev.filter((wine) => wine._id !== id));
  }, [aplicar]);

  const updateWine = useCallback(async (id, payload) => {
    const updated = await updateWineApi(id, payload);
    aplicar((prev) => prev.map((wine) => (wine._id === id ? updated : wine)));
    return updated;
  }, [aplicar]);

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

  const adjustStock = useCallback(async (id, delta, extra) => {
    const updated = await adjustWineStock(id, delta, extra);
    aplicar((prev) => prev.map((wine) => (wine._id === id ? updated : wine)));
    return updated;
  }, [aplicar]);

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
    aplicar((prev) => prev.map((wine) => (wine._id === id ? updated : wine)));
    return updated;
  }, [aplicar]);

  /** Deshacer botellas abiertas: vuelven a su lote y el historial queda como estaba. */
  const undoOpenBottle = useCallback(async (id, wasTasted, cantidad = 1, consumosAntes) => {
    const updated = await undoOpenBottleApi(id, wasTasted, cantidad, consumosAntes);
    aplicar((prev) => prev.map((wine) => (wine._id === id ? updated : wine)));
    return updated;
  }, [aplicar]);

  /**
   * Una acción sobre varios vinos. El estado local se actualiza de una sola vez
   * y sin volver a pedir la lista: con doscientos vinos, recargar todo para
   * reflejar un cambio que ya sabemos cuál es hace parpadear la pantalla entera.
   */
  const bulkAction = useCallback(async (ids, action) => {
    const afectados = await bulkWines(ids, action);
    const seleccion = new Set(ids.map(String));

    aplicar((prev) => {
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
  }, [aplicar]);

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
