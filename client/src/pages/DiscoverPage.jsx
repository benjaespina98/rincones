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
import CellarReady from "../components/CellarReady";
import FeaturedEvent from "../components/FeaturedEvent";
import ExploreFeed from "../components/ExploreFeed";
import WineMeta from "../components/WineMeta";
import { successHaptic, tapHaptic } from "../utils/haptics";
import { displayName } from "../utils/identity";
import { greeting, homeTitle, whyThisWine } from "../utils/momentCopy";
import { maridajeCorto } from "../data/maridajeCorto";
import { elegirOtroDistinto, conFotoPrimero, topDeEntrada, elegirEntrada, leerUltimoVisto, guardarUltimoVisto } from "../utils/discovery";
import Icon from "../components/Icon";
import { sugerenciasDeBusqueda } from "../utils/sugerenciasBusqueda";
import FilaDeAtajos from "../components/FilaDeAtajos";
import useRotacionAutomatica from "../hooks/useRotacionAutomatica";
import Chip from "../components/Chip";
import WinePhoto from "../components/WinePhoto";
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
import "./DiscoverPage.css";

// Los atajos de búsqueda ya no son una lista fija: ver utils/sugerenciasBusqueda.js.
// Son seis y se deslizan en una sola fila (nueve en filas que se envolvían empujaban
// el vino del día fuera de la pantalla).
const CANTIDAD_DE_ATAJOS = 6;

/** La bodega y la región, sin repetir la bodega si el nombre ya la trae ("Navarro Correas Alegoría"). */
const metaDelVino = ({ name = "", winery = "", region = "" }) => {
  const yaLaTrae = winery && name.toLowerCase().includes(winery.toLowerCase());
  return [yaLaTrae ? "" : winery, region].filter(Boolean).join(" · ");
};

