import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useWineStats } from "../hooks/useWineStats";
import { useWishlist } from "../hooks/useWishlist";
import { useToast } from "../context/ToastContext";
import { getFeaturedWines, searchWines } from "../services/wineSearchApi";
import StarRating from "../components/StarRating";
import { visibleContent, itemSubtitle, pickFeatured } from "../data/discoverContent";
import { WINE_TYPE_LABELS } from "../data/wineReference";
import { successHaptic, tapHaptic } from "../utils/haptics";
import { displayName } from "../utils/identity";
import { greeting, homeTitle, whyThisWine, recoHint } from "../utils/momentCopy";
import Icon from "../components/Icon";
import WinePhoto from "../components/WinePhoto";
import LoadingSkeleton from "../components/LoadingSkeleton";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import "../styles/pages/DiscoverPage.css";

// Atajos rápidos para arrancar la búsqueda sin escribir.
const QUICK_VARIETALS = [
  "Malbec", "Cabernet Sauvignon", "Cabernet Franc", "Pinot Noir",
  "Bonarda", "Syrah", "Torrontés", "Chardonnay", "Sauvignon Blanc",
];

export default function DiscoverPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addWish } = useWishlist();
  const { stats } = useWineStats();
  const { showError, showSuccess } = useToast();

  const [featured, setFeatured] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [addingId, setAddingId] = useState(null);

  // Búsqueda en el catálogo. Antes esto delegaba: escribías acá y te mandaba a
  // /agregar a ver los resultados, en una pantalla titulada "Agregar vino"
  // desde la que ningún resultado podía entrar a la bodega. Buscar un vino es
  // descubrirlo, así que los resultados viven donde se buscan.
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q") || "");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  // Cambia al tocar "Reintentar" y vuelve a disparar la búsqueda sin que el
  // usuario tenga que tocar el texto del buscador.
  const [retryToken, setRetryToken] = useState(0);
  const [addedIds, setAddedIds] = useState(() => new Set());
  // Vino del día = el primero de los destacados (rota por día en el server).
  // "Sorprendeme" cambia el foco a uno al azar del set.
  const [spotlightIdx, setSpotlightIdx] = useState(0);
  const [surprised, setSurprised] = useState(false);

  // Esta es la home: si falla, hay que decirlo. Antes el error se tragaba y la
  // pantalla quedaba con un carrusel vacío, sin explicación ni salida.
  const loadFeatured = useCallback(() => {
    let active = true;
    setLoading(true);
    setLoadFailed(false);
    getFeaturedWines()
      .then((w) => active && setFeatured(w))
      .catch(() => active && setLoadFailed(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => loadFeatured(), [loadFeatured]);

  // Se busca sola mientras escribís, con 400ms de respiro para no disparar una
  // petición por tecla.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearched(false);
      setSearchFailed(false);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchWines(q);
        setSearchResults(results);
        setSearchFailed(false);
      } catch {
        // Distinguimos "no hay resultados" de "no pudimos buscar": si no, una
        // falla de red se disfraza de catálogo vacío.
        setSearchResults([]);
        setSearchFailed(true);
      } finally {
        setSearched(true);
        setSearchLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query, retryToken]);

  const name = displayName(user);
  // El destacado sale del propio contenido (marcado o el de fecha más próxima)
  // y se excluye del listado para no mostrarlo dos veces.
  const exploreFeatured = pickFeatured();
  const content = visibleContent(new Date(), exploreFeatured?.id);

  // Con una búsqueda activa, los resultados se quedan con la pantalla: mezclarlos
  // con el vino del día y los recomendados obliga a scrollear entre dos cosas que
  // no tienen nada que ver.
  const buscando = query.trim().length >= 2;

  const spotlight = featured[spotlightIdx] || null;

  const surpriseMe = () => {
    if (featured.length < 2) return;
    tapHaptic();
    let next = spotlightIdx;
    while (next === spotlightIdx) next = Math.floor(Math.random() * featured.length);
    setSpotlightIdx(next);
    setSurprised(true);
  };

  // "Quiero probar": guarda el vino en Guardados (no en la bodega). La bodega
  // es solo stock real y entra por escaneo o carga a mano, desde Agregar.
  //
  // `source` distingue de dónde salió el vino —un recomendado que te ofrecimos
  // no es lo mismo que uno que fuiste a buscar— y eso viaja a la lista.
  const handleWant = async (wine, source = "recomendación") => {
    if (addingId || addedIds.has(wine.id)) return;
    try {
      setAddingId(wine.id);
      await addWish({
        name: wine.name,
        winery: wine.winery || "",
        region: wine.region || "",
        varietal: wine.varietal || "",
        type: wine.type || "unknown",
        image: wine.image || "",
        source,
      });
      setAddedIds((prev) => new Set(prev).add(wine.id));
      successHaptic();
      showSuccess(`"${wine.name}" guardado en tu lista`);
    } catch {
      showError("No se pudo guardar el vino. Probá de nuevo.");
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="discover-page">
      <header className="discover-hero">
        <p className="discover-hero__greeting">{greeting()}{name ? `, ${name}` : ""} 👋</p>
        {/* El título sale del estado real de la bodega: si no hay nada que
            contar cae a la pregunta neutra. Ver utils/momentCopy.js. */}
        <h1 className="discover-hero__title">{homeTitle({ stats })}</h1>

        {/* Sin submit: busca sola mientras escribís. El botón de la derecha
            limpia, que es lo único que hace falta cuando el resultado ya está
            abajo. */}
        <form className="discover-search" onSubmit={(e) => e.preventDefault()} role="search">
          <span className="discover-search__icon" aria-hidden="true">
            <Icon name="search" size={18} />
          </span>
          <input
            type="search"
            className="discover-search__input"
            placeholder="Buscá un vino: Catena, Rutini, Torrontés…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar un vino"
          />
          {query && (
            <button
              type="button"
              className="discover-search__go"
              onClick={() => setQuery("")}
              aria-label="Limpiar búsqueda"
            >
              <Icon name="x" size={18} />
            </button>
          )}
        </form>

        {/* Atajos por varietal: para el que abre la app sin un nombre en la
            cabeza y quiere empezar por algún lado. Van dentro del header para
            quedar pegados al buscador, que es a lo que pertenecen. */}
        {!buscando && !searched && (
          <div className="wine-search__chips">
            <span className="wine-search__chips-label">Buscá por varietal</span>
            <div className="wine-search__chips-row">
              {QUICK_VARIETALS.map((v) => (
                <button
                  key={v}
                  type="button"
                  className="wine-search__chip"
                  onClick={() => { tapHaptic(); setQuery(v); }}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {buscando && (
        <section className="wine-search">
          {searchLoading && <LoadingSkeleton type="list" count={3} />}

          {!searchLoading && searched && searchFailed && (
            <ErrorState
              title="No pudimos completar la búsqueda"
              hint="Revisá tu conexión y probá de nuevo."
              onRetry={() => setRetryToken((t) => t + 1)}
              compact
            />
          )}

          {!searchLoading && searched && !searchFailed && searchResults.length === 0 && (
            <EmptyState
              icon="search"
              title={`Sin resultados para “${query.trim()}”`}
              hint="Probá con el nombre de la bodega. Si ya la tenés en la mano, sacale una foto a la etiqueta."
              actionLabel="Escanear etiqueta"
              onAction={() => navigate("/agregar")}
              compact
            />
          )}

          {searchResults.length > 0 && (
            <ul className="wine-search__results">
              {searchResults.map((r) => (
                <li key={r.id} className="wine-result-card">
                  <button
                    type="button"
                    className="wine-result-card__open"
                    onClick={() => navigate("/descubrir/vino", { state: { wine: r } })}
                    aria-label={`Ver detalle de ${r.name}`}
                  >
                    <div className="wine-result-card__media">
                      <WinePhoto src={r.image} type={r.type} alt={r.name} artSize={92} />
                      {r.type && r.type !== "unknown" && (
                        <span className="chip chip--type chip--overlay wine-result-card__type">{WINE_TYPE_LABELS[r.type]}</span>
                      )}
                    </div>

                    <div className="wine-result-card__body">
                      <p className="wine-result-card__name" title={r.name}>{r.name}</p>
                      <p className="wine-result-card__winery">
                        {r.winery || "Bodega no especificada"}
                      </p>

                      <div className="wine-result-card__meta chip-row">
                        {r.varietal && <span className="chip">{r.varietal}</span>}
                        {r.vintage && <span className="chip">{r.vintage}</span>}
                        {r.region && (
                          <span className="chip">
                            <Icon name="map-pin" size={13} />
                            {/* El texto va en su propio span: en un contenedor
                                flex el text-overflow no se aplica al nodo de
                                texto suelto, y "Luján de Cuyo, Mendoza" quedaba
                                cortado en seco contra el borde de la tarjeta. */}
                            <span className="chip__text">{r.region}</span>
                          </span>
                        )}
                      </div>

                      {/* Una línea sobre a qué sabe o con qué va, cuando el
                          modelo tenía algo concreto para decir de ESE vino.
                          Viaja en la búsqueda que ya se hacía y ya está
                          cacheada, así que no cuesta una petición extra. */}
                      {r.note && <p className="wine-result-card__note">{r.note}</p>}

                      {r.rating > 0 && (
                        <div className="wine-result-card__rating">
                          <StarRating value={r.rating} size="sm" />
                          {r.reviewCount > 0 && (
                            <span className="wine-result-card__reviews">
                              ({r.reviewCount})
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </button>

                  <div className="wine-result-card__actions">
                    <button
                      type="button"
                      className={`wine-result-card__want ${addedIds.has(r.id) ? "is-wished" : ""}`}
                      onClick={() => handleWant(r, "search")}
                      disabled={addingId === r.id || addedIds.has(r.id)}
                    >
                      {addedIds.has(r.id) ? (
                        <><Icon name="check" size={16} /> Guardado</>
                      ) : (
                        <><Icon name="heart" size={16} /> Quiero probar</>
                      )}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Vino del día: skeleton mientras carga, para que no aparezca de golpe. */}
      {!buscando && loading && <div className="spotlight spotlight--skeleton" aria-hidden="true" />}

      {/* Vino del día / Sorpresa: tarjeta destacada dinámica */}
      {!buscando && !loading && spotlight && (
        <section className="spotlight" key={spotlight.id}>
          <button
            type="button"
            className="spotlight__open"
            onClick={() => navigate("/descubrir/vino", { state: { wine: spotlight } })}
            aria-label={`Ver detalle de ${spotlight.name}`}
          >
            <div className="spotlight__art">
              <WinePhoto src={spotlight.image} type={spotlight.type} alt={spotlight.name} artSize={140} />
            </div>
            <div className="spotlight__body">
              {/* Decir POR QUÉ este vino vale más que rotularlo "Vino del día":
                  el motivo sale de la propia bodega, no de un modelo. */}
              <span className="spotlight__kicker">
                {surprised
                  ? "Al azar, para salir de la rutina"
                  : whyThisWine(spotlight, stats) || "Elegido para hoy"}
              </span>
              <h2 className="spotlight__name">{spotlight.name}</h2>
              <p className="spotlight__meta">
                {spotlight.winery}{spotlight.region ? ` · ${spotlight.region}` : ""}
              </p>
              {(spotlight.varietal || spotlight.type) && (
                <span className="spotlight__tags chip-row">
                  {spotlight.type && spotlight.type !== "unknown" && (
                    <span className="chip chip--type">{WINE_TYPE_LABELS[spotlight.type]}</span>
                  )}
                  {spotlight.varietal && <span className="chip chip--grape">{spotlight.varietal}</span>}
                </span>
              )}
            </div>
          </button>
          <div className="spotlight__actions">
            <button
              type="button"
              className={`spotlight__add ${addedIds.has(spotlight.id) ? "is-added" : ""}`}
              onClick={() => handleWant(spotlight)}
              disabled={addingId === spotlight.id || addedIds.has(spotlight.id)}
            >
              {addedIds.has(spotlight.id) ? (
                <><Icon name="check" size={16} /> Guardado</>
              ) : (
                <><Icon name="heart" size={16} /> Quiero probar</>
              )}
            </button>
            <button type="button" className="spotlight__surprise" onClick={surpriseMe}>
              🎲 Sorprendeme
            </button>
          </div>
        </section>
      )}

      {/* Explorar: se esconde entero mientras buscás, para no dejar dos
          pantallas distintas apiladas en el mismo scroll. */}
      {!buscando && (
        <>
        {/* Recomendados del catálogo argentino */}
        <section className="discover-section">
          <div className="discover-section__head">
            <h2>Recomendados para vos</h2>
            <span className="discover-section__hint">{recoHint({ stats })}</span>
          </div>

          {loading ? (
            <LoadingSkeleton type="list" count={3} />
          ) : loadFailed ? (
            <ErrorState
              title="No pudimos traer las recomendaciones"
              hint="Puede ser tu conexión. Probá de nuevo en un momento."
              onRetry={loadFeatured}
              compact
            />
          ) : featured.length === 0 ? (
            <EmptyState
              icon="search"
              title="No hay recomendaciones ahora"
              hint="Volvé más tarde o buscá un vino que tengas en mente."
              compact
            />
          ) : (
            <div className="discover-rail">
              {featured.map((wine) => (
                <article key={wine.id} className="discover-wine">
                  <button
                    type="button"
                    className="discover-wine__open"
                    onClick={() => navigate("/descubrir/vino", { state: { wine } })}
                    aria-label={`Ver detalle de ${wine.name}`}
                  >
                    <div className="discover-wine__art">
                      <WinePhoto src={wine.image} type={wine.type} alt={wine.name} artSize={92} />
                      {wine.type && wine.type !== "unknown" && (
                        <span className="chip chip--type chip--overlay discover-wine__type">{WINE_TYPE_LABELS[wine.type]}</span>
                      )}
                    </div>
                  </button>
                  <div className="discover-wine__body">
                    <button
                      type="button"
                      className="discover-wine__namebtn"
                      onClick={() => navigate("/descubrir/vino", { state: { wine } })}
                    >
                      <p className="discover-wine__name" title={wine.name}>{wine.name}</p>
                    </button>
                    <p className="discover-wine__winery">{wine.winery}</p>
                    {wine.varietal && <span className="chip chip--grape">{wine.varietal}</span>}
                    {wine.region && (
                      <p className="discover-wine__region">
                        <Icon name="map-pin" size={12} /> {wine.region}
                      </p>
                    )}
                    <button
                      type="button"
                      className={`discover-wine__add ${addedIds.has(wine.id) ? "is-added" : ""}`}
                      onClick={() => handleWant(wine)}
                      disabled={addingId === wine.id || addedIds.has(wine.id)}
                    >
                      {addedIds.has(wine.id) ? (
                        <><Icon name="check" size={15} /> Guardado</>
                      ) : addingId === wine.id ? (
                        "Guardando…"
                      ) : (
                        <><Icon name="heart" size={15} /> Quiero probar</>
                      )}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* ── Aprendé y explorá ──────────────────────────────────────────────
            Composición editorial, no una grilla: primero UN contenido
            protagonista, después las secciones. Antes las nueve tarjetas tenían
            exactamente el mismo peso visual, así que la pantalla se leía como una
            lista de enlaces y no como algo curado. */}
        <section className="explore">
          <header className="explore__head">
            <h2 className="explore__title">Aprendé y explorá</h2>
            <p className="explore__lead">
              Dónde seguir descubriendo: catas, cursos y gente que sabe.
            </p>
          </header>

          {exploreFeatured && (
            <a
              className="explore__hero"
              href={exploreFeatured.source.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => tapHaptic()}
            >
              <span className="explore__hero-kicker">
                <Icon name="sparkle" size={12} /> Destacado
              </span>
              <h3 className="explore__hero-title">{exploreFeatured.title}</h3>
              <p className="explore__hero-summary">{exploreFeatured.summary}</p>
              <span className="explore__hero-foot">
                <span className="explore__hero-meta">{itemSubtitle(exploreFeatured)}</span>
                <Icon name="arrow-right" size={16} />
              </span>
            </a>
          )}

          {content.map((group) => (
            <div key={group.id} className="explore__group">
              <div className="explore__group-head">
                <span className="explore__group-label" style={{ color: group.accent }}>
                  {group.label}
                </span>
                {group.hint && <span className="explore__group-hint">{group.hint}</span>}
              </div>

              <div className="explore__items">
                {group.items.map((item) => (
                  <a
                    key={item.id}
                    className="explore__item"
                    href={item.source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => tapHaptic()}
                    style={{ "--accent-content": group.accent }}
                  >
                    {/* El ícono puede venir del ítem; si no, del grupo. */}
                    <span className="explore__item-icon">
                      <Icon name={item.icon || group.icon} size={17} />
                    </span>
                    <span className="explore__item-text">
                      <span className="explore__item-title">{item.title}</span>
                      <span className="explore__item-summary">{item.summary}</span>
                      <span className="explore__item-meta">{itemSubtitle(item)}</span>
                    </span>
                    <Icon name="arrow-right" size={15} className="explore__item-arrow" />
                  </a>
                ))}
              </div>
            </div>
          ))}

          <p className="explore__foot">Curaduría propia. Si conocés algo que merezca estar acá, contanos.</p>
        </section>
        </>
      )}
    </div>
  );
}
