import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ConfirmModal from "../components/ConfirmModal";
import Icon from "../components/Icon";
import WinePhoto from "../components/WinePhoto";
import StarRating from "../components/StarRating";
import BodegaFilters from "../components/BodegaFilters";
import LoadingSkeleton from "../components/LoadingSkeleton";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import { useToast } from "../context/ToastContext";
import { useWineCollection } from "../hooks/useWineCollection";
import { normalizeSearchText } from "../utils/text";
import { tiempoEnCava, enCavaDesde, stockLabel } from "../utils/cellarTime";
import { WINE_TYPE_LABELS } from "../data/wineReference";
import { getCellarStatus } from "../utils/cellarStatus";
import { normalizarVista, pasaVista } from "../utils/cellarViews";
import { wineDisplayName } from "../utils/wineIdentity";
import { trackEvent } from "../services/analyticsApi";
import "../styles/pages/BodyPage.css";

/**
 * ── POR QUÉ LOS FILTROS SE SEPARARON EN EJES ────────────────────────────────
 * Había UN solo estado (`filterType`) que mezclaba cinco preguntas distintas:
 * si tenés el vino, si lo probaste, si es favorito, de
 * qué tipo es y si está listo para abrir. Al ser uno solo, elegir "Tinto"
 * apagaba "En stock", así que "los tintos que tengo en casa" —la consulta más
 * obvia de una bodega— era imposible. No es un detalle: es la razón por la que
 * la pantalla se vuelve tediosa cuando hay muchos vinos, porque cada filtro
 * cancela al anterior en vez de acumularse.
 *
 * Ahora hay un eje PRINCIPAL (qué parte de la colección estás mirando) y
 * filtros que se combinan libremente encima.
 */

