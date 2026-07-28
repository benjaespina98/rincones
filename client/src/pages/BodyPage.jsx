import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
import { WINE_TYPE_LABELS } from "../data/wineReference";
import { getCellarStatus } from "../utils/cellarStatus";
import "../styles/pages/BodyPage.css";

const FILTER_VALUES = new Set([
  "all",
  "favorites",
  "tasted",
  "nottasted",
  "lowstock",
  "cellarready",
  "red",
  "white",
  "rosé",
  "sparkling",
  "fortified",
]);

const normalizeSearchText = (value = "") =>
  String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

export default function BodyPage({ initialFilter = "all" }) {
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
      : "all";
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

  const filteredWines = useMemo(
    () =>
      wines.filter((wine) => {
        // Cada palabra tiene que aparecer en ALGÚN campo, no la frase entera en
        // uno solo: así "rutini 2019" y "malbec uco" encuentran lo que
        // corresponde, cosa que antes fallaba porque se buscaba el texto
        // completo dentro de un único campo.
        const terms = normalizeSearchText(searchTerm).split(/\s+/).filter(Boolean);
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
        const matchesSearch = terms.every((term) => haystack.includes(term));

        if (!matchesSearch) return false;
        if (varietalFilter !== "all" && wine.varietal !== varietalFilter) return false;
        if (regionFilter !== "all" && wine.region !== regionFilter) return false;

        if (filterType === "all") return true;
        if (filterType === "tasted") return wine.tasted;
        if (filterType === "nottasted") return !wine.tasted;
        if (filterType === "favorites") return wine.favorite;
        if (filterType === "instock") return Number(wine.quantity) > 0;
        if (filterType === "cellarready") return Number(wine.quantity) > 0 && getCellarStatus(wine).status === "peak";
        return wine.type === filterType;
      }),
    [wines, searchTerm, filterType, varietalFilter, regionFilter]
  );

  /**
   * Encabezado del grupo al que pertenece un vino, según el orden activo.
   *
   * Con 30 vinos una lista plana se recorre; con 300 te perdés. Estos cortes
   * dan orientación mientras scrolleás —"voy por la C", "estos son los 2019"—
   * sin agregar una pantalla ni un control más: salen del orden que ya elegiste.
   * Devuelve null cuando agrupar no aportaría nada (orden por fecha de alta).
   */
  const groupOf = (wine) => {
    if (sortBy === "name") return (wine.name?.[0] || "#").toUpperCase();
    if (sortBy === "year") return wine.vintage ? String(wine.vintage) : "Sin cosecha";
    if (sortBy === "rating") {
      if (!wine.rating) return "Sin puntuar";
      return `${Math.floor(wine.rating)}★ y más`;
    }
    return null;
  };

  const sortedWines = useMemo(() => {
    return [...filteredWines].sort((a, b) => {
      if (sortBy === "rating") return (b.rating || 0) - (a.rating || 0);
      if (sortBy === "year") return (b.vintage || 0) - (a.vintage || 0);
      if (sortBy === "name") return a.name.localeCompare(b.name);
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  }, [filteredWines, sortBy]);

  // Rincones es una colección personal, no un inventario comercial: las
  // estadísticas describen lo que tenés, no disparan alertas de reposición.
  const stats = {
    total: wines.length,
    bottles: wines.reduce((n, w) => n + (Number(w.quantity) || 0), 0),
    inStock: wines.filter((w) => Number(w.quantity) > 0).length,
    favorites: wines.filter((wine) => wine.favorite).length,
    tasted: wines.filter((wine) => wine.tasted).length,
  };
  stats.pending = stats.total - stats.tasted;

  const activeFilterLabel =
    filterType === "all"
      ? "Todos"
      : filterType === "favorites"
        ? "Favoritos"
        : filterType === "tasted"
          ? "Probados"
          : filterType === "nottasted"
            ? "Pendientes"
            : filterType === "cellarready"
              ? "Listos para abrir"
              : filterType === "instock"
              ? "En stock"
              : WINE_TYPE_LABELS[filterType] || filterType;

  const activeCharacteristicFilters = [
    varietalFilter !== "all" ? varietalFilter : null,
    regionFilter !== "all" ? regionFilter : null,
  ].filter(Boolean);

  const hasActiveFilters = filterType !== "all" || activeCharacteristicFilters.length > 0;
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

  const handleToggleFavorite = (wine) =>
    withPendingAction(wine._id, async () => {
      await toggleFavorite(wine._id, !wine.favorite);
      showSuccess(wine.favorite ? "Eliminado de favoritos" : "Agregado a favoritos");
    });

  const handleToggleTasted = (wine) =>
    withPendingAction(wine._id, async () => {
      await updateWineTasted(wine._id, !wine.tasted);
      showSuccess(wine.tasted ? "Marcado como no probado" : "Vino marcado como probado");
    });

  const handleAdjustQuantity = (wine, delta) => {
    if (delta < 0 && Number(wine.quantity) <= 0) return;
    withPendingAction(wine._id, async () => {
      await adjustStock(wine._id, delta);
      if (delta > 0) showSuccess(`Stock actualizado: ${wine.name}`);
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
      showSuccess(`"${wineToRestore.name}" restaurado`);
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

    const toastId = addToast(`"${wineToDelete.name}" eliminado`, "warning", 8000, {
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
      <div className="stats-strip" role="group" aria-label="Resumen de tu colección">
        <div className="stat">
          <span className="stat-number">{stats.bottles}</span>
          <span className="stat-label">Botellas</span>
        </div>
        <div className="stat">
          <span className="stat-number">{stats.total}</span>
          <span className="stat-label">Etiquetas</span>
        </div>
        <div className="stat">
          <span className="stat-number">{stats.pending}</span>
          <span className="stat-label">Por probar</span>
        </div>
        <div className="stat">
          <span className="stat-number">{stats.tasted}</span>
          <span className="stat-label">Probados</span>
        </div>
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
            { id: "all", label: "Todos", count: stats.total },
            { id: "instock", label: "En stock", count: stats.inStock },
            { id: "tasted", label: "Probados", count: stats.tasted },
            { id: "nottasted", label: "Por probar", count: stats.pending },
            { id: "favorites", label: "Favoritos", count: stats.favorites },
            { id: "cellarready", label: "Listos para abrir", count: null },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              className={`bodega-chip ${filterType === f.id ? "is-active" : ""}`}
              aria-pressed={filterType === f.id}
              onClick={() => setFilterType(filterType === f.id ? "all" : f.id)}
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
        <span className="bodega-summary__count">
          {sortedWines.length === wines.length
            ? `${wines.length} ${wines.length === 1 ? "vino" : "vinos"}`
            : `${sortedWines.length} de ${wines.length}`}
        </span>
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

      {hasActiveFilters && (
        <p className="active-filter-note">
          Mostrando:{" "}
          <strong>
            {[
              filterType !== "all" ? activeFilterLabel : null,
              ...activeCharacteristicFilters,
            ]
              .filter(Boolean)
              .join(" · ")}
          </strong>
          <button type="button" className="active-filter-note__clear" onClick={clearAllFilters}>
            Quitar filtros
          </button>
        </p>
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
          {sortedWines.map((wine, i) => {
            const isPending = pendingActionId === wine._id;
            const expanded = expandedId === wine._id;
            const origin = [wine.winery, wine.region].filter(Boolean).join(" · ") || "Sin datos de origen";
            // Corte de grupo: sólo cuando cambia respecto del vino anterior.
            const group = groupOf(wine);
            const showGroup = group && (i === 0 || groupOf(sortedWines[i - 1]) !== group);
            return (
              <Fragment key={wine._id}>
              {showGroup && (
                <h3 className="wines-list__group" aria-hidden="true">{group}</h3>
              )}
              <article
                className={`wine-row ${expanded ? "is-expanded" : ""} ${isPending ? "is-pending" : ""}`}
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
                      <span className="wine-row__name">{wine.name}</span>
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
                    <span className={`wine-row__qty ${Number(wine.quantity) <= 0 ? "is-empty" : ""}`}>
                      {Number(wine.quantity) <= 0 ? "Sin stock" : `x${wine.quantity}`}
                    </span>
                    <Icon name="chevron-down" size={18} className="wine-row__caret" />
                  </span>
                </button>

                {expanded && (
                  <div className="wine-row__expand">
                    <div className="wine-row__controls">
                      <div className="wine-qty-controls" aria-label={`Stock de ${wine.name}`}>
                        <button type="button" className="qty-btn" onClick={() => handleAdjustQuantity(wine, -1)} disabled={isPending || Number(wine.quantity) <= 0} aria-label="Restar una unidad">
                          <Icon name="minus" size={15} />
                        </button>
                        <span className="wine-qty">x{wine.quantity}</span>
                        <button type="button" className="qty-btn" onClick={() => handleAdjustQuantity(wine, 1)} disabled={isPending} aria-label="Sumar una unidad">
                          <Icon name="plus" size={15} />
                        </button>
                      </div>

                      <button
                        className={`wine-action-btn ${wine.tasted ? "is-active" : ""}`}
                        onClick={() => handleToggleTasted(wine)}
                        type="button"
                        disabled={isPending}
                      >
                        <Icon name={wine.tasted ? "check" : "circle"} size={16} />
                        {wine.tasted ? "Probado" : "Marcar probado"}
                      </button>
                    </div>

                    <div className="wine-row__links">
                      <button type="button" className="wine-row__detail" onClick={() => navigate(`/vino/${wine._id}`)}>
                        Ver ficha completa <Icon name="arrow-right" size={15} />
                      </button>
                      <button
                        type="button"
                        className={`wine-row__icon-btn ${wine.favorite ? "is-fav" : ""}`}
                        onClick={() => handleToggleFavorite(wine)}
                        disabled={isPending}
                        aria-label={wine.favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
                      >
                        <Icon name="heart" filled={wine.favorite} size={17} />
                      </button>
                      <button
                        type="button"
                        className="wine-row__icon-btn wine-row__icon-btn--danger"
                        onClick={() => setShowDeleteConfirm(wine._id)}
                        disabled={isPending}
                        aria-label="Eliminar vino"
                      >
                        <Icon name="trash" size={17} />
                      </button>
                    </div>
                  </div>
                )}
              </article>
              </Fragment>
            );
          })}
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
