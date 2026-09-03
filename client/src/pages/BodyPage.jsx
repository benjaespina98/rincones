import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ConfirmModal from "../components/ConfirmModal";
import OpenBottleSheet from "../components/OpenBottleSheet";
import Icon from "../components/Icon";
import WinePhoto from "../components/WinePhoto";
import StarRating from "../components/StarRating";
import BodegaFilters from "../components/BodegaFilters";
import Segmented from "../components/Segmented";
import LoadingSkeleton from "../components/LoadingSkeleton";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import WishlistPanel from "../components/WishlistPanel";
import { useToast } from "../context/ToastContext";
import { useWineCollection } from "../hooks/useWineCollection";
import { useWishlist } from "../hooks/useWishlist";
import { normalizeSearchText } from "../utils/text";
import { tiempoEnCava, enCavaDesde, stockLabel, nuncaEstuvoEnTuCava } from "../utils/cellarTime";
import { WINE_TYPE_LABELS } from "../data/wineReference";
import { getCellarStatus } from "../utils/cellarStatus";
import { normalizarVista, pasaVista, VISTA_DESEOS } from "../utils/cellarViews";
import { wineDisplayName } from "../utils/wineIdentity";
import { trackEvent } from "../services/analyticsApi";
import { tapHaptic } from "../utils/haptics";
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

// Los filtros sobreviven a la sesión, igual que lista/grilla. Una sola clave con
// todo adentro: son una configuración, no ocho preferencias sueltas.
const FILTROS_KEY = "rincones_bodega_filtros";

