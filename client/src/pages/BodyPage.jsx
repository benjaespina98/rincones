import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ConfirmModal from "../components/ConfirmModal";
import OpenBottleSheet from "../components/OpenBottleSheet";
import Icon from "../components/Icon";
import BodegaFilters from "../components/BodegaFilters";
import Segmented from "../components/Segmented";
import LoadingSkeleton from "../components/LoadingSkeleton";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import WishlistPanel from "../components/WishlistPanel";
import BodegaResumen from "../components/BodegaResumen";
import WineRow from "../components/WineRow";
import Chip from "../components/Chip";
import { useToast } from "../context/ToastContext";
import { useWineCollection } from "../hooks/useWineCollection";
import { useWishlist } from "../hooks/useWishlist";
// Buscar, filtrar y ordenar salieron de acá a un módulo propio: son funciones
// puras con reglas que nacieron de bugs reportados, y adentro de este archivo
// no se podían testear ni leer. Ver utils/bodegaFiltros.js.
import {
  terminosDe,
  pasaBusqueda as pasaBusquedaDe,
  pasaFiltros as pasaFiltrosDe,
  opcionesDe,
  ordenarVinos,
  resultadosDe,
} from "../utils/bodegaFiltros";
import { WINE_TYPE_LABELS } from "../data/wineReference";
import { normalizarVista, pasaVista, VISTA_DESEOS } from "../utils/cellarViews";
import { wineDisplayName } from "../utils/wineIdentity";
import { trackEvent } from "../services/analyticsApi";
import { tapHaptic } from "../utils/haptics";
import { conTransicion } from "../utils/viewTransition";
import "./BodyPage.css";

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

/** El nombre de cada vista, para decir "en Favoritos no hay ninguno" y no
 *  un id técnico. Vive acá y no en el segmentado de más abajo porque este
 *  uso es al revés: ahí se arma la lista de opciones, acá se busca UNA por
 *  su id. */