/** Los tipos de vino, para validar lo que llega por la URL. */
const TIPOS = ["red", "white", "rosé", "sparkling", "fortified"];

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
    bulkAction,
    recargar,
  } = useWineCollection();

  // El filtro inicial puede venir por prop o por query (?filter=favorites), que
  // es a donde redirige la ruta vieja /favoritos.
  const initialFromQuery =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("filter")
      : null;
  const inicial = initialFromQuery || initialFilter;

  /**
   * Qué parte de la colección estás mirando. Arranca en "en stock" porque la
   * pregunta con la que uno abre la bodega es "¿qué tengo para tomar?", no
   * "¿qué tuve alguna vez?".
   */
  const [vista, setVista] = useState(() => normalizarVista(inicial) || "instock");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  // Filtros que se COMBINAN entre sí y con la vista.
  const [soloFavoritos, setSoloFavoritos] = useState(inicial === "favorites");
  const [soloListos, setSoloListos] = useState(false);
  // null = no filtra por probado; true = sólo probados; false = sólo pendientes.
  const [probado, setProbado] = useState(null);
  const [tipoFilter, setTipoFilter] = useState(TIPOS.includes(inicial) ? inicial : "all");
  const [varietalFilter, setVarietalFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  /**
   * Selección múltiple.
   *
   * Existe porque una bodega crece y "Probados" es la parte que más crece: con
   * ochenta vinos, arreglar una tanda mal cargada de a uno son ochenta idas y
   * vueltas a la ficha. Se entra a mano —no con una pulsación larga, que no se
   * descubre sola— y mientras dura, tocar una fila la elige en vez de abrirla:
   * un modo con dos comportamientos distintos para el mismo gesto es confuso
   * sólo si no se ve en qué modo estás, y acá se ve.
   */
  const [seleccion, setSeleccion] = useState(() => new Set());
  const [modoSeleccion, setModoSeleccion] = useState(false);
  const [enLote, setEnLote] = useState(false);
  const [confirmarLote, setConfirmarLote] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [pendingActionId, setPendingActionId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  /**
   * Lista o grilla. Se recuerda entre visitas.
   *
   * Es una preferencia y no una acción: quien elige grilla la elige una vez y
   * espera encontrarla así la próxima. Volver a lista en cada recarga obliga a
   * repetir la misma decisión para siempre, y hace parecer que el control no
   * funcionó.
   */
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem("rincones_bodega_vista") === "grid" ? "grid" : "list";
    } catch {
      // Modo privado o almacenamiento bloqueado: se sigue con el valor por defecto.
      return "list";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("rincones_bodega_vista", viewMode);
    } catch {
      // Si no se puede guardar, la app funciona igual: sólo no se recuerda.
    }
  }, [viewMode]);
  /**
   * La agrupación ya no es un control: agrupa sola por tipo cuando la lista deja
   * de recorrerse de un vistazo.
   *
   * Era un desplegable con seis opciones (tipo, bodega, región, varietal, letra,
   * ninguna) en una pantalla que ya tenía demasiadas. Agrupar es una decisión que
   * casi nadie toma a mano: se abre la bodega para buscar un vino, no para
   * reorganizarla. Y para lo primero están la búsqueda y los filtros, que son más
   * rápidos. El automático hace lo correcto sin preguntar nada.
   */
  const groupBy = "auto";
  const [collapsed, setCollapsed] = useState(() => new Set());
  const undoTimerRef = useRef(null);
  const pendingDeleteToastRef = useRef("");

  useEffect(() => {
    const v = normalizarVista(initialFilter);
    if (v) setVista(v);
  }, [initialFilter]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  /**
   * Cambiar de vista cierra la selección.
   *
   * Un vino elegido en "Probados" que sigue elegido —invisible— cuando ya estás
   * mirando "En stock" es una bomba de tiempo: el contador dice 5, ves 2 tildados
   * y "Eliminar" se lleva tres que no estabas mirando.
   */
  useEffect(() => {
    setModoSeleccion(false);
    setSeleccion(new Set());
  }, [vista]);

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

  /** Búsqueda y facetas (tipo, varietal, región). */
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
      if (tipoFilter !== "all" && wine.type !== tipoFilter) return false;
      if (varietalFilter !== "all" && wine.varietal !== varietalFilter) return false;
      if (regionFilter !== "all" && wine.region !== regionFilter) return false;
      return true;
    },
    [terms, tipoFilter, varietalFilter, regionFilter]
  );

  /**
   * La vista y los filtros que se le acumulan encima.
   *
   * Un vino SIN STOCK no aparece en la vista principal, y punto. Antes se quedaba
   * en pantalla un rato después de vaciarlo —para que el "+" no se fuera en el
   * mismo gesto— y el efecto era el contrario del buscado: la lista de "lo que
   * tengo" mostraba cosas que ya no tengo, que es exactamente lo que uno no
   * quiere ver ahí. La red de seguridad para el toque equivocado es el "Deshacer"
   * del aviso, que dura ocho segundos y devuelve la botella a su lote.
   */
  const enLaVista = useCallback((wine) => pasaVista(vista, wine), [vista]);

  const pasaFiltros = useCallback(
    (wine) => {
      if (soloFavoritos && !wine.favorite) return false;
      if (probado !== null && Boolean(wine.tasted) !== probado) return false;
      if (soloListos && getCellarStatus(wine).status !== "peak") return false;
      return true;
    },
    [soloFavoritos, probado, soloListos]
  );

  const filteredWines = useMemo(
    () => wines.filter((w) => enLaVista(w) && pasaFiltros(w) && pasaBusqueda(w)),
    [wines, enLaVista, pasaFiltros, pasaBusqueda]
  );

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
     * —sigue siendo parte de tu colección— pero deja de ser protagonista: baja al
     * final, siempre.
     *
     * En "En stock" no cambia nada, porque ahí están todos llenos. Y los recién
     * tocados también caen al final, que es justo donde corresponde que quede un
     * vino que acabás de vaciar.
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
  }, [
    vista,
    searchTerm,
    soloFavoritos,
    soloListos,
    probado,
    tipoFilter,
    varietalFilter,
    regionFilter,
    sortBy,
    effectiveGroupBy,
  ]);

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
  /**
   * Cuántos vinos hay en cada vista, respetando TODO lo demás que esté aplicado.
   *
   * Va adentro de los botones de la vista, y con eso se van dos bloques enteros de
   * la pantalla: la tira de "Tu colección" y la línea de "51 vinos en stock". Los
   * tres decían números de lo mismo en tres lugares distintos.
   *
   * Que el número respete los otros filtros es lo que lo vuelve útil de verdad:
   * con "Favoritos" puesto, ver "En stock 5 · Historial 2" te dice de antemano qué
   * vas a encontrar del otro lado, en vez de obligarte a tocar para descubrirlo.
   */
  const conteoPorVista = useMemo(() => {
    const base = wines.filter((w) => pasaFiltros(w) && pasaBusqueda(w));
    return {
      instock: base.filter((w) => pasaVista("instock", w)).length,
      all: base.length,
      probados: base.filter((w) => pasaVista("probados", w)).length,
    };
  }, [wines, pasaFiltros, pasaBusqueda]);

  /**
   * Los filtros puestos, como fichas que se pueden sacar de a una.
   *
   * Un filtro activo que no se ve es la forma más común de que alguien crea que
   * "faltan vinos": el panel está cerrado, la lista está recortada y no hay nada
   * en pantalla que lo explique. Acá cada filtro aplicado tiene su ficha, y la
   * ficha es el botón para quitarlo.
   */
  const filtrosActivos = useMemo(() => {
    const fichas = [];
    if (soloFavoritos) fichas.push({ id: "fav", label: "Favoritos", quitar: () => setSoloFavoritos(false) });
    if (probado === false) fichas.push({ id: "prob", label: "Sin probar", quitar: () => setProbado(null) });
    if (probado === true) fichas.push({ id: "prob", label: "Probados", quitar: () => setProbado(null) });
    if (soloListos) fichas.push({ id: "listos", label: "Listos para abrir", quitar: () => setSoloListos(false) });
    if (tipoFilter !== "all") {
      fichas.push({
        id: "tipo",
        label: WINE_TYPE_LABELS[tipoFilter] || tipoFilter,
        quitar: () => setTipoFilter("all"),
      });
    }
    if (varietalFilter !== "all") fichas.push({ id: "uva", label: varietalFilter, quitar: () => setVarietalFilter("all") });
    if (regionFilter !== "all") fichas.push({ id: "region", label: regionFilter, quitar: () => setRegionFilter("all") });
    return fichas;
  }, [soloFavoritos, probado, soloListos, tipoFilter, varietalFilter, regionFilter]);

  /**
   * Qué decir cuando no hay nada que mostrar.
   *
   * Con algún filtro o búsqueda puesta, el vacío lo causaste vos y la salida es
   * sacarlos. Sin nada puesto, el vacío es un estado real de tu bodega y mandarte
   * a "limpiar los filtros" es mandarte a arreglar algo que no está roto.
   */
  const vacio = useMemo(() => {
    const hayRecorte = Boolean(searchTerm.trim()) || filtrosActivos.length > 0;
    if (hayRecorte) {
      return {
        icon: "search",
        title: "Sin resultados",
        hint: "Probá limpiando la búsqueda o cambiando los filtros.",
        actionLabel: "Limpiar filtros",
        onAction: () => {
          setSearchTerm("");
          clearAllFilters();
        },
      };
    }
    if (vista === "probados") {
      return {
        icon: "check",
        title: "Todavía no probaste ninguno",
        hint: "Cuando abrís una botella, el vino queda marcado acá solo.",
        actionLabel: "Ver lo que tenés",
        onAction: () => setVista("instock"),
      };
    }
    if (vista === "instock") {
      return {
        icon: "bottle",
        title: "No te queda ninguna botella",
        // Lo que tomaste no se perdió: está en Probados. Decirlo acá es lo que
        // evita pensar que la app borró algo.
        hint: "Los vinos que tomaste siguen en Probados.",
        actionLabel: "Escanear un vino",
        onAction: () => navigate("/agregar"),
      };
    }
    return {
      icon: "bottle",
      title: "Tu bodega está vacía",
      actionLabel: "Escanear un vino",
      onAction: () => navigate("/agregar"),
    };
  }, [searchTerm, filtrosActivos, vista, navigate]);

  // ── Selección múltiple ─────────────────────────────────────────────────────

  const alternarSeleccion = (id) =>
    setSeleccion((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });

  const salirDeSeleccion = () => {
    setModoSeleccion(false);
    setSeleccion(new Set());
  };

  /**
   * "Todos" son los que están A LA VISTA, no los que existen.
   *
   * Es la diferencia entre una herramienta y una trampa: con un filtro puesto y
   * doce vinos en pantalla, "seleccionar todo" tiene que elegir esos doce. Si
   * eligiera los trescientos de la colección, el siguiente toque —que puede ser
   * "Eliminar"— haría algo que nadie vio venir.
   */
  const todosALaVista = visibleWines.map((w) => w._id);
  const todosElegidos = todosALaVista.length > 0 && todosALaVista.every((id) => seleccion.has(id));

  const alternarTodos = () =>
    setSeleccion(todosElegidos ? new Set() : new Set(todosALaVista));

  const ACCIONES_EN_LOTE = {
    tasted: (n) => `${n === 1 ? "1 vino marcado" : `${n} vinos marcados`} como probado`,
    untasted: (n) => `${n === 1 ? "1 vino" : `${n} vinos`} sin marca de probado`,
    favorite: (n) => `${n === 1 ? "1 vino" : `${n} vinos`} en favoritos`,
    unfavorite: (n) => `${n === 1 ? "1 vino" : `${n} vinos`} fuera de favoritos`,
    delete: (n) => `${n === 1 ? "1 vino eliminado" : `${n} vinos eliminados`}`,
  };

  const aplicarEnLote = async (accion) => {
    const ids = [...seleccion];
    if (ids.length === 0 || enLote) return;
    setEnLote(true);
    try {
      const afectados = await bulkAction(ids, accion);
      // Se informa lo que CAMBIÓ, no lo que se mandó: si de diez seleccionados
      // seis ya estaban marcados, decir "10 marcados" es contarle al usuario un
      // trabajo que no se hizo.
      showSuccess(ACCIONES_EN_LOTE[accion](afectados));
      salirDeSeleccion();
    } catch {
      showError("No se pudo aplicar el cambio");
    } finally {
      setEnLote(false);
      setConfirmarLote(false);
    }
  };

  const clearAllFilters = () => {
    setSoloFavoritos(false);
    setSoloListos(false);
    setProbado(null);
    setTipoFilter("all");
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

  const handleToggleFavorite = (wine) =>
    withPendingAction(wine._id, async () => {
      await toggleFavorite(wine._id, !wine.favorite);
      showSuccess(wine.favorite ? "Eliminado de favoritos" : "Agregado a favoritos");
    });

  /**
   * Toggle puro: dice si ya lo tomaste alguna vez y no toca el stock. Sirve para
   * un vino que probaste en otro lado, o para corregir el dato.
   *
   * Desmarcarlo lleva deshacer porque, estando en la vista "Probados", la fila
   * desaparece en el mismo gesto: sin la salida en el aviso habría que cambiar de
   * vista y buscar el vino para arreglar un toque equivocado.
   */
  const handleToggleTasted = (wine) =>
    withPendingAction(wine._id, async () => {
      const desmarcando = wine.tasted === true;
      await updateWineTasted(wine._id, !wine.tasted);

      if (!desmarcando) {
        showSuccess("Vino marcado como probado");
        return;
      }

      const toastId = addToast("Marcado como no probado", "success", 8000, {
        label: "Deshacer",
        onClick: async () => {
          removeToast(toastId);
          try {
            await updateWineTasted(wine._id, true);
            showSuccess("Vuelve a estar entre los probados");
          } catch {
            showError("No se pudo deshacer");
          }
        },
      });
    });

  /**
   * Abrir una botella: descuenta una y deja el vino como probado.
   *
   * Es la acción de la fila porque es lo que uno hace de verdad con un vino que
   * tiene en casa. "Probado" es un hecho aparte del stock y por eso conviven sin
   * pisarse: podés haberlo tomado y que igual te queden dos botellas, y podés
   * reponerlo sin dejar de haberlo tomado.
   *
   * Siempre con deshacer: cuesta una botella de tu cava y se dispara con un
   * toque, así que tocarlo por error no puede ser definitivo. El aviso dice
   * cuántas quedan (para no tener que ir a contarlas) y trae la salida al lado.
   */
  const handleOpenBottle = (wine) => {
    if (Number(wine.quantity) <= 0) return;
    const eraProbado = wine.tasted === true;
    const quedan = Math.max(0, Number(wine.quantity) - 1);

    withPendingAction(wine._id, async () => {
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
    withPendingAction(wine._id, async () => {
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
      {/* ── Buscador y filtros, en UNA fila ──────────────────────────────────
          Antes de llegar al primer vino había cuatrocientos cincuenta píxeles de
          controles en una pantalla de ochocientos: la tira de la colección, el
          buscador, la vista, la fila de filtros y la línea de conteo. Más de media
          pantalla de herramientas para mirar una lista de vinos.

          La protagonista es la colección. Todo lo que no es un vino se apretó en
          dos filas: ésta y la de la vista, que además lleva los números adentro. */}
      <div className="bodega-bar">
        <div className="search-container">
          <span className="search-icon" aria-hidden="true"><Icon name="search" size={18} /></span>
          <input
            type="text"
            placeholder="Buscá un vino…"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="search-input"
            aria-label="Buscar por nombre, bodega, varietal o notas"
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

        {/* Un embudo, no un engranaje: el engranaje significa "configuración" en
            todas las apps del mundo, así que como botón de filtros no se lee —hay
            que probarlo para saber qué hace—. */}
        <button
          type="button"
          className={`bodega-filtros ${advancedOpen ? "is-open" : ""} ${
            filtrosActivos.length > 0 ? "has-active" : ""
          }`}
          onClick={() => setAdvancedOpen(true)}
          aria-haspopup="dialog"
          aria-label={
            filtrosActivos.length > 0
              ? `Filtros y orden (${filtrosActivos.length} aplicados)`
              : "Filtros y orden"
          }
          title="Filtros y orden"
        >
          <Icon name="filter" size={17} />
          {filtrosActivos.length > 0 && (
            <span className="bodega-filtros__n">{filtrosActivos.length}</span>
          )}
        </button>
      </div>

      {/* La vista, con su número adentro. Los tres números que antes vivían en
          tres bloques distintos (la tira de la colección, la línea de conteo y
          estos botones) son uno solo, y acá dice de antemano qué vas a encontrar
          del otro lado sin tener que tocar para averiguarlo. */}
      <div className="segmented bodega-vista" role="group" aria-label="Qué parte de tu bodega ver">
        {[
          { id: "instock", label: "En stock", detalle: "Los que tenés en casa ahora" },
          { id: "all", label: "Todos", detalle: "Toda tu colección" },
          { id: "probados", label: "Probados", detalle: "Los que tomaste alguna vez, tengas o no" },
        ].map((v) => (
          <button
            key={v.id}
            type="button"
            className={`segmented__btn ${vista === v.id ? "is-active" : ""}`}
            aria-pressed={vista === v.id}
            title={v.detalle}
            onClick={() => setVista(v.id)}
          >
            {v.label}
            <span className="segmented__n">{conteoPorVista[v.id]}</span>
          </button>
        ))}
      </div>

      {/* Las fichas de lo que está filtrando. Cada una es el botón para sacarla. */}
      {filtrosActivos.length > 0 && (
        <div className="bodega-fichas" role="group" aria-label="Filtros aplicados">
          {filtrosActivos.map((f) => (
            <button key={f.id} type="button" className="bodega-ficha" onClick={f.quitar}>
              {f.label}
              <Icon name="x" size={12} />
            </button>
          ))}
          {filtrosActivos.length > 1 && (
            <button type="button" className="bodega-ficha bodega-ficha--clear" onClick={clearAllFilters}>
              Limpiar todo
            </button>
          )}
        </div>
      )}

      {/* La entrada a la selección múltiple.
          Es un botón de texto y no un ícono: "seleccionar varios" no tiene un
          dibujo que se entienda sin probarlo, y esconderlo detrás de una pulsación
          larga —el patrón del sistema— lo vuelve invisible para quien no sabe que
          existe. Aparece recién con tres vinos: con dos, tocarlos de a uno es más
          rápido que entrar y salir de un modo. */}
      {!loading && !error && !modoSeleccion && sortedWines.length >= 3 && (
        <div className="bodega-seleccion-entrada">
          <button type="button" className="bodega-seleccionar" onClick={() => setModoSeleccion(true)}>
            <Icon name="check" size={14} /> Seleccionar
          </button>
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
        <div
          className={`wines-list wines-list--${viewMode} ${
            vista === "instock" ? "wines-list--protagonista" : "wines-list--archivo"
          } ${modoSeleccion ? "is-selecting" : ""}`}
        >
          {visibleWines.map((wine, i) => {
            const isPending = pendingActionId === wine._id;
            const esGrilla = viewMode === "grid";
            const elegido = seleccion.has(wine._id);
            // La vitrina muestra más de cada vino porque son pocos y son los que
            // podés abrir hoy: el tipo, la uva, el puntaje y una foto que se ve.
            const esVitrina = vista === "instock";
            const expanded = expandedId === wine._id;
            // Uva y año en una línea, bodega en otra.
            //
            // Las tres cosas en un solo renglón daban textos de 45 caracteres que
            // no entran en el ancho de un teléfono ni en dos líneas —"Cabernet
            // Sauvignon · 2017 · Bodegas Sale…"— y volvía el corte que había que
            // sacar. Partido así, cada línea entra sola y no depende del largo de
            // la otra: son dos datos distintos y se leen mejor separados.
            //
            // Y no se repite lo que el nombre ya dice. Mucha gente carga el vino
            // como "Trapiche Chardonnay 2018", y la fila terminaba mostrando
            // "Trapiche Chardonnay 2018 / Chardonnay · 2018 / Trapiche": tres
            // renglones para dos datos. Cada uno se muestra sólo si agrega algo.
            const nombre = normalizeSearchText(wineDisplayName(wine));
            const yaLoDice = (valor) =>
              Boolean(valor) && nombre.includes(normalizeSearchText(String(valor)));
            const uvaYAño = [
              yaLoDice(wine.varietal) ? "" : wine.varietal,
              yaLoDice(wine.vintage) ? "" : wine.vintage,
            ]
              .filter(Boolean)
              .join(" · ");
            const bodega = yaLoDice(wine.winery) ? "" : wine.winery;
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
                } ${elegido ? "is-selected" : ""}`}
              >
                {/* La cabecera tiene DOS controles hermanos: el cuerpo, que
                    expande, y el chip de probado, que cambia el dato ahí mismo.
                    Antes era un solo botón que envolvía todo, así que la marca de
                    "probado" sólo se podía MIRAR: para cambiarla había que
                    expandir la fila o entrar a la ficha, tres toques para un dato
                    que es de una palabra. Un botón adentro de otro botón no es
                    HTML válido, y por eso son hermanos y no anidados. */}
                <div className="wine-row__head">
                  {/* En LISTA tocar expande —ahí conviven la fila y sus acciones
                      rápidas—; en GRILLA tocar abre la ficha.
                      Es la misma decisión que toma Vivino y responde a para qué
                      sirve cada modo: la grilla es para reconocer una etiqueta de
                      un vistazo, y expandir una tarjeta adentro de una cuadrícula
                      estira una celda y descoloca a todas sus vecinas. */}
                  <button
                    type="button"
                    className="wine-row__main"
                    onClick={() => {
                      if (modoSeleccion) return alternarSeleccion(wine._id);
                      return esGrilla
                        ? navigate(`/vino/${wine._id}`)
                        : setExpandedId(expanded ? null : wine._id);
                    }}
                    aria-expanded={modoSeleccion || esGrilla ? undefined : expanded}
                    aria-pressed={modoSeleccion ? elegido : undefined}
                  >
                    {/* La tilde ocupa el lugar de la foto en vez de sumar una
                        columna: la fila no se reacomoda al entrar y salir del
                        modo, y el vino elegido se distingue del que no sin tener
                        que comparar dos casillas chiquitas. */}
                    <span className={`wine-row__thumb ${modoSeleccion ? "is-picking" : ""}`}>
                      {modoSeleccion ? (
                        <span className={`wine-row__tick ${elegido ? "is-on" : ""}`} aria-hidden="true">
                          {elegido && <Icon name="check" size={17} />}
                        </span>
                      ) : (
                        <WinePhoto
                          src={wine.image}
                          type={wine.type}
                          alt=""
                          artSize={esVitrina ? 104 : 40}
                          /* La vitrina presenta la botella; la fila es una miniatura
                             de 46px, donde una botella entera no se leería. */
                          fit={esVitrina ? "contain" : "cover"}
                        />
                      )}
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
                      {/* Uva, cosecha y bodega como TEXTO y no como pastillas.
                          Eran tres chips con borde y padding cada uno, y en un
                          teléfono se comían el ancho que necesita el nombre: con
                          64 vinos, media lista mostraba títulos cortados como
                          "Rutini Single Vin…". Dicen lo mismo y ocupan un tercio.
                          El tipo de vino lo dice el dibujo de la botella —y el
                          encabezado del grupo cuando se agrupa por tipo—, así que
                          no se repite acá. */}
                      {/* En la vitrina, el tipo se dice con todas las letras: el
                          dibujo de la botella lo insinúa por el color, pero un
                          rosado y un tinto claro se parecen demasiado como para
                          dejarlo en manos de un ícono de 40px. */}
                      {(esVitrina || uvaYAño) && (
                        <span className="wine-row__sub">
                          {esVitrina && (
                            <span className={`wine-row__type wine-row__type--${wine.type || "unknown"}`}>
                              {WINE_TYPE_LABELS[wine.type] || WINE_TYPE_LABELS.unknown}
                            </span>
                          )}
                          {uvaYAño}
                        </span>
                      )}
                      {bodega && <span className="wine-row__winery">{bodega}</span>}

                      {/* El puntaje con estrellas y no como número: en la vitrina
                          hay lugar, y cinco estrellas se comparan de un vistazo
                          entre vinos vecinos, que es justo lo que uno hace acá.
                          En el archivo sigue siendo el número, que ocupa un
                          cuarto del ancho. */}
                      {esVitrina && wine.rating > 0 && (
                        <StarRating value={wine.rating} size="sm" />
                      )}
                    </span>

                    <span className="wine-row__right">
                      <span
                        className={`wine-row__qty ${Number(wine.quantity) <= 0 ? "is-empty" : ""} ${
                          Number(wine.quantity) === 1 ? "is-last" : ""
                        }`}
                        title={stockLabel(wine.quantity)}
                      >
                        {Number(wine.quantity) <= 0 ? "—" : `×${wine.quantity}`}
                      </span>
                      {/* Numérico en vez de cinco estrellas: dice lo mismo en un
                          cuarto del ancho. */}
                      {!esVitrina && wine.rating > 0 && (
                        <span className="wine-row__rating" aria-label={`${wine.rating} de 5`}>
                          <Icon name="star" filled size={11} /> {wine.rating.toFixed(1)}
                        </span>
                      )}
                      {/* En grilla no hay nada que desplegar: la flecha diría una
                          mentira sobre lo que va a pasar al tocar. */}
                      <Icon
                        name={esGrilla ? "arrow-right" : "chevron-down"}
                        size={esGrilla ? 15 : 18}
                        className="wine-row__caret"
                      />
                    </span>
                  </button>

                  {/* Probado o por probar, siempre explícito y siempre editable:
                      la ausencia de marca no se lee como "pendiente", se lee como
                      nada.

                      Menos en la vista "Probados", donde todos lo están: una
                      columna entera repitiendo la misma palabra en verde no
                      informa, sólo ocupa el ancho del nombre. Ahí el chip se va y
                      desmarcar se hace desde "Todos", desde la ficha o eligiendo
                      varios de una. */}
                  {vista !== "probados" && (
                  <button
                    type="button"
                    className={`toggle-chip wine-row__tasted ${wine.tasted ? "is-on" : ""}`}
                    onClick={() => handleToggleTasted(wine)}
                    // Durante la selección la fila entera significa "elegir":
                    // dejar un control que hace otra cosa en el medio es pedir un
                    // toque equivocado.
                    disabled={isPending || modoSeleccion}
                    aria-pressed={wine.tasted}
                    title={
                      wine.tasted
                        ? "Ya lo probaste — tocá para desmarcarlo"
                        : "Todavía no lo probaste — tocá para marcarlo"
                    }
                    aria-label={
                      wine.tasted
                        ? `Marcar ${wineDisplayName(wine)} como no probado`
                        : `Marcar ${wineDisplayName(wine)} como probado`
                    }
                  >
                    <Icon name={wine.tasted ? "check" : "circle"} size={13} />
                    <span className="wine-row__tasted-text">
                      {wine.tasted ? "Probado" : "Sin probar"}
                    </span>
                  </button>
                  )}
                </div>

                {expanded && !esGrilla && (
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
                        {/* El número va en un span interno con `key`: al cambiar,
                            React lo remonta y la animación de rebote se vuelve a
                            reproducir. La región viva es la de afuera y no se
                            desmonta nunca, así el lector de pantalla sigue
                            anunciando el cambio. */}
                        <span className="wine-qty" aria-live="polite">
                          <span key={wine.quantity} className="wine-qty__n">{wine.quantity}</span>
                        </span>
                        <button type="button" className="qty-btn" onClick={() => handleAdjustQuantity(wine, 1)} disabled={isPending} aria-label={`Sumar una botella de ${wineDisplayName(wine)}`} title="Sumá botellas si compraste más">
                          <Icon name="plus" size={15} />
                        </button>
                      </div>

                      {/* Mientras haya botellas, la acción es abrir una: es lo
                          que se hace con un vino que tenés en casa, y de paso lo
                          deja marcado como probado. Sin stock ya no hay nada que
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
                    {/* Stock y antigüedad. Si lo probaste ya lo dice el chip de la
                        cabecera, que además se puede tocar: decirlo en los dos
                        lados era repetir el mismo dato a dos centímetros.
                        El "en cava hace…" bajó acá desde la fila compacta —una
                        cava se mide en años y eso vale, pero no cuando competía
                        por ancho con el nombre del vino—. */}
                    <p className="wine-row__state-line">
                      {stockLabel(wine.quantity)}
                      {enCava && ` · en tu cava hace ${enCava}`}
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

      {/* El vacío dice POR QUÉ está vacío. "Sin resultados · probá limpiando los
          filtros" sobre una vista sin ningún filtro puesto manda a buscar un
          problema que no existe: lo que pasa es que todavía no tomaste ninguno, o
          que te quedaste sin botellas, y cada caso tiene su salida distinta. */}
      {!loading && !error && wines.length > 0 && sortedWines.length === 0 && (
        <EmptyState {...vacio} />
      )}

      <BodegaFilters
        abierto={advancedOpen}
        onClose={() => setAdvancedOpen(false)}
        resultados={sortedWines.length}
        sortBy={sortBy}
        setSortBy={setSortBy}
        soloFavoritos={soloFavoritos}
        setSoloFavoritos={setSoloFavoritos}
        probado={probado}
        setProbado={setProbado}
        vista={vista}
        soloListos={soloListos}
        setSoloListos={setSoloListos}
        tipoFilter={tipoFilter}
        setTipoFilter={setTipoFilter}
        varietalFilter={varietalFilter}
        setVarietalFilter={setVarietalFilter}
        varietalOptions={varietalOptions}
        regionFilter={regionFilter}
        setRegionFilter={setRegionFilter}
        regionOptions={regionOptions}
        viewMode={viewMode}
        setViewMode={setViewMode}
        hayFiltros={filtrosActivos.length > 0}
        onLimpiar={clearAllFilters}
      />

      {/* La barra de selección: fija abajo, encima de la navegación.
          Va al pie y no arriba porque es donde llega el pulgar, y porque las
          acciones tienen que estar cerca de las filas que se están tocando. La
          destructiva vive separada del resto y pide confirmación; las otras tres
          son reversibles con el mismo botón que las aplicó. */}
      {modoSeleccion && (
        <div className="bodega-barra" role="region" aria-label="Acciones sobre lo seleccionado">
          <div className="bodega-barra__head">
            <button
              type="button"
              className="bodega-barra__todos"
              onClick={alternarTodos}
              aria-pressed={todosElegidos}
            >
              <span className={`wine-row__tick ${todosElegidos ? "is-on" : ""}`} aria-hidden="true">
                {todosElegidos && <Icon name="check" size={15} />}
              </span>
              {todosElegidos ? "Ninguno" : "Todos"}
            </button>

            <strong className="bodega-barra__n" aria-live="polite">
              {seleccion.size === 0
                ? "Elegí vinos"
                : `${seleccion.size} ${seleccion.size === 1 ? "elegido" : "elegidos"}`}
            </strong>

            <button type="button" className="bodega-barra__salir" onClick={salirDeSeleccion}>
              Listo
            </button>
          </div>

          <div className="bodega-barra__acciones">
            <button
              type="button"
              className="bodega-barra__accion"
              disabled={seleccion.size === 0 || enLote}
              onClick={() => aplicarEnLote("tasted")}
            >
              <Icon name="check" size={15} /> Probado
            </button>
            <button
              type="button"
              className="bodega-barra__accion"
              disabled={seleccion.size === 0 || enLote}
              onClick={() => aplicarEnLote("favorite")}
            >
              <Icon name="heart" size={15} /> Favorito
            </button>
            <button
              type="button"
              className="bodega-barra__accion bodega-barra__accion--peligro"
              disabled={seleccion.size === 0 || enLote}
              onClick={() => setConfirmarLote(true)}
            >
              <Icon name="trash" size={15} /> Eliminar
            </button>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmarLote}
        title={seleccion.size === 1 ? "¿Eliminar el vino?" : `¿Eliminar ${seleccion.size} vinos?`}
        // Sin deshacer, a diferencia del borrado de a uno: recuperar una tanda
        // entera es otra operación, y prometerlo sin tenerlo sería peor. Por eso
        // acá el aviso es explícito.
        message="Se van de tu bodega con sus notas y momentos. Esto no se puede deshacer."
        confirmText={enLote ? "Eliminando…" : "Eliminar"}
        cancelText="Cancelar"
        isDangerous
        onConfirm={() => aplicarEnLote("delete")}
        onCancel={() => setConfirmarLote(false)}
      />

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
