import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useWineStats } from "../hooks/useWineStats";
import { useWishlist } from "../hooks/useWishlist";
import { useToast } from "../context/ToastContext";
import { getFeaturedWines, searchWines } from "../services/wineSearchApi";
import StarRating from "../components/StarRating";
import { visibleContent, mergeIntoGroups } from "../data/discoverContent";
import { fromPromotion, deservesHero } from "../data/contentTypes";
import WineShops from "../components/WineShops";
import FeaturedEvent from "../components/FeaturedEvent";
import ExploreFeed from "../components/ExploreFeed";
import { WINE_TYPE_LABELS } from "../data/wineReference";
import { successHaptic, tapHaptic } from "../utils/haptics";
import { displayName } from "../utils/identity";
import { greeting, homeTitle, whyThisWine } from "../utils/momentCopy";
import Icon from "../components/Icon";
import WinePhoto from "../components/WinePhoto";
import DailyLesson from "../components/DailyLesson";
import LoadingSkeleton from "../components/LoadingSkeleton";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
/* PromoCarousel y PromoCard se fueron con el rediseño. El carrusel repartía
   todo el contenido del panel en un solo bloque rotativo —"la parte de los
   avisos"— y su tarjeta era una sexta forma de dibujar lo mismo que ya dibujan
   las otras cinco. Ahora cada cosa cae en su sección y todas usan ContentCard.
   La medición de impresiones, que vivía adentro del carrusel, se mudó a
   hooks/usePromoMetrics.js para no perderse con él. */
import { getPromotions } from "../services/promotionsApi";
import { trackEvent } from "../services/analyticsApi";
import "../styles/pages/DiscoverPage.css";

