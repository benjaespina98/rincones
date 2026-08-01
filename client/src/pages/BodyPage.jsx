import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ConfirmModal from "../components/ConfirmModal";
import Icon from "../components/Icon";
import WinePhoto from "../components/WinePhoto";
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
import { wineDisplayName } from "../utils/wineIdentity";
import { trackEvent } from "../services/analyticsApi";
import "../styles/pages/BodyPage.css";

/**
 * ── POR QUÉ LOS FILTROS SE SEPARARON EN EJES ────────────────────────────────
 * Había UN solo estado (`filterType`) que mezclaba cinco preguntas distintas:
 * si tenés el vino (en stock / historial), si lo probaste, si es favorito, de
 * qué tipo es y si está listo para abrir. Al ser uno solo, elegir "Tinto"
 * apagaba "En stock", así que "los tintos que tengo en casa" —la consulta más
 * obvia de una bodega— era imposible. No es un detalle: es la razón por la que
 * la pantalla se vuelve tediosa cuando hay muchos vinos, porque cada filtro
 * cancela al anterior en vez de acumularse.
 *
 * Ahora hay un eje PRINCIPAL (qué parte de la colección estás mirando) y
 * filtros que se combinan libremente encima.
 */

/** El eje principal: qué parte de la colección. Excluyentes entre sí. */
const VISTAS = ["instock", "all", "historial"];

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
  const [vista, setVista] = useState(() => (VISTAS.includes(inicial) ? inicial : "instock"));
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [pendingActionId, setPendingActionId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // Con pocos vinos la lista se lee bien; a partir de ~8 la grilla gana.
  const [viewMode, setViewMode] = useState("list");
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
    if (VISTAS.includes(initialFilter)) setVista(initialFilter);
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
  const pasaVista = useCallback(
    (wine) => {
      const conStock = Number(wine.quantity) > 0;
      if (vista === "instock") return conStock;
      // Historial: lo que ya no tenés en casa. Sigue siendo parte de tu colección
      // —dice por dónde pasaste— pero no responde "¿qué abro hoy?".
      if (vista === "historial") return !conStock;
      return true;
    },
    [vista]
  );

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
    () => wines.filter((w) => pasaVista(w) && pasaFiltros(w) && pasaBusqueda(w)),
    [wines, pasaVista, pasaFiltros, pasaBusqueda]
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
      instock: base.filter((w) => Number(w.quantity) > 0).length,
      all: base.length,
      historial: base.filter((w) => Number(w.quantity) <= 0).length,
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
      <div className="bodega-vista" role="group" aria-label="Qué parte de tu bodega ver">
        {[
          { id: "instock", label: "En stock", detalle: "Los vinos que tenés en casa" },
          { id: "all", label: "Todos", detalle: "Toda tu colección" },
          { id: "historial", label: "Historial", detalle: "Los que se te terminaron" },
        ].map((v) => (
          <button
            key={v.id}
            type="button"
            className={`bodega-vista__btn ${vista === v.id ? "is-active" : ""}`}
            aria-pressed={vista === v.id}
            title={v.detalle}
            onClick={() => setVista(v.id)}
          >
            {v.label}
            <span className="bodega-vista__n">{conteoPorVista[v.id]}</span>
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
            // Uva y año en una línea, bodega en otra.
            //
            // Las tres cosas en un solo renglón daban textos de 45 caracteres que
            // no entran en el ancho de un teléfono ni en dos líneas —"Cabernet
            // Sauvignon · 2017 · Bodegas Sale…"— y volvía el corte que había que
            // sacar. Partido así, cada línea entra sola y no depende del largo de
            // la otra: son dos datos distintos y se leen mejor separados.
            const uvaYAño = [wine.varietal, wine.vintage].filter(Boolean).join(" · ");
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
                {/* La cabecera tiene DOS controles hermanos: el cuerpo, que
                    expande, y el chip de probado, que cambia el dato ahí mismo.
                    Antes era un solo botón que envolvía todo, así que la marca de
                    "probado" sólo se podía MIRAR: para cambiarla había que
                    expandir la fila o entrar a la ficha, tres toques para un dato
                    que es de una palabra. Un botón adentro de otro botón no es
                    HTML válido, y por eso son hermanos y no anidados. */}
                <div className="wine-row__head">
                  <button
                    type="button"
                    className="wine-row__main"
                    onClick={() => setExpandedId(expanded ? null : wine._id)}
                    aria-expanded={expanded}
                  >
                    <span className="wine-row__thumb">
                      <WinePhoto src={wine.image} type={wine.type} alt="" artSize={46} />
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
                      {uvaYAño && <span className="wine-row__sub">{uvaYAño}</span>}
                      {wine.winery && <span className="wine-row__winery">{wine.winery}</span>}
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
                      {wine.rating > 0 && (
                        <span className="wine-row__rating" aria-label={`${wine.rating} de 5`}>
                          <Icon name="star" filled size={11} /> {wine.rating.toFixed(1)}
                        </span>
                      )}
                      <Icon name="chevron-down" size={18} className="wine-row__caret" />
                    </span>
                  </button>

                  {/* Probado o por probar, siempre explícito y siempre editable:
                      la ausencia de marca no se lee como "pendiente", se lee como
                      nada. */}
                  <button
                    type="button"
                    className={`wine-row__tasted ${wine.tasted ? "is-tasted" : ""}`}
                    onClick={() => handleToggleTasted(wine)}
                    disabled={isPending}
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
                </div>

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