export default function DiscoverPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addWish } = useWishlist();
  const { stats } = useWineStats();
  const { showError, showSuccess } = useToast();

  // Los vinos recomendados, con los de foto primero.
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
  // La recomendación en foco. El set ya viene rankeado (la mejor primero) y sólo con foto;
  // "Ver otro" recorre el resto.
  // El vino que se ve, por id (no por posición): si se descarta uno, la posición se corre sola.
  const [spotlightElegido, setSpotlightElegido] = useState(null);

  /* Semilla de la sesión. Ya no la usan el título ni el motivo —eso era el
     generador de redacciones que se fue con el cambio de tono—, pero sí la
     lección del día, que elige entre conceptos que son todos igual de válidos.
     Se calcula una vez al montar: si cambiara en cada render, la tarjeta
     cambiaría de tema mientras la estás leyendo. */
  const [seed] = useState(() => Math.floor(Math.random() * 997));

  /* La recomendación que se vio la vez anterior, leída UNA sola vez al entrar. Si se
     leyera dentro de la carga, un segundo disparo (React en desarrollo monta dos
     veces; un "Reintentar" también) encontraría ya guardada la que se acaba de
     elegir y evitaría esa en vez de la de la visita pasada. */
  const [ultimoAlEntrar] = useState(leerUltimoVisto);

  /* Los atajos de búsqueda: una selección distinta en cada visita (estación, lo que ya
     tomás, variedad forzada) que después se renueva SOLA, de a uno, como las
     sugerencias de los chats de IA (ver FilaDeAtajos.jsx). No hay botón para pedir
     otras: pedirlo era trabajo que la pantalla puede hacer sola. */
  const uvasFrecuentes = (stats?.topVarietals || []).map((v) => v.varietal).filter(Boolean);
  const [sugerenciasIniciales] = useState(() =>
    sugerenciasDeBusqueda({ cantidad: CANTIDAD_DE_ATAJOS, uvasFrecuentes }).map((label) => ({ label }))
  );
  const siguienteSugerencia = (actuales) => {
    const visibles = actuales.map((x) => x.label);
    const [label] = sugerenciasDeBusqueda({ cantidad: 1, uvasFrecuentes, excluir: visibles });
    return label && !visibles.includes(label) ? { label } : null;
  };

  // Esta es la home: si falla, hay que decirlo. Antes el error se tragaba y la
  // pantalla quedaba con un carrusel vacío, sin explicación ni salida.
  const loadFeatured = useCallback(() => {
    let active = true;
    setLoading(true);
    setLoadFailed(false);
    getFeaturedWines()
      .then((todos) => {
        if (!active) return;
        // Con foto primero (ver `conFotoPrimero`), sin sacar ninguno.
        const w = conFotoPrimero(todos);
        setFeatured(w);
        /**
         * Se entra por una de las primeras del ranking y nunca por la que se vio
         * la vez anterior (ver `elegirEntrada`). Entrar siempre por la primera
         * dejaba la home idéntica en cada visita: el set es estable durante el día
         * y su primer puesto lo decide la afinidad.
         */
        // Se entra por uno CON foto cuando hay (vienen primero): el sorteo no baja a los que no la tienen.
        setSpotlightElegido(w[elegirEntrada(w, ultimoAlEntrar, { top: topDeEntrada(w) })]?.id ?? null);
      })
      .catch(() => active && setLoadFailed(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [ultimoAlEntrar]);

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
  const estadoBodega = homeTitle({ stats });

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

  // Si el elegido ya no está (se descartó), se muestra el primero que quede.
  const spotlightIdx = Math.max(0, featured.findIndex((w) => w.id === spotlightElegido));
  const spotlight = featured[spotlightIdx] || null;

  // Lo último que se mostró, para que la próxima entrada no sea la misma.
  const spotlightId = spotlight?.id;
  useEffect(() => {
    guardarUltimoVisto(spotlightId);
  }, [spotlightId]);
  // Por qué te toca este vino: una etiqueta corta o nada. Ver whyThisWine.
  const motivo = whyThisWine(spotlight, stats);
  const maridaje = maridajeCorto(spotlight);
  // El porqué que calculó el servidor con la bodega de esta persona: razones concretas y, si hay base
  // para decirlo, un porcentaje de coincidencia. Si no vino (set viejo en caché), queda el motivo de siempre.
  const porque = spotlight?.motivo || null;
  const razones = Array.isArray(porque?.razones) ? porque.razones : [];
  // El medidor sólo cuando la coincidencia es convincente (50% o más): un 31% en la puerta de entrada de la
  // app no suma. Las razones se muestran siempre.
  const coincidencia = Number.isFinite(porque?.coincidencia) && porque.coincidencia >= 50 ? porque.coincidencia : null;

  /**
   * La tarjeta aparece ENTERA o no aparece: mientras la foto no cargó se muestra el esqueleto
   * completo, y recién cuando la imagen está lista entra todo junto con un fade. Antes llegaban
   * primero el texto y los chips y la foto después, y la tarjeta "se armaba" frente a la persona.
   *
   * La foto se precarga con un `Image` aparte; si falla o tarda más de 2,5 s se muestra igual (con la
   * botella genérica), para que un esqueleto nunca quede eterno. Además se precarga la SIGUIENTE
   * recomendación, así "Ver otro" cambia sin espera.
   */
  const [fotosListas, setFotosListas] = useState(() => new Set());
  const imagenDelSpotlight = spotlight?.image || "";
  const imagenDeLaSiguiente = featured.length > 1 ? featured[(spotlightIdx + 1) % featured.length]?.image || "" : "";
  useEffect(() => {
    if (!spotlightId || !imagenDelSpotlight) return undefined;
    const marcar = () =>
      setFotosListas((prev) => (prev.has(spotlightId) ? prev : new Set(prev).add(spotlightId)));
    const img = new Image();
    img.onload = marcar;
    img.onerror = marcar;
    img.src = imagenDelSpotlight;
    const t = setTimeout(marcar, 2500);
    return () => {
      clearTimeout(t);
      img.onload = null;
      img.onerror = null;
    };
  }, [spotlightId, imagenDelSpotlight]);
  useEffect(() => {
    if (!imagenDeLaSiguiente) return;
    const pre = new Image();
    pre.src = imagenDeLaSiguiente;
  }, [imagenDeLaSiguiente]);
  const spotlightListo = !spotlight || !imagenDelSpotlight || fotosListas.has(spotlightId);

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

  /**
   * "Ver otro": el salto más grande que permita el set, no un sorteo.
   *
   * El sorteo devolvía otro Malbec de Mendoza la mayoría de las veces —las
   * recomendaciones se parecen entre sí porque salen de tus gustos—, así que el
   * botón prometía algo distinto y entregaba lo mismo. La regla vive en
   * utils/discovery.js, aparte, porque es lo que hace que el botón valga.
   */
  const mostrarOtra = () => {
    const proximo = elegirOtroDistinto(featured, spotlightIdx);
    if (proximo === null) return;
    tapHaptic();
    setSpotlightElegido(featured[proximo].id);
  };

  /**
   * La recomendación se renueva sola, de vez en cuando, como las sugerencias de los chats de IA.
   *
   * Cada ~9 s (con azar) pasa a otra del set, con el mismo salto que "Ver otro" (la más
   * distinta, no un sorteo) y la misma entrada suave de cuando se vuelve a montar. Se frena
   * mientras la tocás o la mirás de cerca, con la pestaña oculta, con "reducir movimiento",
   * mientras buscás y mientras se está guardando ese vino: que la tarjeta cambie justo debajo
   * del dedo, a mitad de un "Guardar", es lo peor que puede hacer. Ver useRotacionAutomatica.
   */
  const propsDeRotacion = useRotacionAutomatica({
    activo: !buscando && !loading && !loadFailed && featured.length > 1,
    alRotar: () => {
      if (addingId === spotlight?.id) return;
      const proximo = elegirOtroDistinto(featured, spotlightIdx);
      if (proximo !== null) setSpotlightElegido(featured[proximo].id);
    },
  });

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
      showSuccess(`"${wine.name}" guardado en Quiero probar`);
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
        {/* h2 y no h1: la barra superior (AppLayout) ya pone un <h1> con el
            nombre de la pestaña ("Descubrí") en TODAS las pantallas, así que
            éste no puede ser el segundo. Sigue siendo lo primero y lo más
            grande que se lee al abrir la app — eso lo dice el tamaño, no la
            etiqueta. Sin el 👋: un emoji saludando es el gesto que ponen las
            apps que quieren caer bien, y no sobrevive a verlo dos veces. */}
        <h2 className="discover-hero__greeting">
          {greeting()}{name ? `, ${name}` : ""}
        </h2>
        {/* Sólo aparece cuando hay algo accionable que decir —bodega sin cargar,
            o sin botellas—. Con la bodega andando no hay renglón y el buscador
            sube: era una pregunta retórica rotativa en el lugar más visible de
            la app. Ver utils/momentCopy.js. */}
        {estadoBodega && <p className="discover-hero__title">{estadoBodega}</p>}

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
            placeholder="Buscar vinos, bodegas, uvas"
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
            quedar pegados al buscador, que es a lo que pertenecen.

            Sin el rótulo "Buscá por varietal": tres pastillas debajo de un
            buscador, con nombres de uva escritos adentro, ya dicen qué son. */}
        {/* ── LOS ATAJOS SE QUEDAN, Y MARCAN CUÁL ESTÁ PUESTO ────────────────
            Antes desaparecían apenas escribías: tocabas "Malbec", el rail se
            iba y quedabas mirando resultados sin nada que dijera de dónde
            salieron. Para pasar a "Pinot Noir" había que vaciar el campo a mano
            para que los atajos volvieran.

            Ahora se quedan y el que está puesto se enciende. Con eso el rail
            pasa a hacer las dos cosas que hace un filtro: decir dónde estás y
            dejarte cambiar de un toque. Y tocar el encendido lo apaga —vuelve
            la home— que es la salida que antes no existía. */}
        <div className="wine-search__chips">
          {/* Se frena mientras se busca: cambiar los atajos con un resultado en pantalla
              sería mover el piso. */}
          <FilaDeAtajos
            className="wine-search__chips-row"
            inicial={sugerenciasIniciales}
            siguiente={siguienteSugerencia}
            pausado={Boolean(query.trim())}
            renderItem={(v, { entra, saliendo }) => {
              const activo = query.trim().toLowerCase() === v.label.toLowerCase();
              return (
                <Chip
                  active={activo}
                  className={`wine-search__chip${saliendo ? " atajo--sale" : ""}`}
                  style={{ "--i": entra }}
                  onClick={() => {
                    tapHaptic();
                    setQuery(activo ? "" : v.label);
                  }}
                >
                  {v.label}
                </Chip>
              );
            }}
          />
        </div>
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
              illustration="busqueda"
              title={`Sin resultados para “${query.trim()}”`}
              hint="Probá con el nombre de la bodega."
              actionLabel="Escanear etiqueta"
              onAction={() => navigate("/agregar")}
              /* Esto busca contra el catálogo: nombre, bodega, uva. Cero
                 resultados también puede querer decir que lo que escribiste
                 no era un vino puntual sino una pregunta ("¿qué tomo con
                 asado?", "malbec o cabernet") — ésas SÍ tienen respuesta, sólo
                 que del otro lado. La salida lateral manda la misma búsqueda
                 al Sommelier en vez de dejarla en un callejón sin salida (ver
                 el efecto que la recibe en SuggestionsPage.jsx). */
              secondaryLabel="Preguntale al Sommelier"
              onSecondary={() => navigate("/sommelier", { state: { pregunta: query.trim() } })}
              compact
            />
          )}

          {searchResults.length > 0 && (
            <ul className="wine-search__results">
              {/* Cada tarjeta lleva `data-wine-type`: mismo hilo que en Mi
                  Bodega y que en el destacado de arriba. El tipo pinta la banda
                  y el fondo de su propia tarjeta, y en una grilla de resultados
                  eso es lo que deja separar de un vistazo un blanco de un tinto
                  sin leer la etiqueta de cada uno. */}
              {searchResults.map((r) => (
                <li
                  key={r.id}
                  className={`wine-result-card ${r.owned ? "is-owned" : ""}`}
                  data-wine-type={r.type || undefined}
                >
                  <button
                    type="button"
                    className="wine-result-card__open"
                    /* Si el vino ya es tuyo, la búsqueda te lleva a TU ficha y no
                       a la del catálogo: son el mismo vino y la tuya es la que
                       tiene tu añada, tu foto, tus notas y tus momentos. Mandar a
                       la genérica era ofrecerle a alguien la versión de vitrina de
                       algo que ya tiene en su casa. */
                    onClick={() =>
                      r.owned
                        ? navigate(`/vino/${r.owned.id}`)
                        : navigate("/descubrir/vino", { state: { wine: r } })
                    }
                    aria-label={
                      r.owned ? `Ver ${r.name} en mi bodega` : `Ver detalle de ${r.name}`
                    }
                  >
                    <div className="wine-result-card__media">
                      <WinePhoto src={r.image} type={r.type} alt={r.name} artSize={92} fit="contain" />
                    </div>

                    <div className="wine-result-card__body">
                      <p className="wine-result-card__name" title={r.name}>{r.name}</p>
                      <p className="wine-result-card__winery">
                        {[r.winery || "Bodega no especificada", r.region].filter(Boolean).join(" · ")}
                      </p>

                      {/* El tipo va acá, junto al resto de los datos, no flotando
                          sobre la foto: con fit="contain" la botella entra entera
                          y centrada, y un badge absoluto en la esquina le caía
                          encima del cuello.
                          La cosecha del catálogo casi siempre viene vacía, y no
                          es un olvido: una fila del catálogo es el VINO, no la
                          botella, y no puede tener un año sin mentirle a quien
                          tiene otra añada en la mano. La que sí es cierta es la
                          tuya, así que cuando el vino ya está en tu bodega se
                          muestra ésa. */}
                      <WineMeta
                        className="wine-result-card__meta"
                        type={r.type}
                        varietal={r.varietal}
                        vintage={
                          r.owned?.vintages?.length > 0
                            ? r.owned.vintages.join(" · ")
                            : r.vintage
                        }
                      />

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

                  {/* ── LA ACCIÓN DEPENDE DE SI YA LO TENÉS ──────────────────
                      "Quiero probar" sobre un vino que está en tu cava es la
                      app contestando otra cosa de la que se le preguntó. Con
                      botellas, lo útil es entrar a la ficha; sin botellas pero
                      ya probado, el dato es que lo tomaste y sigue en tu
                      historial. Recién si no es tuyo aparece la lista de deseos. */}
                  <div className="wine-result-card__actions">
                    {r.owned ? (
                      <span className="wine-result-card__owned">
                        <Icon name="check" size={15} />
                        {r.owned.bottles > 0
                          ? `En tu bodega · ${r.owned.bottles} ${r.owned.bottles === 1 ? "botella" : "botellas"}`
                          : r.owned.tasted
                            ? "Ya lo tomaste"
                            : "Ya está en tu bodega"}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={`wine-result-card__want ${addedIds.has(r.id) ? "is-wished" : ""}`}
                        onClick={() => handleWant(r, "search")}
                        disabled={addingId === r.id || addedIds.has(r.id)}
                      >
                        {addedIds.has(r.id) ? (
                          <><Icon name="check" size={16} /> Guardado</>
                        ) : (
                          <><Icon name="heart" size={16} /> Guardar</>
                        )}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Vino del día: mientras carga, la misma tarjeta dibujada en gris.
          Era un div vacío con el alto reservado — o sea, un hueco. Reservar el
          espacio evitaba el salto pero no decía nada: un rectángulo en blanco en
          medio de una pantalla donde todo lo demás ya está pintado se lee como
          "acá falló algo", no como "esto viene en camino". Con la silueta de la
          botella y los renglones del texto, la espera se entiende sola. */}
      {!buscando && (loading || (!loadFailed && spotlight && !spotlightListo)) && (
        <div className="spotlight spotlight--skeleton" role="status" aria-label="Cargando la recomendación">
          <div className="spotlight__open">
            <div className="spotlight__art skeleton" />
            <div className="spotlight__body">
              <span className="skeleton sk-line sk-line--eyebrow" />
              <span className="skeleton sk-line sk-line--kicker" />
              <span className="skeleton sk-line sk-line--title" />
              <span className="skeleton sk-line sk-line--meta" />
              <span className="spotlight__tags">
                <span className="skeleton sk-chip" />
                <span className="skeleton sk-chip" />
              </span>
            </div>
          </div>
          <div className="spotlight__actions">
            <span className="skeleton sk-btn" />
            <span className="skeleton sk-btn" />
          </div>
        </div>
      )}

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

      {/* Sin destacados: "volvé más tarde" es un callejón sin salida para
          quien todavía no cargó ni un vino —no hay nada a lo que volver—, así
          que a esa persona se le ofrece el paso que sí tiene sentido: cargar
          el primero. Con bodega no vacía, el catálogo global sencillamente no
          tuvo qué mostrar hoy, y ahí sí vale esperar. */}
      {!buscando && !loading && !loadFailed && !spotlight && (
        stats?.totals?.total === 0 ? (
          <EmptyState
            illustration="cava"
            title="Todavía no cargaste ningún vino"
            hint="Con los primeros, las recomendaciones se ajustan a lo que tomás."
            actionLabel="Escanear una etiqueta"
            onAction={() => navigate("/agregar")}
            compact
          />
        ) : (
          <EmptyState
            illustration="busqueda"
            title="No hay recomendaciones ahora"
            hint="Probá buscando un vino."
            compact
          />
        )
      )}

      {/* Vino del día / Sorpresa: tarjeta destacada dinámica.

          `data-wine-type` es lo que hace que la tarjeta sea de ESTE vino y no
          de la app: el borde y el halo salen del color del tipo (ver los
          tokens `--type-*` en index.css). Hasta acá, la primera pantalla era
          la única de la app donde el hilo del tipo no llegaba — un blanco, un
          espumante y un oporto se veían los tres violetas. */}
      {!buscando && !loading && spotlight && spotlightListo && (
        <section className="spotlight spotlight--entra" data-wine-type={spotlight.type} key={spotlight.id} {...propsDeRotacion}>
          <button
            type="button"
            className="spotlight__open"
            onClick={() => navigate("/descubrir/vino", { state: { wine: spotlight } })}
            aria-label={`Ver detalle de ${spotlight.name}`}
          >
            <div className="spotlight__art">
              <WinePhoto
                src={spotlight.image}
                type={spotlight.type}
                alt={spotlight.name}
                artSize={150}
                fit="contain"
                priority
              />
            </div>
            <div className="spotlight__body">
              {/* El rótulo dice qué es este bloque; el renglón de abajo, por qué
                  te tocó este vino. Los dos son etiquetas cortas, no frases: la
                  app no habla en primera persona ("Hoy te recomiendo", "Te sirvo
                  otra"), rotula.

                  El motivo sale del momento cruzado con tu propia bodega (ver
                  utils/momentCopy.js), no de un modelo: es instantáneo, gratis
                  y siempre verificable. Si no hay nada verificable que decir,
                  `whyThisWine` devuelve null y el renglón no se dibuja. */}
              <span className="spotlight__eyebrow">
                {razones[0] || motivo || (porque?.modo === "descubrimiento" ? "Para descubrir" : "Para vos")}
              </span>
              <h2 className="spotlight__name">{spotlight.name}</h2>
              <p className="spotlight__meta">
                {metaDelVino(spotlight)}
              </p>
              <WineMeta
                className="spotlight__tags"
                type={spotlight.type}
                varietal={spotlight.varietal}
              />
              {razones.length > 1 && <p className="spotlight__razones">{razones.slice(1).join(" · ")}</p>}
              {maridaje && <p className="spotlight__pairing">Va con {maridaje.charAt(0).toLowerCase() + maridaje.slice(1)}</p>}
            </div>
          </button>
          {coincidencia !== null && (
            <div
              className="spotlight__match"
              role="img"
              aria-label={`Coincide un ${coincidencia} por ciento con tu gusto`}
            >
              <span className="spotlight__match-rotulo">Coincide con tu gusto</span>
              <span className="spotlight__match-pct">{coincidencia}%</span>
              <span className="spotlight__match-pista" aria-hidden="true">
                <span className="spotlight__match-barra" style={{ "--pct": coincidencia }} />
              </span>
            </div>
          )}
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
                <><Icon name="heart" size={16} /> Quiero probarlo</>
              )}
            </button>
            {/* Se esconde si no hay a dónde ir: ofrecer otra botella cuando no
                hay otra es prometer algo que no va a pasar. */}
            {featured.length > 1 && (
              <button type="button" className="spotlight__surprise" onClick={mostrarOtra}>
                <Icon name="refresh" size={15} /> Ver otro
              </button>
            )}
          </div>
        </section>
      )}

      {/* Explorar: se esconde entero mientras buscás, para no dejar dos
          pantallas distintas apiladas en el mismo scroll. */}
      {!buscando && (
        <>
          {/* ── 2 bis. Lo que ya tenés y está listo ────────────────────────
              La home entera hablaba de vinos que NO tenés. Esta fila es la
              respuesta a "¿cuál abro esta noche?" con botellas de tu casa, y va
              JUSTO DESPUÉS de la recomendación del día por una razón de orden:
              primero el descubrimiento (lo que no conocés), enseguida lo que ya
              es tuyo y está en su punto, y recién después dónde comprar y qué
              leer.

              `enabled` la apaga entera para quien no tiene botellas: sin stock
              no hay nada que traer, y una home que recién se estrena no debería
              pagar una consulta para descubrirlo. */}
          <CellarReady enabled={(stats?.totals?.stock || 0) > 0} />


          {/* ── 3. Aprendé y explorá ───────────────────────────────────────
              El feed mixto: la lección propia primero, después videos, cursos,
              música y lo que se cargue del panel (notas, bodegas, eventos que no
              se llevaron la tarjeta grande). Todos con la misma tarjeta. */}
          <ExploreFeed groups={feedGroups} stats={stats} seed={seed} />

          {/* ── 4. Dónde comprar ───────────────────────────────────────────
              Va DESPUÉS del contenido para leer y explorar: lo comercial primero hacía de Descubrí
              una lista de compras. Contesta la pregunta que deja abierta la recomendación: "me gustó, ¿dónde lo consigo?". Reemplaza al carrusel
              de publicidad — el mismo espacio comercial, pero como utilidad. Sin
              vinotecas al aire, el componente devuelve null. */}
          <WineShops shops={shops} />

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