// Atajos rápidos para arrancar la búsqueda sin escribir. Son pocos a propósito:
// nueve ocupaban tres filas y empujaban el vino del día fuera de la pantalla,
// que es lo que la home tiene para mostrar. Con estos entra sin scrollear.
const QUICK_VARIETALS = ["Malbec", "Cabernet Franc", "Pinot Noir"];

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
  // Eventos y publicidades vigentes. Arranca vacío y así se queda si no hay nada
  // cargado: el carrusel no se renderiza y la pantalla no deja un hueco.
  const [promos, setPromos] = useState([]);

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
  // La recomendación en foco. El server rota el set por día; acá se entra por
  // uno cualquiera del set en vez de siempre por el primero, así abrir la app
  // dos veces el mismo día no da exactamente la misma tarjeta.
  // "Sorprendeme" sigue moviéndose por el resto.
  const [spotlightIdx, setSpotlightIdx] = useState(0);
  const [surprised, setSurprised] = useState(false);

  /* Semilla de la sesión: decide con cuál de las redacciones se cuentan el
     título y el motivo (ver utils/momentCopy.js). Se calcula una sola vez al
     montar — si cambiara en cada render, el texto parpadearía mientras lo
     estás leyendo. */
  const [seed] = useState(() => Math.floor(Math.random() * 997));

  // Esta es la home: si falla, hay que decirlo. Antes el error se tragaba y la
  // pantalla quedaba con un carrusel vacío, sin explicación ni salida.
  const loadFeatured = useCallback(() => {
    let active = true;
    setLoading(true);
    setLoadFailed(false);
    getFeaturedWines()
      .then((w) => {
        if (!active) return;
        setFeatured(w);
        // Entrar por uno al azar del set, no siempre por el primero.
        setSpotlightIdx(w.length > 0 ? Math.floor(Math.random() * w.length) : 0);
        setSurprised(false);
      })
      .catch(() => active && setLoadFailed(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => loadFeatured(), [loadFeatured]);

  // Los destacados van por su cuenta, sin bloquear nada: si tardan o fallan, el
  // resto de Descubrí ya se está viendo. `getPromotions` nunca lanza.
  useEffect(() => {
    let active = true;
    getPromotions().then((p) => active && setPromos(p));
    return () => {
      active = false;
    };
  }, []);

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

  /**
   * ── EL REPARTO DEL CONTENIDO DEL PANEL ────────────────────────────────────
   * Todo lo que se carga desde el panel llega por el mismo endpoint y se reparte
   * acá según su `type`. Antes iba todo al mismo carrusel, que es lo que hacía
   * que la pantalla tuviera "la parte de los avisos": un bloque que la persona
   * aprende a saltear porque sabe que ahí está lo comprado.
   *
   * Ahora cada cosa cae donde alguien la buscaría —una vinoteca en "Dónde
   * comprar", una feria en "Para agendar", una nota en el feed— y lo pagado se
   * distingue por un badge, no por vivir en un gueto.
   */
  const contenidoPanel = useMemo(() => promos.map(fromPromotion), [promos]);

  const shops = useMemo(
    () => contenidoPanel.filter((p) => p.type === "wineShop"),
    [contenidoPanel]
  );

  /**
   * El evento que se lleva la tarjeta grande: el primero que la puede sostener
   * (imagen Y fecha, ver `deservesHero`). Los promos ya vienen ordenados por
   * prioridad desde el server, así que "el primero" es el que se pactó.
   */
  const heroEvent = useMemo(
    () => contenidoPanel.find(deservesHero) || null,
    [contenidoPanel]
  );

  /**
   * El feed: la curaduría de siempre, más todo lo del panel que no se llevó una
   * sección propia. Nada se pierde por no ser destacado — un evento sin imagen
   * baja al feed, donde además se ve mejor que estirado en grande.
   */
  const feedGroups = useMemo(() => {
    const resto = contenidoPanel.filter(
      (p) => p.type !== "wineShop" && p.id !== heroEvent?.id
    );
    return mergeIntoGroups(visibleContent(new Date()), resto);
  }, [contenidoPanel, heroEvent]);

  // Con una búsqueda activa, los resultados se quedan con la pantalla: mezclarlos
  // con el vino del día y los recomendados obliga a scrollear entre dos cosas que
  // no tienen nada que ver.
  const buscando = query.trim().length >= 2;

  const spotlight = featured[spotlightIdx] || null;

  /*
   * Acá estaba `railWines`, la fila "Más para descubrir".
   *
   * Salía del MISMO array que el vino del día, así que la home recomendaba
   * vinos dos veces: una arriba, elegida y con su motivo, y otra abajo, la
   * misma bolsa desplegada en fila. Se le había sacado el duplicado exacto
   * (el destacado se filtraba de la fila) y aun así seguían siendo dos
   * bloques de recomendación separados por unos píxeles, compitiendo por lo
   * mismo. Si todo está recomendado, nada lo está.
   *
   * Queda una sola, con más aire, y "Sorprendeme" para recorrer el resto del
   * set — que es lo que la fila hacía de verdad, pero ocupando media pantalla.
   */

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
      // Se mide el ÉXITO y no el clic: lo que interesa saber es si Descubrí
      // termina en algo, no cuántas veces se apretó un botón que falló.
      trackEvent("wish_added", { source });
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
        <h1 className="discover-hero__title">{homeTitle({ stats, seed })}</h1>

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
              title="No se pudo completar la búsqueda"
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
                      <WinePhoto src={r.image} type={r.type} alt={r.name} artSize={92} fit="contain" />
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

      {/* La recomendación es ahora la única de la pantalla, así que si falla hay
          que decirlo acá: el aviso vivía en la fila de abajo, que ya no está. */}
      {!buscando && !loading && loadFailed && (
        <ErrorState
          title="No se pudo traer la recomendación"
          hint="Puede ser tu conexión. Probá de nuevo en un momento."
          onRetry={loadFeatured}
          compact
        />
      )}

      {!buscando && !loading && !loadFailed && !spotlight && (
        <EmptyState
          icon="search"
          title="No hay recomendaciones ahora"
          hint="Volvé más tarde o buscá un vino que tengas en mente."
          compact
        />
      )}

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
              <WinePhoto src={spotlight.image} type={spotlight.type} alt={spotlight.name} artSize={150} fit="contain" priority />
            </div>
            <div className="spotlight__body">
              {/* Dos renglones con trabajos distintos: el primero dice QUÉ es
                  este bloque, el segundo POR QUÉ te tocó este vino. Antes había
                  uno solo que hacía las dos cosas mal y terminaba en "Elegido
                  para hoy", que no dice nada.

                  El motivo sale del momento cruzado con tu propia bodega (ver
                  utils/momentCopy.js), no de un modelo: es instantáneo, gratis
                  y siempre verificable. */}
              {/* "Tu recomendación de hoy" era correcto y sonaba a sistema: lo
                  dice una app, no alguien. "Hoy te recomiendo" pone a alguien
                  del otro lado, que es lo que el motivo de abajo ya venía
                  haciendo ("Hace frío y todavía no tenés Malbec"). */}
              <span className="spotlight__eyebrow">
                <Icon name="sparkle" size={12} />
                {surprised ? "Al azar" : "Hoy te recomiendo"}
              </span>
              <span className="spotlight__kicker">
                {surprised
                  ? "Salgamos un rato de la rutina"
                  : whyThisWine(spotlight, stats, seed)}
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
          {/* ── 3. Dónde comprar ───────────────────────────────────────────
              Va acá, pegada a la recomendación, porque contesta la pregunta que
              deja abierta: "me gustó, ¿dónde lo consigo?". Reemplaza al carrusel
              de publicidad — el mismo espacio comercial, pero como utilidad. Sin
              vinotecas al aire, el componente devuelve null. */}
          <WineShops shops={shops} />

          {/* ── 4. Aprendé y explorá ───────────────────────────────────────
              El feed mixto: la lección propia primero, después videos, cursos,
              música y lo que se cargue del panel (notas, bodegas, eventos que no
              se llevaron la tarjeta grande). Todos con la misma tarjeta. */}
          <ExploreFeed groups={feedGroups} stats={stats} seed={seed} />

          {/* ── 5. Eventos destacados ──────────────────────────────────────
              Última porque es lo menos urgente: una feria de octubre no compite
              con "qué tomo hoy". Una sola tarjeta grande, y sólo si hay un
              evento que la sostenga — si no, no existe la sección. */}
          <FeaturedEvent event={heroEvent} />
        </>
      )}
    </div>
  );
}