const leerFiltrosGuardados = () => {
  try {
    const raw = localStorage.getItem(FILTROS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    // Cualquier cosa que no sea un objeto (una versión vieja, algo tocado a
    // mano) se ignora en silencio: no vale romper la bodega por un filtro.
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

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
    openBottle,
    undoOpenBottle,
    bulkAction,
    recargar,
  } = useWineCollection();

  /**
   * La lista de "Quiero probar" (los vinos que NO tenés).
   *
   * Se carga junto con la bodega y no recién al abrir su vista, por el
   * segmentado: el número que va adentro del botón dice de antemano qué vas a
   * encontrar del otro lado, y eso es lo que evita el viaje de tocar para
   * averiguar si hay algo. El costo real es cero después de la primera vez —el
   * hook cachea en el módulo, igual que la colección (ver useWishlist).
   */
  const wishlist = useWishlist();

  // El filtro inicial puede venir por prop o por query. `?vista=` es el nombre
  // nuevo (a donde redirige la ruta vieja /guardados) y `?filter=` el que ya
  // usaba /favoritos; se aceptan los dos para no romper enlaces guardados.
  const initialFromQuery =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("vista") ||
        new URLSearchParams(window.location.search).get("filter")
      : null;
  const inicial = initialFromQuery || initialFilter;

  /**
   * Qué parte de la colección estás mirando. Arranca en "en stock" porque la
   * pregunta con la que uno abre la bodega es "¿qué tengo para tomar?", no
   * "¿qué tuve alguna vez?".
   */
  /**
   * Los filtros guardados de la última visita.
   *
   * Se lee UNA vez, al montar. Quien filtró por Malbec de Valle de Uco espera
   * encontrarlo así al volver: rehacer la misma selección en cada entrada es
   * pedirle al usuario que repita una decisión que ya tomó.
   *
   * Lo que NO se guarda: la búsqueda escrita (es del momento, no una
   * preferencia) y la vista, que la decide de dónde entraste.
   *
   * Una navegación explícita gana siempre: si venís de "Favoritos" o de un tipo
   * desde otra pantalla, manda eso y no lo guardado.
   */
  const [guardados] = useState(leerFiltrosGuardados);

  // "Favoritos" no es una vista propia (VISTAS sólo tiene instock/all/probados),
  // así que `normalizarVista("favorites")` da null y el default de acá abajo
  // ganaba: "instock". Eso escondía a cualquier favorito sin botellas —lo
  // marcaste, pero como no tenés stock, la vista "En stock" ni lo mira—. Entrar
  // a Favoritos tiene que mostrar TODOS los favoritos, tengas botellas o no.
  const [vista, setVista] = useState(() =>
    inicial === "favorites" ? "all" : normalizarVista(inicial) || "instock"
  );
  /**
   * "Quiero probar" no sale de la colección: sale de otra lista y se dibuja con
   * otra fila. Todo lo que hay debajo —facetas, orden, selección múltiple,
   * agrupación— habla de vinos que tenés, así que en esta vista no aplica y no
   * se muestra. Un control que no puede cambiar nada es peor que uno ausente:
   * promete una decisión y no la cumple.
   */
  const enDeseos = vista === VISTA_DESEOS;
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState(() => guardados.sortBy || "recent");
  // Filtros que se COMBINAN entre sí y con la vista.
  const [soloFavoritos, setSoloFavoritos] = useState(
    inicial === "favorites" || Boolean(guardados.soloFavoritos)
  );
  const [soloListos, setSoloListos] = useState(Boolean(guardados.soloListos));
  // null = no filtra por probado; true = sólo probados; false = sólo pendientes.
  const [probado, setProbado] = useState(
    guardados.probado === true || guardados.probado === false ? guardados.probado : null
  );
  const [tipoFilter, setTipoFilter] = useState(
    TIPOS.includes(inicial) ? inicial : guardados.tipoFilter || "all"
  );
  const [varietalFilter, setVarietalFilter] = useState(guardados.varietalFilter || "all");
  const [regionFilter, setRegionFilter] = useState(guardados.regionFilter || "all");
  const [vintageFilter, setVintageFilter] = useState(guardados.vintageFilter || "all");
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
  // El vino cuya hoja de "abrí una botella" está abierta, o null.
  const [abriendo, setAbriendo] = useState(null);
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

  // Se guardan en cada cambio: no hay un "aplicar" que sirva de momento único.
  useEffect(() => {
    try {
      localStorage.setItem(
        FILTROS_KEY,
        JSON.stringify({
          sortBy,
          soloFavoritos,
          soloListos,
          probado,
          tipoFilter,
          varietalFilter,
          regionFilter,
          vintageFilter,
        })
      );
    } catch {
      // Igual que arriba: si no se puede guardar, sólo no se recuerda.
    }
  }, [
    sortBy,
    soloFavoritos,
    soloListos,
    probado,
    tipoFilter,
    varietalFilter,
    regionFilter,
    vintageFilter,
  ]);
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

  /**
   * ── EL PRIMER RENDER YA DECIDIÓ LA VISTA; ESTE EFECTO NO PUEDE PISARLA ────
   *
   * Este efecto existe para un caso puntual: que la prop `initialFilter` cambie
   * con la pantalla ya montada. Pero también corría al montar, y ahí hacía
   * daño, porque la prop tiene un valor por defecto ("instock") que gana contra
   * lo que hubiera decidido el estado inicial.
   *
   * Se vio al mudar Guardados adentro de Mi Bodega: /guardados redirige a
   * /bodega?vista=quiero-probar, el estado inicial leía bien el parámetro… y un
   * frame después este efecto lo devolvía a "En stock". El enlace viejo
   * aterrizaba en la pantalla correcta y en la vista equivocada, que es peor
   * que no redirigir. Con `?filter=favorites` pasaba lo mismo desde antes.
   *
   * La corrección: el efecto sólo actúa si la prop CAMBIÓ de valor. Al montar
   * manda `useState`, que ya mira la prop Y la query; después manda la prop,
   * que es lo único que puede cambiar sin remontar.
   *
   * Se guarda el valor anterior y no un "ya monté", que fue el primer intento y
   * no alcanza: en desarrollo, StrictMode monta, desmonta y vuelve a montar
   * cada efecto a propósito, así que la segunda corrida encontraba la bandera
   * ya encendida y pisaba la vista igual. El síntoma era desconcertante —andaba
   * en producción y no en desarrollo—; comparar valores no depende de cuántas
   * veces corra.
   */
  const filtroPrevio = useRef(initialFilter);
  useEffect(() => {
    if (filtroPrevio.current === initialFilter) return;
    filtroPrevio.current = initialFilter;
    if (initialFilter === "favorites") {
      setVista("all");
      return;
    }
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
    // Una fila desplegada en la vitrina no tiene ni sentido ni forma de
    // cerrarse si la vista cambia y esa misma fila pasa a dibujarse como
    // archivo (una sola línea, sin el chevron que abre y cierra el panel).
    setExpandedId(null);
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
   * Las cosechas que tenés, de la más nueva a la más vieja.
   *
   * Faltaba, y es de las tres cosas por las que uno busca una botella (uva,
   * región, año). Se podía escribir "2019" en el buscador —el año entró al
   * haystack— pero eso no es lo mismo: escribir no te dice QUÉ años tenés, y
   * acá la lista es la respuesta a esa pregunta antes de filtrar nada.
   */
  const vintageOptions = useMemo(
    () =>
      [...new Set(wines.map((wine) => wine.vintage).filter(Boolean))]
        .sort((a, b) => b - a)
        .map(String),
    [wines]
  );

  /**
   * Un filtro guardado que ya no existe se descarta solo.
   *
   * Si la última vez filtraste por "Tannat" y desde entonces te tomaste el único
   * que tenías, al volver la bodega aparecería vacía por un filtro imposible —y
   * el combo ni lo mostraría, porque esa uva ya no está entre las opciones—. Se
   * espera a que haya vinos cargados: con la lista vacía, todo filtro parecería
   * inválido y se limpiarían todos al entrar.
   */
  useEffect(() => {
    if (wines.length === 0) return;
    if (varietalFilter !== "all" && !varietalOptions.includes(varietalFilter)) setVarietalFilter("all");
    if (regionFilter !== "all" && !regionOptions.includes(regionFilter)) setRegionFilter("all");
    if (vintageFilter !== "all" && !vintageOptions.includes(vintageFilter)) setVintageFilter("all");
  }, [
    wines.length,
    varietalOptions,
    regionOptions,
    vintageOptions,
    varietalFilter,
    regionFilter,
    vintageFilter,
  ]);

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
        // Y estos tres tampoco estaban. Son las otras tres maneras en que uno se
        // acuerda de una botella cuando no le viene el nombre: dónde la guardó
        // ("heladera"), dónde la compró ("carrefour") y en qué estante la dejó.
        wine.cellar?.location,
        wine.purchase?.store,
      ]
        .map(normalizeSearchText)
        .join(" ");

      if (!terms.every((term) => haystack.includes(term))) return false;
      if (tipoFilter !== "all" && wine.type !== tipoFilter) return false;
      if (varietalFilter !== "all" && wine.varietal !== varietalFilter) return false;
      if (regionFilter !== "all" && wine.region !== regionFilter) return false;
      // El año se compara como texto porque la opción viene del combo, que
      // maneja strings; el vino lo guarda como número.
      if (vintageFilter !== "all" && String(wine.vintage || "") !== vintageFilter) return false;
      return true;
    },
    [terms, tipoFilter, varietalFilter, regionFilter, vintageFilter]
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

  /**
   * ── BUSCAR MIRA TODA TU BODEGA, NO LA PESTAÑA QUE TENÉS ABIERTA ──────────
   *
   * Reportado desde la app: cargás un Piatelli, escribís "piatelli" y la
   * búsqueda no lo trae. El vino estaba y el texto coincidía; lo que pasaba es
   * que la pestaña abierta era "En stock" y ese vino no tenía botellas. La
   * búsqueda quedaba encerrada adentro de la vista, así que buscar un vino
   * exigía adivinar antes en qué pestaña estaba — que es exactamente lo que uno
   * viene a averiguar.
   *
   * La regla nueva: si estás buscando y en esta vista no hay nada, pero en tu
   * bodega sí, se muestran ésos y se dice que se amplió (ver el aviso arriba de
   * la lista). Nunca en silencio: cambiar lo que muestra una pantalla sin
   * avisar es la otra forma de que la lista mienta.
   *
   * Los filtros no se amplían: un filtro puesto es una decisión explícita y
   * visible —tiene su ficha con la × al lado— y pasarlo por alto sería
   * desobedecer. La vista, en cambio, casi siempre es la que quedó de antes.
   */
  const resultados = useMemo(() => {
    const conFiltros = wines.filter((w) => pasaFiltros(w) && pasaBusqueda(w));
    const enVista = conFiltros.filter(enLaVista);
    if (terms.length > 0 && enVista.length === 0 && conFiltros.length > 0) {
      return { lista: conFiltros, ampliada: true };
    }
    return { lista: enVista, ampliada: false };
  }, [wines, enLaVista, pasaFiltros, pasaBusqueda, terms]);

  const filteredWines = resultados.lista;

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
      // Más cara primero, como "Mejor puntuados" pone la nota más alta primero.
      // Sin precio cargado queda al final: no es una botella barata, es un dato
      // que falta, y las dos cosas no pueden verse igual en la lista.
      if (sortBy === "price") return (b.purchase?.price || 0) - (a.purchase?.price || 0);
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
    vintageFilter,
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
    // "2019" solo no se entiende entre las demás fichas (¿precio? ¿cantidad?).
    if (vintageFilter !== "all") {
      fichas.push({ id: "cosecha", label: `Cosecha ${vintageFilter}`, quitar: () => setVintageFilter("all") });
    }
    return fichas;
  }, [soloFavoritos, probado, soloListos, tipoFilter, varietalFilter, regionFilter, vintageFilter]);

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
        title: "Todavía no abriste ninguna botella",
        hint: "Los vinos que tomes van a aparecer acá.",
        actionLabel: "Ver lo que tenés",
        onAction: () => setVista("instock"),
      };
    }
    if (vista === "instock") {
      return {
        icon: "bottle",
        title: "No te queda ninguna botella",
        // Lo que tomaste no se perdió: está en Probados. Decirlo acá es lo que
        // evita pensar que la app borró algo, y ahora además se puede ir de un
        // toque en vez de tener que descubrir la pestaña.
        hint: "Los vinos que tomaste siguen en Probados.",
        actionLabel: "Escanear una etiqueta",
        onAction: () => navigate("/agregar"),
        secondaryLabel: conteoPorVista.probados > 0 ? "Ver los que probaste" : "",
        onSecondary: () => setVista("probados"),
      };
    }
    // La bodega vacía de verdad —cero vinos— tiene su propio estado más abajo,
    // con la bienvenida que corresponde. Acá se llega con vinos cargados y una
    // vista que igual no muestra ninguno.
    return {
      icon: "bottle",
      title: "Nada para mostrar en esta vista",
      hint: "Probá con otra parte de tu colección.",
      actionLabel: "Ver toda mi bodega",
      onAction: () => setVista("all"),
    };
  }, [searchTerm, filtrosActivos, vista, navigate, conteoPorVista.probados]);

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
    setVintageFilter("all");
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
   * Abrir botellas: descuenta las que elijas y deja el vino como probado.
   *
   * Es la acción de la fila porque es lo que uno hace de verdad con un vino que
   * tiene en casa. "Probado" es un hecho aparte del stock y por eso conviven sin
   * pisarse: podés haberlo tomado y que igual te queden dos botellas, y podés
   * reponerlo sin dejar de haberlo tomado.
   *
   * La cantidad y las tres consecuencias se eligen y se leen antes, en
   * `OpenBottleSheet`. Acá queda lo que pasa DESPUÉS, que son las dos salidas
   * que la acción tiene que ofrecer:
   *
   *   Deshacer      — cuesta botellas de tu cava y se dispara con un toque.
   *   Contá el momento — abrir una botella es el único instante en que hay algo
   *                   para contar, y hasta ahora el recorrido moría en un aviso.
   *                   El diario es el diferencial del producto y su puerta de
   *                   entrada estaba en otra pantalla, más abajo, sin conexión
   *                   con el momento en que uno acaba de servir la copa.
   */
  const handleOpenBottle = (wine, cantidad = 1) => {
    if (Number(wine.quantity) <= 0) return;
    const eraProbado = wine.tasted === true;
    const n = Math.max(1, Math.min(Number(wine.quantity), cantidad));
    const quedan = Math.max(0, Number(wine.quantity) - n);

    withPendingAction(wine._id, async () => {
      await openBottle(wine._id, n);
      // Abrir una botella es el uso real de la bodega: es lo que distingue una
      // colección que se vive de una lista que se cargó una vez y quedó ahí.
      trackEvent("bottle_opened", { emptied: quedan === 0, cantidad: n });

      const abiertas = n === 1 ? "Botella abierta" : `${n} botellas abiertas`;
      const mensaje =
        quedan === 0
          ? `Se terminó tu ${wineDisplayName(wine)}`
          : `${abiertas} · te ${quedan === 1 ? "queda 1" : `quedan ${quedan}`}`;

      const toastId = addToast(mensaje, "success", 9000, {
        label: "Contá el momento",
        onClick: () => {
          removeToast(toastId);
          // A la ficha, con el formulario de momentos ya abierto: el momento
          // pertenece al vino y ahí es donde vive su historia.
          navigate(`/vino/${wine._id}`, { state: { abrirMomento: true, wine } });
        },
        secondary: {
          label: "Deshacer",
          onClick: async () => {
            removeToast(toastId);
            try {
              await undoOpenBottle(wine._id, eraProbado, n);
              showSuccess(n === 1 ? "Botella devuelta a tu bodega" : `${n} botellas devueltas`);
            } catch {
              showError("No se pudo deshacer");
            }
          },
        },
      });
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
      {/* La barra y el segmentado aparecen si hay ALGO que mirar, en cualquiera
          de las cuatro vistas. Antes la condición miraba sólo la colección, y
          desde que "Quiero probar" vive acá eso dejaba encerrado a quien
          todavía no cargó vinos pero sí guardó alguno: sin segmentado no había
          forma de llegar a su lista ni de volver. */}
      {(loading || wines.length > 0 || wishlist.wishes.length > 0) && (
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

        {/* ── LISTA / GRILLA, A LA VISTA ─────────────────────────────────────
            Vivía al fondo del panel de filtros, y no es un filtro: no recorta
            nada. Es cómo querés mirar tu colección —las etiquetas o los
            nombres— y se cambia mucho más seguido que cualquier faceta. Ahí
            adentro costaba cuatro toques y el estado actual no se veía sin
            abrir el panel.

            Un solo botón que alterna, no dos: son dos modos y el ícono muestra
            a cuál vas a ir, igual que el botón de silencio de cualquier
            reproductor. Dos chips ocuparían el ancho que necesita el buscador. */}
        {/* Los dos controles hablan de la colección: cómo mirarla y cómo
            recortarla. En "Quiero probar" no hay colección que mirar ni facetas
            que aplicar (una lista de deseos no tiene stock, ni guarda, ni
            cosecha propia), así que se van en vez de quedarse sin poder hacer
            nada. El buscador se queda: buscar sí funciona en las cuatro. */}
        {!enDeseos && (
          <>
            <button
              type="button"
              className="bodega-modo"
              onClick={() => {
                tapHaptic();
                setViewMode((m) => (m === "grid" ? "list" : "grid"));
              }}
              aria-label={viewMode === "grid" ? "Ver como lista" : "Ver como grilla"}
              title={viewMode === "grid" ? "Ver como lista" : "Ver como grilla"}
            >
              <Icon name={viewMode === "grid" ? "list" : "grid"} size={17} />
            </button>

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
          </>
        )}
      </div>

      {/* La vista, con su número adentro. Los tres números que antes vivían en
          tres bloques distintos (la tira de la colección, la línea de conteo y
          estos botones) son uno solo, y acá dice de antemano qué vas a encontrar
          del otro lado sin tener que tocar para averiguarlo. */}
      <Segmented
        className="bodega-vista"
        ariaLabel="Qué parte de tu bodega ver"
        value={vista}
        onChange={setVista}
        options={[
          { id: "instock", label: "En stock", title: "Los que tenés en casa ahora", count: conteoPorVista.instock },
          { id: "all", label: "Todos", title: "Toda tu colección", count: conteoPorVista.all },
          { id: "probados", label: "Probados", title: "Los que tomaste alguna vez, tengas o no", count: conteoPorVista.probados },
          // La cuarta: los que todavía no tenés. Era una pestaña de la barra de
          // navegación ("Guardados") y es la misma pregunta que las otras tres
          // —qué vinos hay en mi vida— mirada desde el otro lado del tiempo.
          {
            id: VISTA_DESEOS,
            label: "Quiero probar",
            title: "Los que anotaste para conseguir",
            count: wishlist.wishes.length,
          },
        ]}
      />

      {/* Las fichas de lo que está filtrando. Cada una es el botón para sacarla. */}
      {!enDeseos && filtrosActivos.length > 0 && (
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
      {!enDeseos && !loading && !error && !modoSeleccion && sortedWines.length >= 3 && (
        <div className="bodega-seleccion-entrada">
          <button type="button" className="bodega-seleccionar" onClick={() => setModoSeleccion(true)}>
            <Icon name="check" size={14} /> Seleccionar
          </button>
        </div>
      )}




        </>
      )}

      {/* ── EL CUERPO: LA COLECCIÓN, O LA LISTA DE DESEOS ────────────────────
          Tres de las cuatro vistas dibujan la misma fila con distinto recorte;
          la cuarta dibuja otra cosa, porque un vino que no tenés no ofrece
          abrir una botella sino decir "ya lo tengo". Lo que las cuatro
          comparten —el encabezado, el buscador, el segmentado— está arriba y
          se escribe una sola vez, que es el punto de haberlas unido. */}
      {enDeseos ? (
        <WishlistPanel
          {...wishlist}
          terms={terms}
          onLimpiarBusqueda={() => setSearchTerm("")}
          onVerBodega={() => setVista("instock")}
        />
      ) : (
      <>
      {loading && <LoadingSkeleton type="card" count={4} />}

      {!loading && error && (
        <ErrorState
          title="No se pudo cargar tu bodega"
          hint="Tus vinos están guardados. Revisá tu conexión y probá de nuevo."
          onRetry={recargar}
        />
      )}

      {/* Se amplió la búsqueda a toda la bodega: se dice, y se ofrece quedarse
          del otro lado. Sin este renglón, la lista mostraría vinos sin stock
          bajo la pestaña "En stock" y parecería un error de la app. */}
      {!loading && !error && resultados.ampliada && (
        <p className="wines-widened">
          <Icon name="search" size={14} />
          <span>
            En <strong>{vista === "instock" ? "En stock" : "Probados"}</strong> no hay
            ninguno. Esto es lo que encontramos en toda tu bodega.
          </span>
          <button type="button" onClick={() => setVista("all")}>
            Ver en Todos
          </button>
        </p>
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
            //
            // Se agrega `quantity > 0` y no sólo la pestaña: cuando la búsqueda
            // se amplía a toda la bodega (ver `resultados.ampliada` más arriba),
            // la lista que se dibuja bajo "En stock" puede traer vinos SIN
            // stock —es justo lo que la ampliación existe para mostrar—, y sin
            // este chequeo esas filas se dibujaban en modo vitrina: foto grande
            // y una cantidad "×0" que no tiene sentido ahí. En la pestaña
            // "En stock" normal esto no cambia nada, porque ahí todo lo que
            // llega ya tiene stock por construcción (`pasaVista`).
            const esVitrina = vista === "instock" && Number(wine.quantity) > 0;
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
              /* La cosecha se va del subtítulo SÓLO en la vitrina, porque ahí
                 abajo está la grilla de datos y la dice con su rótulo. En el
                 archivo se queda: esa fila no se despliega, así que si la
                 sacáramos el año no estaría en ninguna parte.

                 Es la mitad de "unificar la información": el encabezado se
                 queda con lo que sirve para RECONOCER la botella de un vistazo
                 (tipo y uva) y la ficha técnica completa vive en un solo lugar,
                 en vez de repartida entre un subtítulo y unos bloques sueltos. */
              esVitrina || yaLoDice(wine.vintage) ? "" : wine.vintage,
            ]
              .filter(Boolean)
              .join(" · ");
            const bodega = yaLoDice(wine.winery) ? "" : wine.winery;
            // Un vino que tomaste afuera nunca estuvo en tu cava: el "hace X"
            // saldría de la fecha en que lo anotaste y hablaría de una botella
            // que no existió. Ver `nuncaEstuvoEnTuCava`.
            const nuncaFueTuyo = nuncaEstuvoEnTuCava(wine);
            const enCava = nuncaFueTuyo ? "" : tiempoEnCava(enCavaDesde(wine), { corto: true });
            /**
             * ¿Este está en su punto?
             *
             * El dato ya se calculaba en esta pantalla —lo usa el filtro "Listos
             * para abrir"— pero no se veía en ninguna fila: había que activar el
             * filtro para enterarte de cuáles eran, o sea preguntar antes de
             * saber que había algo para preguntar. En la vitrina es la respuesta
             * a "¿cuál abro hoy?", que es para lo que uno mira esa vista.
             *
             * Sólo en "En stock" y sólo cuando es que sí: un "todavía no" en cada
             * fila sería una columna de advertencias sobre botellas que están
             * perfectamente bien guardadas.
             */
            const enSuPunto = esVitrina && getCellarStatus(wine).status === "peak";
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
                /* `wine-row--vitrina` marca la fila que SE DESPLIEGA: lista (no
                   grilla) y con botellas. Es la única que tiene chevron, panel
                   y por lo tanto la única que reacomoda su cabecera en dos
                   renglones. Sin esta clase, el layout nuevo caería también
                   sobre las filas del archivo, que son una sola línea de 38px y
                   costaron dos tandas de trabajo dejar así. */
                className={`wine-row ${esVitrina && !esGrilla ? "wine-row--vitrina" : ""} ${
                  expanded ? "is-expanded" : ""
                } ${isPending ? "is-pending" : ""} ${
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
                  {/* Tocar la fila SIEMPRE abre la ficha, en lista y en grilla
                      por igual — es lo que espera cualquiera que use una app
                      hoy, y obligar a un segundo toque en "Ver ficha
                      completa" (adentro del desplegable) no lo era. Las
                      acciones rápidas de la lista (abrir botella, favorito,
                      eliminar, los datos que no entran en la cabecera) siguen
                      ahí, pero detrás de su propio control — el chevron de
                      abajo — y no escondidas atrás del gesto más obvio de
                      todos. */}
                  <button
                    type="button"
                    className="wine-row__main"
                    onClick={() => {
                      if (modoSeleccion) return alternarSeleccion(wine._id);
                      // El vino viaja con la navegación: la ficha lo tiene
                      // entero en memoria y puede pintar en el primer frame en
                      // vez de tapar la pantalla con un esqueleto para volver a
                      // pedir lo que esta lista ya bajó (ver WineDetailPage).
                      return navigate(`/vino/${wine._id}`, { state: { wine } });
                    }}
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
                          /* El dibujo de respaldo (WineArtwork) se pide en un
                             alto FIJO en píxeles, y el marco que lo contiene
                             mide distinto según el modo: 130px en grilla,
                             90px en la vitrina de lista, 38px en el archivo.
                             Antes era un solo valor (104) para los tres, así
                             que en dos de ellos no coincidía con su marco: en
                             lista sobraba de más (el marco es más chico que el
                             dibujo) y la botella se recortaba contra el borde
                             — el mismo recorte, más grave, en grilla antes de
                             que el fix de arriba le devolviera sus 130px de
                             alto real. Ahora cada modo pide el tamaño que su
                             propio marco puede mostrar entero, con aire. */
                          artSize={esGrilla ? 112 : esVitrina ? 76 : 30}
                          /* La vitrina y la grilla presentan la botella entera
                             (contain); el archivo en lista es una miniatura de
                             38px, donde lo que importa es el color y la
                             textura de la etiqueta, no la forma completa. */
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
                          {/* El punto de color ya distingue el tipo de lo que
                              sigue; falta el separador de texto que antes ponía
                              el borde de la pastilla. */}
                          {esVitrina && uvaYAño ? `· ${uvaYAño}` : uvaYAño}
                        </span>
                      )}
                      {bodega && <span className="wine-row__winery">{bodega}</span>}

                      {/* Dónde está la botella en tu casa. Debajo de la uva y no
                          al lado: "Rosado · Malbec · 2024 📍 Cava 1, Estante 3"
                          en un solo renglón se corta en un teléfono, y es un dato
                          que se mira sólo cuando ya decidiste el vino y vas a
                          buscarlo — no compite por la primera mirada. Sólo
                          aparece si lo cargaste: la mayoría de las filas no
                          tienen nada que mostrar acá. */}
                      {(wine.cellar?.location || wine.cellar?.shelf) && (
                        <span className="wine-row__location">
                          <Icon name="map-pin" size={11} />{" "}
                          {[wine.cellar?.location, wine.cellar?.shelf].filter(Boolean).join(" · ")}
                        </span>
                      )}

                      {/* ── DÓNDE VA "EN SU PUNTO" (probado en pantalla) ───────
                          Su propio renglón, debajo de la bodega. Las otras dos
                          posiciones se descartaron mirándolas en un teléfono:
                          adentro del renglón de la uva partía "Rosado · Rosé ·
                          2024" en dos líneas, y en la columna del stock le
                          robaba noventa píxeles de ancho al nombre, que pasaba a
                          cortarse. Acá tiene la fila entera para él y no empuja
                          nada. */}
                      {enSuPunto && (
                        <span className="wine-row__peak" title="Está dentro de su ventana de guarda">
                          <Icon name="sparkle" size={11} /> En su punto
                        </span>
                      )}

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
                        title={nuncaFueTuyo ? "Lo tomaste afuera" : stockLabel(wine.quantity)}
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
                      {/* Un chevron y no una flecha. Las dos "van a otro lado",
                          pero no significan lo mismo: la flecha llena es la de
                          los botones que avanzan ("Iniciar sesión →") y pesa
                          demasiado repetida al final de treinta filas. El
                          chevron fino es lo que usan iOS y Android para decir
                          "hay más adentro", y es el mismo que ahora cierra las
                          filas del perfil y las de Quiero probar. */}
                      <Icon name="chevron-right" size={16} className="wine-row__go" />
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
                    // El tooltip dice el ESTADO; que se pueda tocar lo dice que
                    // sea un botón. "Tocá para desmarcarlo" es la app narrando
                    // una interacción que el control ya ofrece.
                    title={wine.tasted ? "Probado" : "Sin probar"}
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

                  {/* ── EL CHEVRON, ABAJO Y CENTRADO ──────────────────────────
                      Abre las acciones rápidas sin salir de la lista (abrir
                      botella, favorito, eliminar, la ficha técnica).

                      Estaba en el medio de la cabecera, entre el nombre y el
                      chip de probado, y ahí no se anclaba a nada: con un título
                      corto quedaba pegado al texto y con uno largo aparecía
                      flotando en cualquier lado del renglón. Abajo, ocupando el
                      ancho completo, siempre está en el mismo lugar y encima
                      apunta a donde va a aparecer el panel — que es lo que un
                      chevron hacia abajo significa.

                      No reemplaza a la flecha de la derecha: ésa lleva a la
                      ficha del vino y esto despliega la fila. Son dos destinos
                      distintos y necesitan dos controles distintos; un solo
                      ícono para las dos cosas es la manera de que ninguna se
                      entienda.

                      Sólo en la vitrina en modo lista. En el archivo la fila es
                      una sola línea de 38px y sumar una franja más la partiría
                      en dos; en grilla no hay dónde desplegar sin descolocar a
                      las tarjetas vecinas, así que ahí estas acciones viven en
                      la ficha. Botón hermano del de arriba y no anidado: un
                      botón adentro de otro no es HTML válido. */}
                  {!esGrilla && esVitrina && (
                    <button
                      type="button"
                      className="wine-row__disclosure"
                      onClick={() => setExpandedId(expanded ? null : wine._id)}
                      disabled={modoSeleccion}
                      aria-expanded={expanded}
                      aria-label={
                        expanded
                          ? `Ocultar acciones rápidas de ${wineDisplayName(wine)}`
                          : `Más acciones de ${wineDisplayName(wine)}`
                      }
                      title={expanded ? "Ocultar acciones rápidas" : "Más acciones"}
                    >
                      <Icon name="chevron-down" size={18} className="wine-row__disclosure-icon" />
                    </button>
                  )}
                </div>

                {expanded && !esGrilla && esVitrina && (
                  <div className="wine-row__expand">
                    {/* ── EL RENGLÓN DE ESTADO, SIN EL STOCK ──────────────────
                        Decía "4 botellas · en tu cava hace 8 meses". La primera
                        mitad ya está escrita tres centímetros más arriba, en el
                        "×4" de la cabecera, y encima con MENOS palabras: repetir
                        el mismo número en dos formatos distintos dentro de la
                        misma tarjeta obliga a leer dos veces para confirmar que
                        dicen lo mismo.

                        Queda la antigüedad, que no está en ninguna otra parte, y
                        el caso del vino que nunca fue tuyo — ahí "Lo tomaste
                        afuera" no es redundante: es la única línea que explica
                        por qué esta fila no ofrece abrir una botella. */}
                    {(nuncaFueTuyo || enCava) && (
                      <p className="wine-row__state-line">
                        {nuncaFueTuyo && "Lo tomaste afuera"}
                        {nuncaFueTuyo && enCava && " · "}
                        {enCava && `En tu cava hace ${enCava}`}
                      </p>
                    )}

                    {/* ── LA FICHA TÉCNICA, EN UNA GRILLA ─────────────────────
                        Uva, cosecha, región, tipo y lo tuyo (dónde la guardás,
                        qué pagaste), en pares rótulo/valor de dos columnas.

                        Antes esto era una fila que envolvía, con sólo los datos
                        que la cabecera no hubiera dicho ya. La intención era
                        buena —no repetir— pero el resultado era una lista
                        distinta en cada vino: uno mostraba tres datos, el de al
                        lado uno solo y el tercero ninguno, así que el panel no
                        tenía forma propia y los valores parecían texto suelto
                        flotando entre el renglón gris y los botones. Sin una
                        estructura fija, "abrir una fila" no significaba nada
                        predecible.

                        La grilla lo arregla al revés: la ficha es SIEMPRE la
                        misma y por eso se puede aprender de memoria dónde mirar.
                        El precio a pagar es que uva y tipo pueden repetirse con
                        el subtítulo — y por eso el subtítulo de la vitrina
                        adelgazó (ver `uvaYAño`): arriba queda lo que sirve para
                        reconocer la botella, acá la ficha completa.

                        Los vacíos no se dibujan: un "REGIÓN —" es una fila que
                        hay que leer para descubrir que no dice nada. */}
                    {(() => {
                      const datos = [
                        ["Uva", wine.varietal],
                        ["Cosecha", wine.vintage],
                        ["Región", wine.region],
                        ["Tipo", WINE_TYPE_LABELS[wine.type]],
                        ["Guardado en", wine.cellar?.location],
                        [
                          "Pagaste",
                          wine.purchase?.price > 0
                            ? `$${Number(wine.purchase.price).toLocaleString("es-AR")}`
                            : "",
                        ],
                      ].filter(([, valor]) => valor);

                      if (datos.length === 0) return null;
                      return (
                        <dl className="wine-row__facts">
                          {datos.map(([rotulo, valor]) => (
                            <div key={rotulo} className="wine-row__fact">
                              <dt>{rotulo}</dt>
                              <dd>{valor}</dd>
                            </div>
                          ))}
                        </dl>
                      );
                    })()}

                    {/* ── UNA SOLA BOTONERA AL PIE ────────────────────────────
                        Eran DOS contenedores hermanos: uno con el botón
                        principal estirado a todo el ancho y otro, debajo, con el
                        corazón y el tacho empujados contra el borde derecho.
                        Dos filas para tres botones, sin ninguna línea de base
                        compartida — el principal terminaba a una altura y los
                        íconos flotaban a otra, cada uno de un tamaño distinto.

                        Ahora es una fila: el principal se lleva el espacio que
                        sobra (`flex: 1`) y los dos secundarios son cuadrados de
                        44px, que es el mínimo con el que un pulgar acierta.
                        Misma altura, mismo eje, un solo bloque de acciones. */}
                    <div className="wine-row__acciones">
                      {/* ── EL STOCK SE AJUSTA EN LA FICHA, Y SÓLO AHÍ ────────
                          Acá vivía un stepper igual al de la ficha del vino. Era
                          la misma acción dibujada dos veces, y la duplicación no
                          salía gratis: cada lugar necesitaba su propio rótulo y
                          su propia aclaración de que restar no es tomarse una,
                          así que la fila desplegada dedicaba tres renglones a
                          explicar un control que se usa de vez en cuando.

                          De los dos lugares se fue ÉSTE y no el de la ficha, que
                          es lo contrario de lo que uno diría. La razón es que en
                          vista GRILLA la tarjeta no se despliega: tocarla abre la
                          ficha (decisión deliberada — expandir una celda
                          descoloca a toda la cuadrícula). O sea que la fila
                          desplegada no existe en grilla, y dejar el stock sólo
                          acá habría dejado media app sin poder ajustarlo. La
                          ficha, en cambio, se alcanza desde las dos vistas.

                          Lo que se hace seguido —abrir una botella— se queda:
                          ésa es la acción de la lista. Corregir el inventario es
                          otra cosa y tiene su pantalla. */}

                      {/* Mientras haya botellas, la acción es abrir una: es lo
                          que se hace con un vino que tenés en casa, y de paso lo
                          deja marcado como probado. Abre la hoja en vez de
                          descontar de una: es donde se elige cuántas y donde se
                          leen las tres consecuencias.

                          Sin stock no hay nada que abrir, y ACÁ NO vuelve un
                          botón de "Marcar probado": ése ya está, siempre visible,
                          en el chip de la cabecera (`wine-row__tasted`) — es el
                          mismo caso que la valoración doble de la ficha del vino
                          (ver el comentario en WineDetailPage sobre "Tu
                          opinión"): dos controles para la misma pregunta, uno al
                          lado del otro apenas se despliega la fila. Sin stock,
                          esta fila de acciones se queda sólo con favorito y
                          eliminar. */}
                      {Number(wine.quantity) > 0 && (
                        <button
                          className="wine-action-btn wine-action-btn--open"
                          onClick={() => setAbriendo(wine)}
                          type="button"
                          disabled={isPending}
                        >
                          <Icon name="bottle" size={16} />
                          Abrí una botella
                        </button>
                      )}

                      {/* Sin "Ver ficha completa": tocar la cabecera de la fila
                          ya lleva ahí en un solo gesto, así que el link repetía,
                          un renglón más abajo, la acción que se acaba de usar
                          para llegar a este mismo panel. */}
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
          {/* Acá iba "O buscá por nombre, bodega o uva para ir directo": el
              buscador está arriba, con su lupa y su placeholder. */}
        </div>
      )}

      {/* La primera pantalla que ve alguien que se acaba de registrar. Dos
          puertas, porque no todo el mundo llega con la botella en la mano. */}
      {!loading && !error && wines.length === 0 && (
        <EmptyState
          icon="bottle"
          title="Todavía no cargaste ningún vino"
          hint="Escaneá la etiqueta y completamos los datos."
          actionLabel="Escanear una etiqueta"
          onAction={() => navigate("/agregar")}
          secondaryLabel="Explorar vinos"
          onSecondary={() => navigate("/")}
        />
      )}

      {/* El vacío dice POR QUÉ está vacío. "Sin resultados · probá limpiando los
          filtros" sobre una vista sin ningún filtro puesto manda a buscar un
          problema que no existe: lo que pasa es que todavía no tomaste ninguno, o
          que te quedaste sin botellas, y cada caso tiene su salida distinta. */}
      {!loading && !error && wines.length > 0 && sortedWines.length === 0 && (
        <EmptyState {...vacio} />
      )}
      </>
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
        vintageFilter={vintageFilter}
        setVintageFilter={setVintageFilter}
        vintageOptions={vintageOptions}
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
        // Ya no dice "con sus notas y momentos", porque no es cierto: los
        // momentos son tu diario y se conservan, con el nombre del vino guardado
        // adentro de cada uno. Lo que se va es el vino de la bodega.
        message="Se van de tu bodega. Los momentos que hayas escrito quedan en tu diario. Esto no se puede deshacer."
        confirmText={enLote ? "Eliminando…" : "Eliminar"}
        cancelText="Cancelar"
        isDangerous
        onConfirm={() => aplicarEnLote("delete")}
        onCancel={() => setConfirmarLote(false)}
      />

      <ConfirmModal
        isOpen={showDeleteConfirm !== null}
        title="¿Eliminar vino?"
        // Qué se va y qué se queda, en ese orden. La versión anterior sólo decía
        // lo primero, y la duda que dejaba —"¿pierdo lo que escribí?"— es
        // justamente la que frena a alguien en una acción que es reversible.
        message={`Se quita "${wines.find((wine) => wine._id === showDeleteConfirm)?.name || "este vino"}" de tu bodega. Los momentos que hayas escrito quedan en tu diario, y el vino sigue existiendo en el catálogo de Rincones. Podés deshacer por unos segundos.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        isDangerous
        onConfirm={() => handleDeleteWine(showDeleteConfirm)}
        onCancel={() => setShowDeleteConfirm(null)}
      />

      {abriendo && (
        <OpenBottleSheet
          wine={abriendo}
          saving={pendingActionId === abriendo._id}
          onCancel={() => setAbriendo(null)}
          onConfirm={(cantidad) => {
            const wine = abriendo;
            setAbriendo(null);
            handleOpenBottle(wine, cantidad);
          }}
        />
      )}
    </div>
  );
}
