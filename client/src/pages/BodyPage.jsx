import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ConfirmModal from "../components/ConfirmModal";
import Icon from "../components/Icon";
import WinePhoto from "../components/WinePhoto";
import Dropdown from "../components/Dropdown";
import LoadingSkeleton from "../components/LoadingSkeleton";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import { useToast } from "../context/ToastContext";
import { useWineCollection } from "../hooks/useWineCollection";
import { normalizeSearchText } from "../utils/text";
import { tiempoEnCava, enCavaDesde, stockLabel } from "../utils/cellarTime";
import { WINE_TYPE_LABELS } from "../data/wineReference";
import { getCellarStatus } from "../utils/cellarStatus";
import { wineDisplayName } from "../utils/wineIdentity";
import { trackEvent } from "../services/analyticsApi";
import "../styles/pages/BodyPage.css";

const FILTER_VALUES = new Set([
  "all",
  "instock",
  "historial",
  "favorites",
  "tasted",
  "nottasted",
  "cellarready",
  "red",
  "white",
  "rosé",
  "sparkling",
  "fortified",
]);

export default function BodyPage({ initialFilter = "instock" }) {
  const navigate = useNavigate();
  const { addToast, removeToast, showSuccess, showError } = useToast();
  const {
    wines,
    loading,
    error,
    addWine,
    deleteWine,
    toggleFavorite,
    updateWineTasted,
    adjustStock,
    openBottle,
    undoOpenBottle,
    recargar,
  } = useWineCollection();

  // El filtro inicial puede venir por prop o por query (?filter=favorites),
  // que es a donde redirige la ruta vieja /favoritos.
  const initialFromQuery =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("filter")
      : null;
  const startFilter = FILTER_VALUES.has(initialFromQuery)
    ? initialFromQuery
    : FILTER_VALUES.has(initialFilter)
      ? initialFilter
      : "instock";
  const [filterType, setFilterType] = useState(startFilter);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [varietalFilter, setVarietalFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [pendingActionId, setPendingActionId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // Con pocos vinos la lista se lee bien; a partir de ~8 la grilla gana.
  const [viewMode, setViewMode] = useState("list");
  // "auto" agrupa sola cuando la lista se vuelve larga; el resto son ejes fijos.
  const [groupBy, setGroupBy] = useState("auto");
  const [collapsed, setCollapsed] = useState(() => new Set());
  /**
   * Vinos que acabás de tocar y se quedan a la vista aunque el filtro ya no los
   * incluya.
   *
   * Con "En stock" puesto, bajar a cero la última botella hacía desaparecer la
   * fila justo mientras la estabas usando: el "+" se iba de la pantalla en el
   * mismo gesto, y la lectura era "a veces me deja mover el stock y a veces no".
   * Lo que corresponde ahí no es esconder el vino, es mostrarlo terminado —con
   * su "+" a mano por si te equivocaste— hasta que cambies de filtro.
   */
  const [recienTocados, setRecienTocados] = useState(() => new Set());
  const undoTimerRef = useRef(null);
  const pendingDeleteToastRef = useRef("");

  useEffect(() => {
    if (FILTER_VALUES.has(initialFilter)) {
      setFilterType(initialFilter);
    }
  }, [initialFilter]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  // El error de carga se muestra en la pantalla (con reintento), no en un toast
  // que se va solo: si no, un fallo de red se confunde con "tu bodega está vacía".

  const varietalOptions = useMemo(
    () => [...new Set(wines.map((wine) => wine.varietal).filter(Boolean))].sort(),
    [wines]
  );
  const regionOptions = useMemo(
    () => [...new Set(wines.map((wine) => wine.region).filter(Boolean))].sort(),
    [wines]
  );

  /**
   * Los términos de búsqueda, normalizados UNA vez por tecla y no una vez por
   * vino. Estaban adentro del filtro, así que con 300 vinos se normalizaba y
   * partía el mismo string 300 veces en cada pulsación.
   */
  const terms = useMemo(
    () => normalizeSearchText(searchTerm).split(/\s+/).filter(Boolean),
    [searchTerm]
  );

  /**
   * Búsqueda y facetas (varietal, región). Es la parte del filtrado que un vino
   * retenido SÍ tiene que seguir cumpliendo: si buscaste "malbec", nada que no
   * sea Malbec puede quedarse en pantalla por haberlo tocado.
   */
  const pasaBusqueda = useCallback(
    (wine) => {
      // Cada palabra tiene que aparecer en ALGÚN campo, no la frase entera en
      // uno solo: así "rutini 2019" y "malbec uco" encuentran lo que
      // corresponde, cosa que antes fallaba porque se buscaba el texto
      // completo dentro de un único campo.
      const haystack = [
        wine.name,
        wine.region,
        wine.winery,
        wine.varietal,
        wine.notes,
        // Faltaban los dos: buscar "2019" o "tinto" en tu propia bodega no
        // devolvía nada, aunque son de las primeras cosas que uno escribe.
        wine.vintage,
        WINE_TYPE_LABELS[wine.type],
      ]
        .map(normalizeSearchText)
        .join(" ");

      if (!terms.every((term) => haystack.includes(term))) return false;
      if (varietalFilter !== "all" && wine.varietal !== varietalFilter) return false;
      if (regionFilter !== "all" && wine.region !== regionFilter) return false;
      return true;
    },
    [terms, varietalFilter, regionFilter]
  );

  /** El chip elegido. Es el único que un vino recién tocado puede saltearse. */
  const pasaChip = useCallback(
    (wine) => {
      if (filterType === "all") return true;
      if (filterType === "tasted") return wine.tasted;
      if (filterType === "nottasted") return !wine.tasted;
      if (filterType === "favorites") return wine.favorite;
      if (filterType === "instock") return Number(wine.quantity) > 0;
      // Historial: lo que ya no tenés en casa. Sigue siendo parte de tu
      // colección —dice por dónde pasaste— pero no responde "¿qué abro hoy?".
      if (filterType === "historial") return Number(wine.quantity) <= 0;
      if (filterType === "cellarready")
        return Number(wine.quantity) > 0 && getCellarStatus(wine).status === "peak";
      return wine.type === filterType;
    },
    [filterType]
  );

  const filteredWines = useMemo(
    () => wines.filter((wine) => pasaBusqueda(wine) && (pasaChip(wine) || recienTocados.has(wine._id))),
    [wines, pasaBusqueda, pasaChip, recienTocados]
  );

  /**
   * Los que están en pantalla SÓLO porque los acabás de tocar.
   *
   * Se separan porque no son parte de lo que pediste ver, y confundirlos con el
   * resultado hacía que el resumen mintiera: con "En stock" puesto y un vino
   * recién vaciado, decía "2 etiquetas en stock" cuando una ya no tenía nada.
   */
  const retenidos = useMemo(
    () => new Set(filteredWines.filter((w) => !pasaChip(w)).map((w) => w._id)),
    [filteredWines, pasaChip]
  );

  // Cambiar de filtro es empezar de nuevo: ahí sí los vinos retenidos se van.
  useEffect(() => {
    setRecienTocados(new Set());
  }, [filterType, searchTerm, varietalFilter, regionFilter]);

  /**
   * Agrupación: el eje con el que se corta la lista.
   *
   * Antes salía del orden elegido, que mezclaba dos decisiones distintas: no se
   * podía ver "por bodega, ordenado por puntaje". Ahora es un control propio.
   *
   * Con pocos vinos agrupar sólo agrega ruido, así que el modo automático no
   * agrupa hasta que la lista deja de recorrerse de un vistazo.
   */
  const AUTO_GROUP_FROM = 25;

  const effectiveGroupBy = useMemo(() => {
    if (groupBy !== "auto") return groupBy;
    return filteredWines.length >= AUTO_GROUP_FROM ? "type" : "none";
  }, [groupBy, filteredWines.length]);

  const groupOf = useCallback(
    (wine) => {
      switch (effectiveGroupBy) {
        case "type":
          return WINE_TYPE_LABELS[wine.type] || WINE_TYPE_LABELS.unknown;
        case "winery":
          return wine.winery || "Sin bodega";
        case "region":
          return wine.region || "Sin región";
        case "varietal":
          return wine.varietal || "Sin varietal";
        case "letter":
          return (wineDisplayName(wine)?.[0] || "#").toUpperCase();
        default:
          return null;
      }
    },
    [effectiveGroupBy]
  );

  const sortedWines = useMemo(() => {
    const porOrden = (a, b) => {
      if (sortBy === "rating") return (b.rating || 0) - (a.rating || 0);
      if (sortBy === "year") return (b.vintage || 0) - (a.vintage || 0);
      if (sortBy === "name") return wineDisplayName(a).localeCompare(wineDisplayName(b), "es");
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    };

    /**
     * El stock manda antes que el orden elegido.
     *
     * Mi Bodega responde "¿qué tengo para tomar?". En las vistas que mezclan
     * —"Todos", un tipo de uva, favoritos— lo que ya se te terminó quedaba
     * intercalado entre lo que sí tenés, así que con 300 vinos había que ir
     * salteando botellas vacías para encontrar una llena. Lo vacío no desaparece
     * (es tu historial y dice por dónde pasaste), pero deja de ser protagonista:
     * baja al final, siempre.
     *
     * En "En stock" y en "Historial" no cambia nada, porque ahí todos están del
     * mismo lado. Y los recién tocados también caen al final, que es justo donde
     * corresponde que quede un vino que acabás de vaciar.
     */
    const conStockPrimero = (a, b) => {
      const sa = Number(a.quantity) > 0 ? 0 : 1;
      const sb = Number(b.quantity) > 0 ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return porOrden(a, b);
    };

    // Con agrupación activa hay que ordenar PRIMERO por grupo: si no, los vinos
    // de cada grupo quedan intercalados y el corte salta en cada cambio —con 92
    // vinos aparecían 35 encabezados repitiendo "Tinto / Blanco / Tinto".
    // El orden elegido sigue mandando, pero adentro de cada sección.
    if (effectiveGroupBy === "none") return [...filteredWines].sort(conStockPrimero);

    return [...filteredWines].sort((a, b) => {
      const ga = groupOf(a) || "";
      const gb = groupOf(b) || "";
      if (ga !== gb) return ga.localeCompare(gb, "es");
      return conStockPrimero(a, b);
    });
  }, [filteredWines, sortBy, effectiveGroupBy, groupOf]);

  // Rincones es una colección personal, no un inventario comercial: las
  // estadísticas describen lo que tenés, no disparan alertas de reposición.
  const stats = {
    total: wines.length,
    bottles: wines.reduce((n, w) => n + (Number(w.quantity) || 0), 0),
    // "En stock" cuenta BOTELLAS, no etiquetas. Contando etiquetas, dos botellas
    // del mismo vino daban "1 en stock" y no hay forma de leer ese 1 como algo
    // más que "me queda una". El resto de los chips sí cuentan etiquetas, porque
    // "probado" o "favorito" son cosas del vino, no de cada botella.
    inStockLabels: wines.filter((w) => Number(w.quantity) > 0).length,
    favorites: wines.filter((wine) => wine.favorite).length,
    tasted: wines.filter((wine) => wine.tasted).length,
  };
  stats.inStock = stats.bottles;
  stats.pending = stats.total - stats.tasted;
  stats.historial = stats.total - stats.inStockLabels;

  // Cuántos vinos tiene cada grupo, para poder mostrarlo en el encabezado
  // incluso cuando la sección está plegada. Se cuenta sobre el total del filtro,
  // no sobre lo que está dibujado: el encabezado tiene que decir cuántos hay en
  // la sección, no cuántos entraron en la primera tanda.
  const groupCounts = useMemo(() => {
    const acc = {};
    for (const w of sortedWines) {
      const g = groupOf(w);
      if (g) acc[g] = (acc[g] || 0) + 1;
    }
    return acc;
  }, [sortedWines, groupOf]);

  /**
   * Cuántas filas se dibujan de una.
   *
   * Con 300 vinos la lista montaba 300 filas —cada una con su foto, sus chips y
   * sus botones—, y eso se siente: el scroll se traba y entrar a la pantalla
   * tarda. Nadie recorre 300 filas a mano; para llegar a un vino puntual están la
   * búsqueda y los filtros, que son más rápidos que cualquier scroll.
   *
   * No es scroll infinito: es un corte explícito con un botón que dice cuántos
   * faltan. La diferencia importa —con scroll infinito nunca sabés cuánto queda,
   * y el pie de la lista se vuelve inalcanzable.
   */
  const TANDA = 30;
  const [visibles, setVisibles] = useState(TANDA);

  // Cualquier cambio de recorte vuelve a empezar por arriba: si no, al filtrar
  // sobre una lista ya expandida se arrastraría un "ver más" que no corresponde.
  useEffect(() => {
    setVisibles(TANDA);
  }, [filterType, searchTerm, varietalFilter, regionFilter, sortBy, effectiveGroupBy]);

  const visibleWines = useMemo(() => sortedWines.slice(0, visibles), [sortedWines, visibles]);
  const restantes = sortedWines.length - visibleWines.length;

  const toggleGroup = (name) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  // Cambiar de eje de agrupación con secciones cerradas dejaría plegado algo
  // que el usuario nunca cerró.
  useEffect(() => setCollapsed(new Set()), [effectiveGroupBy]);

  /**
   * Qué colección estás mirando ahora mismo: "18 en stock", "8 Malbec en
   * stock", "6 de Catena Zapata". Se arma con los filtros realmente aplicados.
   */
  const contextLabel = useMemo(() => {
    // Los vinos retenidos NO cuentan: están en pantalla porque los acabás de
    // tocar, no porque coincidan con lo que pediste. Contarlos hacía que el
    // resumen dijera "2 etiquetas en stock" con una de las dos ya vacía.
    const coinciden = sortedWines.filter((w) => !retenidos.has(w._id));
    const n = coinciden.length;
    const unidad = n === 1 ? "vino" : "vinos";
    if (searchTerm.trim()) {
      return `${n} ${n === 1 ? "resultado" : "resultados"}`;
    }

    // Botellas y etiquetas se dicen las dos cuando no coinciden. "1 en stock"
    // con dos botellas del mismo vino en pantalla es directamente falso para
    // quien lo lee, y quedarse con uno solo de los dos números siempre engaña a
    // alguien: dos botellas de un mismo vino son "1 etiqueta en stock · 2
    // botellas". Cuando coinciden no hace falta aclarar nada.
    const botellas = coinciden.reduce((acc, w) => acc + (Number(w.quantity) || 0), 0);
    const desdobla = botellas > 0 && botellas !== n;
    const sufijo = desdobla ? ` · ${botellas} ${botellas === 1 ? "botella" : "botellas"}` : "";

    const partes = [];
    if (varietalFilter !== "all") partes.push(varietalFilter);
    if (regionFilter !== "all") partes.push(`de ${regionFilter}`);
    const nombreFiltro = {
      instock: "en stock",
      historial: "en tu historial",
      favorites: "favoritos",
      nottasted: "por probar",
      tasted: "probados",
      cellarready: "listos para abrir",
    }[filterType];
    if (nombreFiltro) partes.push(nombreFiltro);
    else if (filterType !== "all") partes.push(WINE_TYPE_LABELS[filterType]?.toLowerCase());

    const cola = partes.filter(Boolean).join(" ");
    // Con el desdoble, el número de adelante lleva su unidad para no quedar
    // suelto al lado del de botellas: "1 etiqueta en stock · 2 botellas".
    const cabeza = desdobla ? `${n} ${n === 1 ? "etiqueta" : "etiquetas"}` : `${n}`;
    return cola ? `${cabeza} ${cola}${sufijo}` : `${desdobla ? cabeza : `${n} ${unidad}`}${sufijo}`;
  }, [sortedWines, retenidos, searchTerm, filterType, varietalFilter, regionFilter]);

  // Marca el botón "Filtros" cuando hay algo aplicado ahí adentro, para que no
  // quede un filtro activo invisible con el panel cerrado.
  // El orden ya no cuenta acá: pasó a estar siempre visible en la fila de
  // resumen, así que no puede quedar "escondido" dentro del panel.
  const hasAdvanced = varietalFilter !== "all" || regionFilter !== "all";

  const clearAllFilters = () => {
    setFilterType("all");
    setVarietalFilter("all");
    setRegionFilter("all");
  };

  const withPendingAction = async (id, action) => {
    setPendingActionId(id);
    try {
      await action();
    } catch {
      showError("No se pudo completar la acción. Probá de nuevo.");
    } finally {
      setPendingActionId(null);
    }
  };

  /** Igual, pero además retiene el vino en pantalla aunque el filtro lo saque. */
  const withStockAction = (id, action) => {
    setRecienTocados((prev) => new Set(prev).add(id));
    return withPendingAction(id, action);
  };

  const handleToggleFavorite = (wine) =>
    withPendingAction(wine._id, async () => {
      await toggleFavorite(wine._id, !wine.favorite);
      showSuccess(wine.favorite ? "Eliminado de favoritos" : "Agregado a favoritos");
    });

  // Toggle puro: dice si ya lo tomaste alguna vez y no toca el stock. Sirve para
  // un vino que probaste en otro lado, o para corregir el historial.
  const handleToggleTasted = (wine) =>
    withPendingAction(wine._id, async () => {
      await updateWineTasted(wine._id, !wine.tasted);
      showSuccess(wine.tasted ? "Marcado como no probado" : "Vino marcado como probado");
    });

  /**
   * Abrir una botella: descuenta una y deja el vino como probado.
   *
   * Es la acción de la fila porque es lo que uno hace de verdad con un vino que
   * tiene en casa. "Probado" quedó como lo que siempre fue —un dato de tu
   * historial— y por eso convive sin ruido con el stock: podés haberlo tomado y
   * que igual te queden dos botellas.
   *
   * Siempre con deshacer: cuesta una botella de tu cava y se dispara con un
   * toque, así que tocarlo por error no puede ser definitivo. El aviso dice
   * cuántas quedan (para no tener que ir a contarlas) y trae la salida al lado.
   */
  const handleOpenBottle = (wine) => {
    if (Number(wine.quantity) <= 0) return;
    const eraProbado = wine.tasted === true;
    const quedan = Math.max(0, Number(wine.quantity) - 1);

    withStockAction(wine._id, async () => {
      await openBottle(wine._id);
      // Abrir una botella es el uso real de la bodega: es lo que distingue una
      // colección que se vive de una lista que se cargó una vez y quedó ahí.
      trackEvent("bottle_opened", { emptied: quedan === 0 });
      const mensaje =
        quedan === 0
          ? `Se terminó tu ${wineDisplayName(wine)}`
          : `Botella abierta · te ${quedan === 1 ? "queda 1" : `quedan ${quedan}`}`;

      const toastId = addToast(mensaje, "success", 8000, {
        label: "Deshacer",
        onClick: async () => {
          removeToast(toastId);
          try {
            await undoOpenBottle(wine._id, eraProbado);
            showSuccess("Botella devuelta a tu bodega");
          } catch {
            showError("No se pudo deshacer");
          }
        },
      });
    });
  };

  const handleAdjustQuantity = (wine, delta) => {
    if (delta < 0 && Number(wine.quantity) <= 0) return;
    withStockAction(wine._id, async () => {
      await adjustStock(wine._id, delta);
      if (delta > 0) showSuccess(`Stock actualizado: ${wineDisplayName(wine)}`);
    });
  };

  const restoreDeletedWine = async (wineToRestore, toastId) => {
    if (!wineToRestore) return;

    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }

    if (toastId) removeToast(toastId);

    try {
      await addWine({
        name: wineToRestore.name,
        winery: wineToRestore.winery,
        vintage: wineToRestore.vintage,
        region: wineToRestore.region,
        varietal: wineToRestore.varietal,
        notes: wineToRestore.notes,
        rating: wineToRestore.rating,
        tasted: wineToRestore.tasted,
        favorite: wineToRestore.favorite,
        quantity: wineToRestore.quantity,
        image: wineToRestore.image,
      });
      showSuccess(`"${wineDisplayName(wineToRestore)}" restaurado`);
    } catch {
      showError("No se pudo restaurar el vino");
    }
  };

  const handleDeleteWine = async (id) => {
    const wineToDelete = wines.find((wine) => wine._id === id);
    setShowDeleteConfirm(null);
    if (!wineToDelete) return;

    try {
      await deleteWine(id);
    } catch {
      showError("No se pudo eliminar el vino");
      return;
    }

    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    if (pendingDeleteToastRef.current) {
      removeToast(pendingDeleteToastRef.current);
      pendingDeleteToastRef.current = "";
    }

    const toastId = addToast(`"${wineDisplayName(wineToDelete)}" eliminado`, "warning", 8000, {
      label: "Deshacer",
      onClick: () => restoreDeletedWine(wineToDelete, toastId),
    });

    pendingDeleteToastRef.current = toastId;
    undoTimerRef.current = setTimeout(() => {
      undoTimerRef.current = null;
      pendingDeleteToastRef.current = "";
    }, 8000);
  };

  return (
    <div className="body-page">
      {(loading || wines.length > 0) && (
        <>
      {/* Botellas y vinos distintos son cosas distintas: 12 botellas pueden ser
          3 etiquetas. Es el dato que un coleccionista mira primero. */}
      {/* Cada número dice qué cuenta al pasarle el dedo o el lector de pantalla:
          "Botellas" y "Etiquetas" son la distinción que sostiene toda la
          pantalla y no puede quedar librada a que el usuario la deduzca. */}
      <div className="stats-strip" role="group" aria-label="Resumen de tu colección">
        {[
          {
            n: stats.bottles,
            label: "Botellas",
            detalle: `${stats.bottles} ${stats.bottles === 1 ? "botella" : "botellas"} en total, contando las repetidas`,
          },
          {
            n: stats.total,
            label: "Etiquetas",
            detalle: `${stats.total} ${stats.total === 1 ? "vino distinto" : "vinos distintos"}`,
          },
          {
            n: stats.pending,
            label: "Pendientes",
            detalle: `${stats.pending} ${stats.pending === 1 ? "vino que todavía no probaste" : "vinos que todavía no probaste"}`,
          },
          {
            n: stats.tasted,
            label: "Probados",
            detalle: `${stats.tasted} ${stats.tasted === 1 ? "vino que ya probaste" : "vinos que ya probaste"}`,
          },
        ].map((s) => (
          <div className="stat" key={s.label} title={s.detalle}>
            <span className="stat-number" aria-hidden="true">{s.n}</span>
            <span className="stat-label" aria-hidden="true">{s.label}</span>
            <span className="sr-only">{s.detalle}</span>
          </div>
        ))}
      </div>

      <div className="search-container">
        <span className="search-icon" aria-hidden="true"><Icon name="search" size={18} /></span>
        <input
          type="text"
          placeholder="Buscá por nombre, bodega, varietal o notas…"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          className="search-input"
          aria-label="Buscar vino"
        />

        {searchTerm && (
          <button
            className="search-clear"
            onClick={() => setSearchTerm("")}
            type="button"
            aria-label="Limpiar búsqueda"
          >
            <Icon name="x" size={16} />
          </button>
        )}
      </div>

      {/* Una sola barra de filtros. Antes convivían CUATRO combos y CUATRO chips
          que hacían lo mismo (el combo "Todos" y el chip "Favoritos" son el
          mismo filtro), apilados en tres filas antes de ver un solo vino. */}
      <div className="bodega-tools">
        <div className="bodega-tools__chips" role="group" aria-label="Filtros rápidos">
          {[
            /* El stock va primero porque es la pregunta con la que uno abre la
               app: "¿qué tengo para tomar hoy?". El historial va último y
               separado: cuenta por dónde pasaste, no qué podés abrir.

               Cada chip lleva su número dicho con todas las letras en `title` y
               en el rótulo accesible: "En stock" cuenta BOTELLAS y el resto
               cuenta VINOS, y un número pelado al lado de una palabra no deja
               saber cuál de los dos es. El desdoble completo (etiquetas y
               botellas) está siempre a la vista en la línea de resumen. */
            {
              id: "instock",
              label: "En stock",
              count: stats.inStock,
              detalle: `${stats.inStock} ${stats.inStock === 1 ? "botella" : "botellas"} en stock`,
            },
            {
              id: "favorites",
              label: "Favoritos",
              count: stats.favorites,
              detalle: `${stats.favorites} ${stats.favorites === 1 ? "vino favorito" : "vinos favoritos"}`,
            },
            {
              id: "nottasted",
              label: "Pendientes",
              count: stats.pending,
              detalle: `${stats.pending} ${stats.pending === 1 ? "vino que todavía no probaste" : "vinos que todavía no probaste"}`,
            },
            {
              id: "tasted",
              label: "Probados",
              count: stats.tasted,
              detalle: `${stats.tasted} ${stats.tasted === 1 ? "vino que ya probaste" : "vinos que ya probaste"}`,
            },
            {
              id: "cellarready",
              label: "Listos para abrir",
              count: null,
              detalle: "Vinos que están en su mejor momento para tomar",
            },
            {
              id: "historial",
              label: "Historial",
              count: stats.historial,
              detalle: `${stats.historial} ${stats.historial === 1 ? "vino que se te terminó" : "vinos que se te terminaron"}`,
              // Más apagado que el resto: es tu colección pasada, no una respuesta
              // a "¿qué abro hoy?". Sigue a un toque de distancia —separarlo en
              // otra pantalla obligaría a aprender un lugar nuevo por algo que se
              // consulta de vez en cuando— pero deja de pesar lo mismo que los
              // filtros de lo que sí tenés en casa.
              apagado: true,
            },
            {
              id: "all",
              label: "Todos",
              count: stats.total,
              detalle: `${stats.total} ${stats.total === 1 ? "vino en tu bodega" : "vinos en tu bodega"}`,
            },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              className={`bodega-chip ${filterType === f.id ? "is-active" : ""} ${f.apagado ? "is-muted" : ""}`}
              aria-pressed={filterType === f.id}
              title={f.detalle}
              aria-label={f.detalle}
              onClick={() => setFilterType(filterType === f.id ? "instock" : f.id)}
            >
              {f.label}
              {f.count != null && <span className="bodega-chip__n">{f.count}</span>}
            </button>
          ))}
        </div>

      </div>

      {/* Cuántos estás viendo y en qué orden. El orden vivía adentro del panel
          plegado, así que no se sabía por qué la lista estaba como estaba; en
          CellarTracker y Vivino filtro y orden son controles hermanos, arriba
          de la lista y siempre a la vista. */}
      <div className="bodega-summary">
        {/* Siempre decir qué estás mirando. "62 vinos" no distingue entre la
            colección entera y un recorte; con filtros puestos, saber que son
            "8 Malbec en stock" es la mitad de la orientación. */}
        <span className="bodega-summary__count">{contextLabel}</span>
        <div className="bodega-summary__tools">
          {/* Grilla o lista: con muchos vinos, la lista obliga a leer fila por
              fila; la grilla deja reconocer por la etiqueta de un vistazo. */}
          <div className="bodega-view" role="group" aria-label="Forma de ver la lista">
            <button
              type="button"
              className={`bodega-view__btn ${viewMode === "grid" ? "is-active" : ""}`}
              onClick={() => setViewMode("grid")}
              aria-pressed={viewMode === "grid"}
              aria-label="Ver en grilla"
              title="Grilla"
            >
              <Icon name="grid" size={16} />
            </button>
            <button
              type="button"
              className={`bodega-view__btn ${viewMode === "list" ? "is-active" : ""}`}
              onClick={() => setViewMode("list")}
              aria-pressed={viewMode === "list"}
              aria-label="Ver en lista"
              title="Lista"
            >
              <Icon name="list" size={16} />
            </button>
          </div>

          <button
            type="button"
            className={`bodega-more ${advancedOpen ? "is-open" : ""} ${hasAdvanced ? "has-active" : ""}`}
            onClick={() => setAdvancedOpen((o) => !o)}
            aria-expanded={advancedOpen}
            aria-label="Más filtros"
            title="Más filtros"
          >
            <Icon name="settings" size={16} />
            <span className="sr-only">Filtros</span>
            {hasAdvanced && <span className="bodega-more__dot" aria-hidden="true" />}
          </button>
        </div>
      </div>

      <div className="bodega-controls">
        {/* Agrupar y ordenar son decisiones distintas: antes el corte de la
            lista salía del orden, así que no se podía ver "por bodega,
            ordenado por puntaje". */}
        <Dropdown
          ariaLabel="Agrupar vinos"
          value={groupBy}
          onChange={setGroupBy}
          options={[
            { value: "auto", label: "Agrupar: automático" },
            { value: "none", label: "Sin agrupar" },
            { value: "type", label: "Por tipo" },
            { value: "winery", label: "Por bodega" },
            { value: "region", label: "Por región" },
            { value: "varietal", label: "Por varietal" },
            { value: "letter", label: "Por letra" },
          ]}
        />

        <Dropdown
          ariaLabel="Ordenar vinos"
          value={sortBy}
          onChange={setSortBy}
          options={[
            { value: "recent", label: "Agregados hace poco" },
            { value: "name", label: "A → Z" },
            { value: "rating", label: "Mejor puntuados" },
            { value: "year", label: "Cosecha más nueva" },
          ]}
        />

      </div>

      {/* Lo específico (tipo, varietal, región) se despliega sólo si lo pedís:
          la mayoría de las veces alcanza con los chips de arriba. */}
      {advancedOpen && (
        <div className="bodega-advanced">
          <Dropdown
            ariaLabel="Filtrar por tipo"
            value={filterType}
            onChange={setFilterType}
            options={[
              { value: "all", label: "Todos los tipos" },
              { value: "red", label: "Tintos" },
              { value: "white", label: "Blancos" },
              { value: "rosé", label: "Rosados" },
              { value: "sparkling", label: "Espumantes" },
              { value: "fortified", label: "Fortificados" },
            ]}
          />
          {varietalOptions.length > 1 && (
            <Dropdown
              ariaLabel="Filtrar por varietal"
              value={varietalFilter}
              onChange={setVarietalFilter}
              options={[
                { value: "all", label: "Todas las uvas" },
                ...varietalOptions.map((v) => ({ value: v, label: v })),
              ]}
            />
          )}
          {regionOptions.length > 1 && (
            <Dropdown
              ariaLabel="Filtrar por región"
              value={regionFilter}
              onChange={setRegionFilter}
              options={[
                { value: "all", label: "Todas las regiones" },
                ...regionOptions.map((r) => ({ value: r, label: r })),
              ]}
            />
          )}
        </div>
      )}

        </>
      )}

      {loading && <LoadingSkeleton type="card" count={4} />}

      {!loading && error && (
        <ErrorState
          title="No pudimos cargar tu bodega"
          hint="Tus vinos están guardados. Revisá tu conexión y probá de nuevo."
          onRetry={recargar}
        />
      )}

      {!loading && !error && sortedWines.length > 0 && (
        <div className={`wines-list wines-list--${viewMode}`}>
          {visibleWines.map((wine, i) => {
            const isPending = pendingActionId === wine._id;
            const expanded = expandedId === wine._id;
            const origin = [wine.winery, wine.region].filter(Boolean).join(" · ") || "Sin datos de origen";
            const enCava = tiempoEnCava(enCavaDesde(wine), { corto: true });
            // Corte de grupo: sólo cuando cambia respecto del vino anterior.
            const group = groupOf(wine);
            const showGroup = group && (i === 0 || groupOf(visibleWines[i - 1]) !== group);
            // Plegar una sección la saca de la pantalla entera: con 300 vinos,
            // poder cerrar "Tinto" y quedarte con los blancos es la diferencia
            // entre navegar y scrollear.
            if (group && collapsed.has(group) && !showGroup) return null;
            const sinAbrir = group && collapsed.has(group);
            return (
              <Fragment key={wine._id}>
              {showGroup && (
                <button
                  type="button"
                  className={`wines-group ${sinAbrir ? "is-collapsed" : ""}`}
                  onClick={() => toggleGroup(group)}
                  aria-expanded={!sinAbrir}
                >
                  <Icon name="chevron-down" size={15} className="wines-group__caret" />
                  <span className="wines-group__name">{group}</span>
                  <span className="wines-group__count">{groupCounts[group]}</span>
                </button>
              )}
              {sinAbrir ? null : (
              <article
                className={`wine-row ${expanded ? "is-expanded" : ""} ${isPending ? "is-pending" : ""} ${
                  Number(wine.quantity) <= 0 ? "is-history" : ""
                }`}
              >
                {/* Fila compacta: tocar expande la info y las acciones. */}
                <button
                  type="button"
                  className="wine-row__main"
                  onClick={() => setExpandedId(expanded ? null : wine._id)}
                  aria-expanded={expanded}
                >
                  <span className="wine-row__thumb">
                    <WinePhoto src={wine.image} type={wine.type} alt="" artSize={46} />
                    {/* Probado o por probar, siempre explícito: la ausencia de
                        marca no se lee como "pendiente", se lee como nada. */}
                    <span
                      className={`wine-row__state ${wine.tasted ? "is-tasted" : "is-pending"}`}
                      title={wine.tasted ? "Probado" : "Todavía no lo probaste"}
                    >
                      <Icon name={wine.tasted ? "check" : "circle"} size={11} />
                    </span>
                  </span>

                  <span className="wine-row__info">
                    <span className="wine-row__title">
                      {/* Sin la uva: ya la dice el chip de abajo. Se limpia al
                          dibujar para que los vinos cargados antes del cambio se
                          vean bien sin esperar la migración. */}
                      <span className="wine-row__name">{wineDisplayName(wine)}</span>
                      {wine.favorite && (
                        <Icon name="heart" filled size={13} className="wine-row__fav" aria-label="Favorito" />
                      )}
                    </span>
                    <span className="wine-row__sub">{origin}</span>
                    <span className="wine-row__chips chip-row">
                      <span className="chip chip--type">{WINE_TYPE_LABELS[wine.type] || WINE_TYPE_LABELS.unknown}</span>
                      {wine.varietal && <span className="chip chip--grape">{wine.varietal}</span>}
                      {wine.vintage && <span className="chip chip--year">{wine.vintage}</span>}
                    </span>
                  </span>

                  <span className="wine-row__right">
                    {/* Numérico en vez de cinco estrellas: dice lo mismo en un
                        cuarto del ancho, que es lo que hace falta para que la
                        fila entre completa en un teléfono. */}
                    {wine.rating > 0 && (
                      <span className="wine-row__rating" aria-label={`${wine.rating} de 5`}>
                        <Icon name="star" filled size={11} /> {wine.rating.toFixed(1)}
                      </span>
                    )}
                    <span
                      className={`wine-row__qty ${Number(wine.quantity) <= 0 ? "is-empty" : ""} ${
                        Number(wine.quantity) === 1 ? "is-last" : ""
                      }`}
                      title={stockLabel(wine.quantity)}
                    >
                      {Number(wine.quantity) <= 0 ? "—" : `×${wine.quantity}`}
                    </span>
                    {/* Una cava se mide en años: cuánto hace que lo tenés dice
                        algo que la cosecha no dice. */}
                    {enCava && <span className="wine-row__aged">{enCava}</span>}
                    <Icon name="chevron-down" size={18} className="wine-row__caret" />
                  </span>
                </button>

                {expanded && (
                  <div className="wine-row__expand">
                    <div className="wine-row__controls">
                      {/* El stepper dice qué cuenta ("Botellas"): "− ×2 +" a
                          secas obliga a acordarse de qué número es ése, y ahora
                          convive con un botón que también mueve el stock. Es
                          para corregir o registrar una compra; tomarte una tiene
                          su propio botón al lado. */}
                      <div className="wine-qty-controls" role="group" aria-label={`Botellas de ${wineDisplayName(wine)}`}>
                        <span className="wine-qty-controls__label" aria-hidden="true">Botellas</span>
                        <button type="button" className="qty-btn" onClick={() => handleAdjustQuantity(wine, -1)} disabled={isPending || Number(wine.quantity) <= 0} aria-label={`Quitar una botella de ${wineDisplayName(wine)}`} title="Quitar una botella (sin marcarla como tomada)">
                          <Icon name="minus" size={15} />
                        </button>
                        <span className="wine-qty" aria-live="polite">{wine.quantity}</span>
                        <button type="button" className="qty-btn" onClick={() => handleAdjustQuantity(wine, 1)} disabled={isPending} aria-label={`Sumar una botella de ${wineDisplayName(wine)}`} title="Sumá botellas si compraste más">
                          <Icon name="plus" size={15} />
                        </button>
                      </div>

                      {/* Mientras haya botellas, la acción es abrir una: es lo
                          que se hace con un vino que tenés en casa, y de paso
                          deja el historial al día. Sin stock ya no hay nada que
                          abrir, así que ahí el botón vuelve a ser el de marcar
                          probado —para un vino que tomaste en otro lado o para
                          corregir el dato—, que nunca toca el stock. */}
                      {Number(wine.quantity) > 0 ? (
                        <button
                          className="wine-action-btn wine-action-btn--open"
                          onClick={() => handleOpenBottle(wine)}
                          type="button"
                          disabled={isPending}
                        >
                          <Icon name="bottle" size={16} />
                          Abrí una botella
                        </button>
                      ) : (
                        <button
                          className={`wine-action-btn ${wine.tasted ? "is-active" : ""}`}
                          onClick={() => handleToggleTasted(wine)}
                          type="button"
                          disabled={isPending}
                        >
                          <Icon name={wine.tasted ? "check" : "circle"} size={16} />
                          {wine.tasted ? "Probado" : "Marcar probado"}
                        </button>
                      )}
                    </div>

                    {/* Las dos cosas juntas, que es de donde salía la confusión:
                        haberlo tomado y que te queden botellas no se contradicen. */}
                    <p className="wine-row__state-line">
                      {wine.tasted ? "Ya lo probaste" : "Todavía no lo probaste"}
                      {" · "}
                      {stockLabel(wine.quantity).toLowerCase()}
                      {/* Un vino que ya no cumple el filtro y sigue en pantalla
                          necesita decir por qué: si no, se lee como que el filtro
                          está roto. */}
                      {retenidos.has(wine._id) && (
                        <> · <em>se queda visible hasta que cambies de filtro</em></>
                      )}
                    </p>

                    <div className="wine-row__links">
                      <button type="button" className="wine-row__detail" onClick={() => navigate(`/vino/${wine._id}`)}>
                        Ver ficha completa <Icon name="arrow-right" size={15} />
                      </button>
                      <button
                        type="button"
                        className={`wine-row__icon-btn ${wine.favorite ? "is-fav" : ""}`}
                        onClick={() => handleToggleFavorite(wine)}
                        disabled={isPending}
                        title={wine.favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
                        aria-label={wine.favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
                      >
                        <Icon name="heart" filled={wine.favorite} size={17} />
                      </button>
                      <button
                        type="button"
                        className="wine-row__icon-btn wine-row__icon-btn--danger"
                        onClick={() => setShowDeleteConfirm(wine._id)}
                        disabled={isPending}
                        title="Eliminar este vino de tu bodega"
                        aria-label="Eliminar vino"
                      >
                        <Icon name="trash" size={17} />
                      </button>
                    </div>
                  </div>
                )}
              </article>
              )}
              </Fragment>
            );
          })}
        </div>
      )}

      {/* El corte de la lista, dicho de frente: cuántos faltan y un toque para
          traerlos. Con la búsqueda al lado, casi nunca hace falta usarlo —y ésa
          es la idea: llegar a un vino buscándolo, no scrolleando. */}
      {!loading && !error && restantes > 0 && (
        <div className="wines-more">
          <button type="button" className="wines-more__btn" onClick={() => setVisibles((n) => n + TANDA)}>
            Ver más
            <span className="wines-more__n">{restantes} sin mostrar</span>
          </button>
          <p className="wines-more__hint">O buscá por nombre, bodega o uva para ir directo.</p>
        </div>
      )}

      {!loading && !error && wines.length === 0 && (
        <EmptyState
          icon="bottle"
          title="Tu bodega está vacía"
          hint="Sacale una foto a la etiqueta y la cargamos por vos."
          actionLabel="Escanear mi primer vino"
          onAction={() => navigate("/agregar")}
        />
      )}

      {!loading && !error && wines.length > 0 && sortedWines.length === 0 && (
        <EmptyState
          icon="search"
          title="Sin resultados"
          hint="Probá limpiando la búsqueda o cambiando los filtros."
          actionLabel="Limpiar filtros"
          onAction={() => {
            setSearchTerm("");
            clearAllFilters();
          }}
        />
      )}

      <ConfirmModal
        isOpen={showDeleteConfirm !== null}
        title="¿Eliminar vino?"
        message={`Se quitará "${wines.find((wine) => wine._id === showDeleteConfirm)?.name || "este vino"}" de tu bodega. Podrás deshacer por unos segundos.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        isDangerous
        onConfirm={() => handleDeleteWine(showDeleteConfirm)}
        onCancel={() => setShowDeleteConfirm(null)}
      />
    </div>
  );
}