const VISTA_LABEL = { instock: "En stock", probados: "Probados", [VISTA_DESEOS]: "Favoritos" };

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

  // "favorites" (el viejo `?filter=`, de /favoritos) apuntaba a un filtro
  // aparte que ya no existe: ahora "Favoritos" ES una vista propia —la misma
  // VISTA_DESEOS que unificó el corazón de un vino tuyo con la wishlist—, así
  // que el enlace viejo aterriza ahí directo.
  const [vista, setVista] = useState(() =>
    inicial === "favorites" ? VISTA_DESEOS : normalizarVista(inicial) || "instock"
  );
  /**
   * "Favoritos" mezcla dos fuentes —tus vinos con el corazón puesto y tu
   * wishlist— así que el cuerpo de la pantalla dibuja las DOS listas, una
   * abajo de la otra: `sortedWines` ya trae la primera sola (`pasaVista` la
   * filtra, ver cellarViews.js) y acá se agrega la wishlist debajo. El resto
   * de los controles —buscar, ordenar, agrupar— siguen andando igual porque
   * la mitad que sale de la colección sigue siendo una vista más.
   */
  const enFavoritos = vista === VISTA_DESEOS;
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState(() => guardados.sortBy || "recent");
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
      // Mismo destino que el estado inicial de más arriba: "favorites" apunta
      // a la vista unificada de Favoritos, no a "Todos" (que ya no existe).
      setVista(VISTA_DESEOS);
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

  // Las tres listas de opciones salen de una sola pasada. Ver `opcionesDe`.
  const opciones = useMemo(() => opcionesDe(wines), [wines]);
  const varietalOptions = opciones.varietales;
  const regionOptions = opciones.regiones;
  const vintageOptions = opciones.cosechas;

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
  const terms = useMemo(() => terminosDe(searchTerm), [searchTerm]);

  /** Búsqueda y facetas (tipo, varietal, región, cosecha). Ver bodegaFiltros.js. */
  const pasaBusqueda = useCallback(
    (wine) =>
      pasaBusquedaDe(wine, terms, {
        tipo: tipoFilter,
        varietal: varietalFilter,
        region: regionFilter,
        vintage: vintageFilter,
      }),
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
    (wine) => pasaFiltrosDe(wine, { probado, soloListos }),
    [probado, soloListos]
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
  const resultados = useMemo(
    () =>
      resultadosDe(wines, {
        terms,
        enLaVista,
        pasa: (w) => pasaFiltros(w) && pasaBusqueda(w),
      }),
    [wines, enLaVista, pasaFiltros, pasaBusqueda, terms]
  );

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

  /**
   * El orden vive en bodegaFiltros.js: el stock manda sobre el orden elegido, y
   * el grupo sobre los dos. Las dos reglas y su porque estan alla, con tests.
   */
  const sortedWines = useMemo(
    () =>
      ordenarVinos(filteredWines, {
        sortBy,
        groupOf: effectiveGroupBy === "none" ? null : groupOf,
      }),
    [filteredWines, sortBy, effectiveGroupBy, groupOf]
  );

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
      probados: base.filter((w) => pasaVista("probados", w)).length,
      // La mitad de "Favoritos" que sale de la colección — la otra mitad
      // (la wishlist) se suma aparte, en el número del segmentado, porque
      // vive en otra colección y no pasa por `pasaFiltros`/`pasaBusqueda`.
      favoritos: base.filter((w) => pasaVista(VISTA_DESEOS, w)).length,
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
  }, [probado, soloListos, tipoFilter, varietalFilter, regionFilter, vintageFilter]);

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
        illustration: "busqueda",
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
        illustration: "copa",
        title: "Todavía no abriste ninguna botella",
        hint: "Los vinos que tomes van a aparecer acá.",
        actionLabel: "Ver lo que tenés",
        onAction: () => setVista("instock"),
      };
    }
    if (vista === "instock") {
      return {
        illustration: "cava",
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
    // Sólo queda "Favoritos": es la única de las tres vistas que no tiene su
    // propio caso arriba (antes había un cuarto, genérico, para "Todos" — ver
    // el comentario grande sobre por qué esa vista se sacó, en
    // cellarViews.js). "Nada para mostrar en esta vista" hubiera sido
    // engañoso acá igual: esta pantalla SIGUE mostrando algo debajo (la
    // wishlist, que tiene su propio vacío si también está vacía) — lo único
    // que no hay es un vino tuyo con el corazón puesto.
    return {
      illustration: "favoritos",
      title: "Ningún vino con el corazón puesto",
      hint: "Marcá un favorito desde Mi Bodega y aparece acá.",
      actionLabel: "Ver lo que tenés",
      onAction: () => setVista("instock"),
    };
  }, [searchTerm, filtrosActivos, vista, navigate, conteoPorVista.probados]);

  // ── Selección múltiple ─────────────────────────────────────────────────────

  // Las acciones de la fila van envueltas en useCallback porque WineRow está
  // memoizada: una función nueva en cada render la haría re-renderizar igual,
  // y la memoización dejaría de existir sin que nada avise.
  const alternarSeleccion = useCallback((id) => {
    setSeleccion((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  }, []);

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
    setSoloListos(false);
    setProbado(null);
    setTipoFilter("all");
    setVarietalFilter("all");
    setRegionFilter("all");
    setVintageFilter("all");
  };

  const withPendingAction = useCallback(async (id, action) => {
    setPendingActionId(id);
    try {
      await action();
    } catch {
      showError("No se pudo completar la acción. Probá de nuevo.");
    } finally {
      setPendingActionId(null);
    }
  }, [showError]);

  /**
   * Abrir la ficha del vino.
   *
   * El vino viaja con la navegación: la ficha lo tiene entero en memoria y
   * puede pintar en el primer frame, en vez de tapar la pantalla con un
   * esqueleto para volver a pedir lo que esta lista ya bajó (ver
   * WineDetailPage).
   */
  const abrirFicha = useCallback(
    (wine) => navigate(`/vino/${wine._id}`, { state: { wine } }),
    [navigate]
  );

  /**
   * Lista o grilla.
   *
   * Va adentro de una transición para que las tarjetas se REACOMODEN en vez de
   * parpadear: cada fila lleva su propio `view-transition-name` (ver WineRow),
   * así que el navegador reconoce la misma fila en las dos formas y la lleva de
   * donde estaba a donde queda. Es la animación de layout que el plan reservaba
   * para una librería si CSS no alcanzaba — no hizo falta ninguna.
   */
  const cambiarModo = useCallback(() => {
    tapHaptic();
    conTransicion(() => setViewMode((m) => (m === "grid" ? "list" : "grid")));
  }, []);

  const handleToggleFavorite = useCallback(
    (wine) =>
      withPendingAction(wine._id, async () => {
        await toggleFavorite(wine._id, !wine.favorite);
        showSuccess(wine.favorite ? "Eliminado de favoritos" : "Agregado a favoritos");
      }),
    [withPendingAction, toggleFavorite, showSuccess]
  );

  /**
   * Toggle puro: dice si ya lo tomaste alguna vez y no toca el stock. Sirve para
   * un vino que probaste en otro lado, o para corregir el dato.
   *
   * Desmarcarlo lleva deshacer porque, estando en la vista "Probados", la fila
   * desaparece en el mismo gesto: sin la salida en el aviso habría que cambiar de
   * vista y buscar el vino para arreglar un toque equivocado.
   */
  const handleToggleTasted = useCallback(
    (wine) =>
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
      }),
    [withPendingAction, updateWineTasted, showSuccess, showError, addToast, removeToast]
  );

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
          desde que "Favoritos" también vive de la wishlist eso dejaba
          encerrado a quien todavía no cargó vinos pero sí guardó alguno: sin
          segmentado no había forma de llegar a su lista ni de volver. */}
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
        {/* Grilla/lista y filtros siguen andando en "Favoritos": la mitad de
            esa vista sale de tu colección real (los que tenés con el corazón
            puesto) y esos vinos SÍ tienen stock, guarda y cosecha propia — la
            wishlist, que no, simplemente no los usa y sigue mostrándose
            debajo, sin romper nada. */}
        <button
          type="button"
          className="bodega-modo"
          onClick={cambiarModo}
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
      </div>

      {/* La vista, con su número adentro. Los tres números que antes vivían en
          tres bloques distintos (la tira de la colección, la línea de conteo y
          estos botones) son uno solo, y acá dice de antemano qué vas a encontrar
          del otro lado sin tener que tocar para averiguarlo.

          "Todos" se sacó de acá: mirando qué vino entraba EXCLUSIVAMENTE en esa
          vista (ni en stock, ni probado, ni favorito, ni en la wishlist), la
          respuesta era casi nada — y ese caso raro sigue siendo encontrable con
          el buscador, que ya amplía a toda la bodega solo (ver el comentario
          grande en cellarViews.js). Quedan tres pestañas, cada una contestando
          una pregunta concreta, en vez de una cuarta que no contestaba ninguna
          que las otras tres no contestaran ya. */}
      <Segmented
        className="bodega-vista"
        ariaLabel="Qué parte de tu bodega ver"
        value={vista}
        onChange={setVista}
        options={[
          { id: "instock", label: "En stock", title: "Los que tenés en casa ahora", count: conteoPorVista.instock },
          { id: "probados", label: "Probados", title: "Los que tomaste alguna vez, tengas o no", count: conteoPorVista.probados },
          // Lo que tenés marcado con el corazón, lo tengas o no. Era "Quiero
          // probar" y sólo miraba la wishlist — un vino que ya tenías y te
          // gustaba no entraba ahí, y "quiero probar" tampoco era cierto de
          // él (ya lo probaste). Unifica los dos "favorito" que tenía la app
          // en uno (ver el comentario grande de VISTA_DESEOS en
          // cellarViews.js).
          {
            id: VISTA_DESEOS,
            label: "Favoritos",
            title: "Lo que te gusta: lo tengas o lo estés buscando",
            count: conteoPorVista.favoritos + wishlist.wishes.length,
          },
        ]}
      />

      {/* Los números de lo que se está viendo. Va DESPUÉS del segmentado y
          ANTES de las fichas de filtro a propósito: describe el resultado de
          los dos, así que tiene que leerse como consecuencia de lo de arriba y
          no como un encabezado suelto de la pantalla. */}
      {!loading && !error && <BodegaResumen wines={filteredWines} />}

      {/* Las fichas de lo que está filtrando. Cada una es el botón para sacarla. */}
      {filtrosActivos.length > 0 && (
        <div className="bodega-fichas" role="group" aria-label="Filtros aplicados">
          {/* La ficha entera saca el filtro, y no sólo la ✕: acá la pastilla
              tiene UNA acción —quitar esto— y partirla en dos controles daría
              un blanco de 18px para lo único que se puede hacer. Por eso usa
              `onClick` y no `onRemove` (ver Chip.jsx, que separa los dos casos),
              con la ✕ adentro como señal de qué va a pasar y el aria-label
              diciéndolo con todas las letras. */}
          {filtrosActivos.map((f) => (
            <Chip
              key={f.id}
              active
              className="bodega-ficha"
              onClick={f.quitar}
              aria-label={`Quitar el filtro ${f.label}`}
            >
              {f.label}
              <Icon name="x" size={12} />
            </Chip>
          ))}
          {filtrosActivos.length > 1 && (
            <Chip className="bodega-ficha--clear" onClick={clearAllFilters}>
              Limpiar todo
            </Chip>
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

      {/* ── EL CUERPO: LA COLECCIÓN, Y —EN FAVORITOS— TAMBIÉN LA WISHLIST ────
          Las cuatro vistas dibujan ahora la misma fila con el mismo recorte:
          `pasaVista` ya decide qué entra en cada una (ver cellarViews.js), así
          que este bloque no necesita saber que "Favoritos" es distinta. Lo
          único propio de esa vista es lo que se agrega DESPUÉS: la wishlist,
          que sale de otra colección y se dibuja con otra fila —un vino que no
          tenés no ofrece abrir una botella, ofrece decir "ya lo tengo". */}
      {loading && <LoadingSkeleton type="card" count={4} />}

      {!loading && error && (
        <ErrorState
          title="No se pudo cargar tu bodega"
          hint="Tus vinos están guardados. Revisá tu conexión y probá de nuevo."
          onRetry={recargar}
        />
      )}

      {/* Se amplió la búsqueda a toda la bodega: se dice. Sin este renglón, la
          lista mostraría vinos sin stock bajo la pestaña "En stock" y
          parecería un error de la app. Ya no ofrece "Ver en Todos" —esa vista
          se sacó (ver el comentario grande en cellarViews.js)— porque no
          hace falta: lo que amplió la búsqueda ya está ahí, en la lista de
          abajo. El rótulo del medio cubre las tres vistas, no dos: antes se
          armaba con un ternario de dos ramas y "Favoritos" —que también
          puede ampliarse— quedaba diciendo "Probados" por descarte. */}
      {!loading && !error && resultados.ampliada && (
        <p className="wines-widened">
          <Icon name="search" size={14} />
          <span>
            En <strong>{VISTA_LABEL[vista] || vista}</strong> no hay ninguno. Esto es
            lo que encontramos en toda tu bodega.
          </span>
        </p>
      )}

      {/* Sólo en Favoritos, y sólo si además hay wishlist: sin la wishlist
          abajo, esta lista ya se explica sola (es exactamente lo que las
          otras tres vistas hacen sin rótulo). El rótulo existe para separar
          DOS listas cuando las dos están a la vista, no para anunciar una. */}
      {enFavoritos && sortedWines.length > 0 && wishlist.wishes.length > 0 && (
        <p className="bodega-rotulo">En tu bodega</p>
      )}

      {!loading && !error && sortedWines.length > 0 && (
        <div
          className={`wines-list wines-list--${viewMode} ${
            vista === "instock" ? "wines-list--protagonista" : "wines-list--archivo"
          } ${modoSeleccion ? "is-selecting" : ""}`}
        >
          {visibleWines.map((wine, i) => {
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
              <WineRow
                wine={wine}
                vista={vista}
                esGrilla={viewMode === "grid"}
                enFavoritos={enFavoritos}
                modoSeleccion={modoSeleccion}
                elegido={seleccion.has(wine._id)}
                expanded={expandedId === wine._id}
                isPending={pendingActionId === wine._id}
                onAbrirFicha={abrirFicha}
                onSeleccionar={alternarSeleccion}
                onToggleTasted={handleToggleTasted}
                onToggleFavorite={handleToggleFavorite}
                onExpandir={setExpandedId}
                onAbrirBotella={setAbriendo}
                onEliminar={setShowDeleteConfirm}
              />
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
          puertas, porque no todo el mundo llega con la botella en la mano.
          No en Favoritos: si no cargaste ningún vino pero SÍ guardaste algo
          en la wishlist (que se dibuja debajo), esta pantalla ya no está
          vacía de verdad — el vacío de la wishlist, si también está vacía,
          se explica solo ahí. */}
      {!loading && !error && wines.length === 0 && !enFavoritos && (
        <EmptyState
          illustration="cava"
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

      {/* ── LA WISHLIST, DEBAJO ────────────────────────────────────────────
          La otra mitad de "Favoritos": lo que todavía no tenés. Va después
          de tu colección real y no antes, porque lo que SÍ tenés es lo que
          podés abrir hoy — la misma jerarquía que ya usa el Sommelier entre
          "De tu bodega" y "Para descubrir" (ver SuggestionsPage.jsx).

          ── POR QUÉ NO SE DIBUJA SIEMPRE ──────────────────────────────────
          Antes esto entraba con sólo `enFavoritos`, así que su propio vacío
          ("Todavía no guardaste ningún vino") se dibujaba SIEMPRE que la
          wishlist estuviera vacía — aunque arriba ya hubiera un vino tuyo
          con el corazón puesto. Reportado así, con una cuenta real: la
          pestaña mostraba "Favoritos · 1" y la tarjeta del vino, y DEBAJO
          decía "Todavía no guardaste ningún vino", contradiciéndose sola en
          la misma pantalla.

          El panel sólo tiene algo que decir cuando: está cargando o falló
          (hay que avisar, tenga o no tenga nada más la pestaña), tiene
          vinos de verdad para listar, o es la ÚNICA explicación posible de
          por qué la pestaña entera está vacía —eso último sólo pasa cuando
          la persona no cargó ni un vino en su vida (`wines.length === 0`):
          ahí su vacío es el único cartel de toda la pantalla (ver el
          comentario de la puerta de entrada, unas líneas más arriba). En
          cualquier otro caso —ya se explicó el vacío arriba con `vacio`, o
          ya hay contenido real que mostrar— este panel no agrega nada y
          sale entero de en medio. */}
      {enFavoritos &&
        (wishlist.loading || wishlist.error || wishlist.wishes.length > 0 || wines.length === 0) && (
          <>
            {sortedWines.length > 0 && wishlist.wishes.length > 0 && (
              <p className="bodega-rotulo">Para conseguir</p>
            )}
            <WishlistPanel
              {...wishlist}
              terms={terms}
              onLimpiarBusqueda={() => setSearchTerm("")}
              onVerBodega={() => setVista("instock")}
            />
          </>
        )}

      <BodegaFilters
        abierto={advancedOpen}
        onClose={() => setAdvancedOpen(false)}
        resultados={sortedWines.length}
        sortBy={sortBy}
        setSortBy={setSortBy}
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
