import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import ConfirmModal from "../components/ConfirmModal";
import OpenBottleSheet from "../components/OpenBottleSheet";
import CollapsibleSection from "../components/CollapsibleSection";
import Icon from "../components/Icon";
import LoadingSkeleton from "../components/LoadingSkeleton";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import StarRating from "../components/StarRating";
import WineReviews from "../components/WineReviews";
import WineAbout from "../components/WineAbout";
import WineOpinion from "../components/WineOpinion";
import WineIdentity from "../components/WineIdentity";
import WinePlan from "../components/WinePlan";
import WineDetailNav from "../components/WineDetailNav";
import WineDetailHero from "../components/WineDetailHero";
import WineMoments from "../components/WineMoments";
import WineDetailEditor from "../components/WineDetailEditor";
import { irHasta } from "../utils/scroll";
import { useToast } from "../context/ToastContext";
import {
  getWineById,
  updateWine,
  deleteWine,
  adjustWineStock,
  openBottle,
  undoOpenBottle,
  getWineMoments,
  addWineMoment,
} from "../services/wineApi";
import { describeWine, getWinePrice, mercadoLibreUrl } from "../services/wineSearchApi";
import { getWineReviews } from "../services/reviewApi";
import { wineDisplayName } from "../utils/wineIdentity";
import { nuncaEstuvoEnTuCava } from "../utils/cellarTime";
import { useShareCard } from "../hooks/useShareCard";
import { OCCASIONS, EMOTIONS } from "../data/momentOptions";
import PhotoLightbox from "../components/PhotoLightbox";
// El CSS de esta ficha se importa una sola vez, desde App.jsx: ver el
// comentario ahí sobre por qué (la comparte CatalogWinePage y Rollup la
// duplicaba entre los dos chunks lazy).

/**
 * Las cuatro partes de la ficha, en el orden en que están en la página.
 *
 * El orden es el del scroll y no el de importancia: una barra que liste
 * "Resumen · Cata · Plan" mientras bajando aparecen en otro orden convierte el
 * índice en un acertijo. Fuera del componente porque es una constante: adentro
 * sería un array nuevo en cada render y el observer se rearmaría con él.
 */
const SECCIONES = [
  { id: "resumen", label: "Resumen" },
  { id: "plan", label: "Plan" },
  { id: "cata", label: "Cata" },
  { id: "comunidad", label: "Comunidad" },
];

const EMPTY_MOMENT = {
  occasion: "",
  companions: "",
  place: "",
  emotion: "",
  foodPairing: "",
  notes: "",
  photos: [],
};

export default function WineDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  /**
   * ¿Venís de guardar este vino recién?
   *
   * Se lee UNA vez al montar y se limpia del historial enseguida: si quedara en
   * el state, recargar la página o volver con el botón de atrás mostraría la
   * bienvenida de nuevo, y una sorpresa que se repite deja de serlo.
   */
  const [recienAgregado, setRecienAgregado] = useState(
    Boolean(location.state?.recienAgregado)
  );
  const { addToast, removeToast, showSuccess, showError } = useToast();
  const { sharing: sharingCard, shareCard } = useShareCard();

  /**
   * ── LA FICHA ARRANCA CON LO QUE LA LISTA YA SABÍA ──────────────────────────
   * Quien te trajo hasta acá —Mi Bodega, "Listos para abrir", el Sommelier, la
   * búsqueda— tenía el vino ENTERO en memoria y navegaba con la mano vacía. La
   * ficha se montaba sin nada, tapaba la pantalla con un esqueleto y volvía a
   * pedir por red un objeto que estaba a un puntero de distancia. La espera no
   * era de datos, era de ida y vuelta.
   *
   * Ahora el vino viaja en el state de navegación y la ficha pinta en el primer
   * frame: foto, nombre, bodega, uva, cosecha, stock. Lo que la lista NO trae es
   * `description` —la ficha de IA, que es lo más pesado que guarda un vino y por
   * eso se recorta del listado (ver FUERA_DE_LA_LISTA en el server)—, así que eso
   * y sólo eso sigue esperando, con su propio esqueleto y sin bloquear nada.
   *
   * Se compara el `_id` a propósito: el state de navegación sobrevive a un
   * refresh, y sembrar la ficha del vino A cuando la URL dice B sería mostrar
   * otra botella. Si no coinciden, se ignora y se carga como siempre.
   */
  const sembrado =
    location.state?.wine?._id === id ? location.state.wine : null;

  const [wine, setWine] = useState(sembrado);
  const [loading, setLoading] = useState(!sembrado);
  /**
   * ¿Llegó ya el vino COMPLETO del servidor?
   *
   * Lo sembrado alcanza para dibujar, pero no para decidir si hay que pedirle la
   * descripción al modelo: la lista recorta `description`, así que un vino que
   * SÍ tiene su ficha guardada parece no tenerla. Sin esta bandera, entrar desde
   * Mi Bodega disparaba una llamada a la IA por cada apertura para terminar
   * usando la que ya estaba en la base.
   */
  const [wineCompleto, setWineCompleto] = useState(false);
  /**
   * Espejo de `wine` para que `loadWine` pueda preguntar "¿ya hay algo en
   * pantalla?" sin depender del estado: ponerlo en las dependencias recrearía la
   * función en cada respuesta y el efecto volvería a pedir el vino en bucle.
   */
  const wineRef = useRef(sembrado);
  useEffect(() => {
    wineRef.current = wine;
  }, [wine]);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // Foto abierta a pantalla completa: la del vino o la de un momento.
  const [lightbox, setLightbox] = useState(null);

  const [loadFailed, setLoadFailed] = useState(false);

  const [moments, setMoments] = useState([]);
  const [momentsLoading, setMomentsLoading] = useState(true);
  const [momentsFailed, setMomentsFailed] = useState(false);
  /**
   * El formulario de momentos arranca abierto si venís de abrir una botella.
   *
   * Es la continuación del "Contá el momento" del aviso: llegás con la copa
   * servida y el formulario ya esperándote, en vez de aterrizar en la ficha y
   * tener que bajar a buscarlo. Se lee del state de navegación por el mismo
   * motivo que `recienAgregado`.
   */
  const [showMomentForm, setShowMomentForm] = useState(
    Boolean(location.state?.abrirMomento)
  );
  const [momentDraft, setMomentDraft] = useState(EMPTY_MOMENT);
  const [savingMoment, setSavingMoment] = useState(false);
  // ¿Está abierta la hoja de "abrí una botella"?
  const [abriendo, setAbriendo] = useState(false);
  const momentsRef = useRef(null);

  // Ficha generada por IA (descripción, aromas, maridaje) — estilo Vivino.
  const [aiInfo, setAiInfo] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiFailed, setAiFailed] = useState(false);
  // Precio comunitario (promedio de lo que pagó la gente). `priceLoading` evita
  // afirmar "sin datos aún" mientras la petición sigue en vuelo.
  const [communityPrice, setCommunityPrice] = useState(null);
  const [priceLoading, setPriceLoading] = useState(true);

  const loadWine = useCallback(async () => {
    /**
     * Con algo ya dibujado, esto es una REVALIDACIÓN y tiene que ser invisible.
     *
     * Encender `loading` acá borraría la ficha que la persona ya está mirando
     * para poner un esqueleto en su lugar — el parpadeo que justamente se vino a
     * sacar. Lo mismo con el error: si la revalidación falla pero tenemos datos
     * buenos en pantalla, no hay nada que avisar; se sigue mostrando lo que hay.
     */
    const revalidando = Boolean(wineRef.current);
    try {
      if (!revalidando) setLoading(true);
      setLoadFailed(false);
      const data = await getWineById(id);
      if (!data) {
        setNotFound(true);
      } else {
        setWine(data);
        setWineCompleto(true);
      }
    } catch (err) {
      // Un 404 sí es "no existe"; cualquier otra cosa (red caída, 500) es un
      // fallo de carga. Antes todo caía en "puede que ya lo hayas eliminado",
      // que es una atribución alarmante y falsa.
      // Un 404 sí importa aunque estemos revalidando: el vino se borró en otro
      // lado y seguir mostrándolo sería mentir.
      if (err?.response?.status === 404) setNotFound(true);
      else if (!revalidando) setLoadFailed(true);
    } finally {
      if (!revalidando) setLoading(false);
    }
  }, [id]);

  const loadMoments = useCallback(async () => {
    try {
      setMomentsLoading(true);
      setMomentsFailed(false);
      const data = await getWineMoments(id);
      setMoments(data);
    } catch {
      setMomentsFailed(true);
    } finally {
      setMomentsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadWine();
    loadMoments();
  }, [loadWine, loadMoments]);

  // Se borra del historial apenas se leyó (ver `recienAgregado`).
  useEffect(() => {
    if (location.state?.recienAgregado || location.state?.abrirMomento) {
      navigate(location.pathname, { replace: true, state: {} });
    }
    // Sólo al montar: después el state ya está limpio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Si el formulario de momentos se abre, se lo lleva a la vista.
   *
   * Es lo que hace que "Contá el momento" del aviso signifique algo: sin esto,
   * abrir el formulario dejaba a la persona arriba de la ficha con el campo
   * cinco secciones más abajo, y el botón que acaba de tocar parecía no haber
   * hecho nada. Vale para las dos entradas —el aviso y la navegación desde Mi
   * Bodega— porque las dos terminan encendiendo el mismo estado.
   */
  useEffect(() => {
    if (!showMomentForm) return;
    irHasta(momentsRef.current, { block: "start" });
  }, [showMomentForm]);

  // Traemos la ficha del vino (IA + cache) una vez que sabemos su nombre.
  const wineName = wine?.name;
  const wineWinery = wine?.winery;
  // La uva es parte de la identidad del vino para todo lo compartido (precio,
  // fotos, búsqueda en tiendas): el nombre visible ya no la incluye.
  const wineVarietal = wine?.varietal;

  // Extraído a callback para poder reintentar desde la UI sin recargar la página.
  const loadDescription = useCallback((force = false) => {
    if (!wineName) return undefined;

    /**
     * Se espera al vino completo antes de decidir.
     *
     * La ficha puede estar dibujada con lo que trajo la lista, y la lista recorta
     * `description` para no arrastrar un kilobyte por botella. O sea que "no
     * tiene descripción" y "todavía no sabemos si la tiene" se ven exactamente
     * igual desde acá — y confundirlos costaba una llamada al modelo por cada
     * apertura, para terminar mostrando la que ya estaba guardada.
     *
     * Mientras tanto se deja el esqueleto encendido: es la parte de la ficha que
     * legítimamente tarda, y anunciarlo es justamente lo que le permite al resto
     * aparecer de una.
     */
    if (!force && !wineCompleto) {
      setAiLoading(true);
      return undefined;
    }

    // Si el vino ya trae la ficha persistida (se genera al crearlo), la usamos
    // y no gastamos una llamada por cada apertura del detalle.
    if (!force && wine?.description?.generatedAt) {
      setAiInfo(wine.description);
      setAiLoading(false);
      setAiFailed(false);
      return undefined;
    }

    let active = true;
    setAiLoading(true);
    setAiFailed(false);
    describeWine({
      name: wineName,
      winery: wineWinery,
      varietal: wine?.varietal,
      type: wine?.type,
      region: wine?.region,
      vintage: wine?.vintage,
    })
      .then((info) => {
        if (active) setAiInfo(info);
      })
      .catch(() => {
        if (active) setAiFailed(true);
      })
      .finally(() => {
        if (active) setAiLoading(false);
      });
    return () => {
      active = false;
    };
    // Sólo depende del vino (nombre+bodega) y de si ya llegó entero; el resto
    // son datos estables del mismo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wineName, wineWinery, wineCompleto, wine?.description?.generatedAt]);

  useEffect(() => loadDescription(), [loadDescription]);

  /**
   * Promedio de la comunidad, sólo para decidir el halo dorado de la foto
   * (≥ 4.5 → vino destacado). No es un dato nuevo: es el mismo promedio que
   * `WineReviews` muestra más abajo en esta misma ficha, y el pedido cachea
   * por clave (ver reviewApi.js) — pedirlo acá no abre un segundo viaje.
   */
  const [avgRating, setAvgRating] = useState(null);
  useEffect(() => {
    if (!wineName) return undefined;
    let active = true;
    getWineReviews(wineName, wineWinery, wineVarietal)
      .then((data) => {
        if (active) setAvgRating(data?.summary?.avg ?? null);
      })
      .catch(() => {
        if (active) setAvgRating(null);
      });
    return () => {
      active = false;
    };
  }, [wineName, wineWinery, wineVarietal]);

  useEffect(() => {
    if (!wineName) return undefined;
    let active = true;
    setPriceLoading(true);
    getWinePrice(wineName, wineWinery, wineVarietal)
      .then((p) => { if (active) setCommunityPrice(p); })
      .catch(() => { if (active) setCommunityPrice(null); })
      .finally(() => { if (active) setPriceLoading(false); });
    return () => {
      active = false;
    };
  }, [wineName, wineWinery, wineVarietal]);

  // Favorito y Probado se dejaron de tocar desde acá: son controles que ya
  // existen, iguales y a un toque, en la fila de Mi Bodega — tenerlos también
  // acá, al lado de "Abrí una botella", los hacía leer como una tercera forma
  // de decir lo mismo que esa botella (ver el comentario grande más abajo,
  // sobre por qué el ajuste de stock).
  const handleAdjustQuantity = async (delta) => {
    if (delta < 0 && Number(wine.quantity) <= 0) return;
    setPending(true);
    try {
      const updated = await adjustWineStock(id, delta);
      setWine(updated);
    } catch {
      showError("No se pudo ajustar el stock");
    } finally {
      setPending(false);
    }
  };

  /**
   * Abrir botellas: las descuenta y deja el vino probado, en un solo paso.
   *
   * Cuántas y qué implica se eligen y se leen antes, en `OpenBottleSheet`. Acá
   * quedan las dos salidas de después: contar el momento —que es la única vez
   * que hay algo que contar, y hasta ahora el recorrido terminaba en un aviso— y
   * deshacer, porque cuesta botellas de tu cava y se dispara con un toque.
   */
  const handleOpenBottle = async (cantidad = 1) => {
    if (Number(wine.quantity) <= 0) return;
    const eraProbado = wine.tasted === true;
    const n = Math.max(1, Math.min(Number(wine.quantity), cantidad));
    const quedan = Math.max(0, Number(wine.quantity) - n);
    setPending(true);
    try {
      const updated = await openBottle(id, n);
      setWine(updated);

      const abiertas = n === 1 ? "Botella abierta" : `${n} botellas abiertas`;
      const mensaje =
        quedan === 0
          ? `Se terminó tu ${wineDisplayName(wine)}`
          : `${abiertas} · te ${quedan === 1 ? "queda 1" : `quedan ${quedan}`}`;

      const toastId = addToast(mensaje, "success", 9000, {
        label: "Contá el momento",
        onClick: () => {
          removeToast(toastId);
          setShowMomentForm(true);
        },
        secondary: {
          label: "Deshacer",
          onClick: async () => {
            removeToast(toastId);
            try {
              setWine(await undoOpenBottle(id, eraProbado, n));
              showSuccess(n === 1 ? "Botella devuelta a tu bodega" : `${n} botellas devueltas`);
            } catch {
              showError("No se pudo deshacer");
            }
          },
        },
      });
    } catch {
      showError("No se pudo registrar la botella");
    } finally {
      setPending(false);
    }
  };

  const startEditing = () => {
    setDraft({
      name: wine.name || "",
      winery: wine.winery || "",
      region: wine.region || "",
      varietal: wine.varietal || "",
      vintage: wine.vintage || "",
      type: wine.type || "unknown",
      notes: wine.notes || "",
      image: wine.image || "",
      cellarLocation: wine.cellar?.location || "",
      cellarShelf: wine.cellar?.shelf || "",
      drinkFrom: wine.cellar?.drinkFrom || "",
      drinkUntil: wine.cellar?.drinkUntil || "",
      price: wine.purchase?.price ?? "",
      store: wine.purchase?.store || "",
      purchasedAt: wine.purchase?.purchasedAt
        ? new Date(wine.purchase.purchasedAt).toISOString().split("T")[0]
        : "",
    });
    setEditing(true);
  };

  const updateDraftField = (field, value) => setDraft((prev) => ({ ...prev, [field]: value }));

  const handleSaveEdit = async () => {
    if (!draft.name.trim()) {
      showError("El nombre no puede estar vacío");
      return;
    }

    setSaving(true);
    try {
      const updated = await updateWine(id, {
        name: draft.name.trim(),
        winery: draft.winery.trim(),
        region: draft.region.trim(),
        varietal: draft.varietal.trim(),
        vintage: draft.vintage ? Number.parseInt(draft.vintage, 10) : null,
        type: draft.type,
        notes: draft.notes.trim(),
        // La foto viaja siempre (aunque sea ""), porque el vacío también es una
        // decisión: es "sacale la que tiene". El server distingue "" de que el
        // campo no venga.
        image: draft.image || "",
        cellarLocation: draft.cellarLocation?.trim() || undefined,
        cellarShelf: draft.cellarShelf?.trim() || undefined,
        drinkFrom: draft.drinkFrom ? parseInt(draft.drinkFrom) : undefined,
        drinkUntil: draft.drinkUntil ? parseInt(draft.drinkUntil) : undefined,
        price: draft.price !== "" ? parseFloat(draft.price) : undefined,
        store: draft.store?.trim() || undefined,
        purchasedAt: draft.purchasedAt || undefined,
      });
      setWine(updated);
      setEditing(false);
      showSuccess("Cambios guardados");
    } catch {
      showError("No se pudieron guardar los cambios");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setShowDeleteConfirm(false);
    try {
      await deleteWine(id);
      showSuccess(
        `"${wineDisplayName(wine)}" eliminado de ${
          nuncaEstuvoEnTuCava(wine) ? "tus probados" : "tu bodega"
        }`
      );
      navigate("/bodega");
    } catch {
      showError("No se pudo eliminar el vino");
    }
  };

  const handleAddMoment = async (event) => {
    event.preventDefault();
    setSavingMoment(true);
    try {
      await addWineMoment(id, momentDraft);
      showSuccess("Momento agregado");
      setMomentDraft(EMPTY_MOMENT);
      setShowMomentForm(false);
      await Promise.all([loadWine(), loadMoments()]);
    } catch {
      showError("No se pudo guardar el momento");
    } finally {
      setSavingMoment(false);
    }
  };

  /**
   * Un solo camino para las dos puertas de entrada a esto: el botón del
   * encabezado (comparte el vino solo) y el de cada cata (le suma esa cata en
   * particular). El toast de "Generando…" es el mismo acá arriba y no en el
   * hook porque el hook no sabe de toasts —esa decisión es de la pantalla— y
   * los dos botones la necesitan igual: dibujar la ficha espera la imagen de
   * la botella y la tipografía, así que nunca es instantáneo.
   */
  const shareAsCard = async (moment = null) => {
    const toastId = addToast("Generando imagen…", "info", 20000);
    try {
      const resultado = await shareCard(wine, moment);
      removeToast(toastId);
      if (resultado === "downloaded") showSuccess("Imagen descargada");
      else if (resultado === "error") showError("No se pudo generar la imagen para compartir");
    } catch {
      removeToast(toastId);
      showError("No se pudo generar la imagen para compartir");
    }
  };


  if (loading) {
    return (
      <div className="wine-detail-page">
        <LoadingSkeleton type="detail" />
      </div>
    );
  }

  // Fallo de carga ≠ vino inexistente: acá ofrecemos reintentar.
  if (loadFailed) {
    return (
      <div className="wine-detail-page">
        <ErrorState
          title="No se pudo cargar el vino"
          hint="Puede ser tu conexión. El vino sigue en tu bodega."
          onRetry={loadWine}
        />
      </div>
    );
  }

  if (notFound || !wine) {
    return (
      <div className="wine-detail-page">
        <EmptyState
          illustration="cava"
          title="Este vino ya no está en tu bodega"
          hint="Puede que ya lo hayas eliminado de tu bodega."
          actionLabel="Volver a mi bodega"
          onAction={() => navigate("/bodega")}
        />
      </div>
    );
  }

  /**
   * Un vino que nunca estuvo en tu casa: lo tomaste afuera y lo anotaste.
   *
   * La ficha entera daba por sentado lo contrario —"Ya está en tu bodega",
   * "Ajustá tu stock", "Eliminar de mi bodega"— sobre una botella que nunca
   * tuviste. Es el mismo vino y la misma ficha; lo que cambia son las tres o
   * cuatro frases que hablan de tenencia, y una acción: acá lo útil no es
   * corregir un inventario que no existe, es decir "lo conseguí".
   */
  const noEsTuyo = nuncaEstuvoEnTuCava(wine);

  return (
    <div className="wine-detail-page">
      <WineDetailHero
        wine={wine}
        destacado={avgRating >= 4.5}
        onAmpliar={setLightbox}
        acciones={
          !editing && (
            <>
              <button
                type="button"
                className="wine-detail-hero__icon-btn"
                onClick={() => shareAsCard()}
                disabled={sharingCard}
                aria-label="Compartir vino como imagen"
                title="Compartir"
              >
                <Icon name="share" size={16} />
              </button>
              <button
                type="button"
                className="wine-detail-hero__icon-btn"
                onClick={startEditing}
                aria-label="Editar vino"
                title="Editar"
              >
                <Icon name="pencil" size={16} />
              </button>
            </>
          )
        }
      />

      {/* El índice de la ficha. No aparece en modo edición: ahí la pantalla es
          un formulario y no hay secciones que recorrer. */}
      {!editing && <WineDetailNav secciones={SECCIONES} />}

      <div className="wine-detail-body">
        {!editing ? (
          <>
            {/* Quién lo hace, de dónde es, de qué uva y de qué año — con rótulos y
                no como cuatro pastillas de colores del mismo peso. La bodega es el
                dato que más ubica un vino y era el único que faltaba. */}
            {/* La bienvenida del vino recién guardado: aparece una sola vez, en
                la ficha a la que caés después de escanear, y sólo si el modelo
                tenía algo bueno para contar. Si la ficha IA todavía no llegó, no
                se muestra nada —no hay lugar reservado esperando— y si no tiene
                dato tampoco: un "¿sabías que?" vacío es peor que ninguno. */}
            {recienAgregado && aiInfo?.funFact && (
              <div className="wine-welcome">
                <div className="wine-welcome__head">
                  <span className="wine-welcome__title">
                    <Icon name="sparkle" size={14} />{" "}
                    {/* Lo que acaba de pasar, dicho como pasó: un vino tomado
                        afuera no entró a la bodega, entró al historial. */}
                    {noEsTuyo ? "Anotado entre tus probados" : "Ya está en tu bodega"}
                  </span>
                  <button
                    type="button"
                    className="wine-welcome__close"
                    onClick={() => setRecienAgregado(false)}
                    aria-label="Cerrar"
                  >
                    <Icon name="x" size={14} />
                  </button>
                </div>
                <p className="wine-welcome__fact">{aiInfo.funFact}</p>
              </div>
            )}

            <div id="resumen">
              <WineIdentity wine={wine} onEdit={startEditing} />
            </div>

            {/* Las acciones, arriba de todo. Estaban novenas de once: para abrir
                una botella había que bajar 2364px, casi tres pantallas, pasando
                por la descripción de IA, el precio y tres bloques de datos.

                ── POR QUÉ YA NO HAY CUATRO CONTROLES ACÁ ────────────────────
                Favorito y Probado se sacaron enteros: ya están, con el mismo
                toque, en la fila de Mi Bodega — tenerlos DE NUEVO acá, al lado
                de "Abrí una botella", hacía que las tres cosas se leyeran como
                variantes de una sola pregunta ("¿qué hago con este vino?") en
                vez de tres decisiones distintas. La ficha se queda con la
                acción de verdad: abrir una botella (o conseguirla, si nunca
                fue tuya).

                El ajuste de stock (el "−") es distinto y se queda, pero
                aparte: no es una alternativa a "Abrí una botella", es la
                corrección de un número —diste una botella, se rompió una,
                estás sincronizando después de contar la cava a mano— y NUNCA
                marca la botella como tomada, que es justo lo que sí hace
                abrirla. Puesto chico y al lado, en vez de con el mismo peso
                que el botón grande, se lee como lo que es: un ajuste
                ocasional, no una segunda forma de hacer lo mismo. */}
            <div className="wine-detail-actions">
              {Number(wine.quantity) > 0 && (
                <button
                  type="button"
                  className="wine-detail-open"
                  disabled={pending}
                  onClick={() => setAbriendo(true)}
                >
                  <Icon name="bottle" size={17} />
                  Abrí una botella
                </button>
              )}

              {/* Con un vino que nunca fue tuyo, un contador en cero con su "−"
                  apagado no es una herramienta: es un inventario de algo que no
                  tenés. Lo que sí puede pasar con ese vino es que lo consigas, y
                  ésa es la acción — la misma llamada, dicha como corresponde. */}
              {noEsTuyo ? (
                <button
                  type="button"
                  className="wine-detail-open"
                  disabled={pending}
                  onClick={() => handleAdjustQuantity(1)}
                >
                  <Icon name="plus" size={17} />
                  Sumar a mi bodega
                </button>
              ) : (
                <div className="wine-qty-controls wine-qty-controls--quiet" role="group" aria-label="Corregir tu stock">
                  <button type="button" className="qty-btn" disabled={pending || Number(wine.quantity) <= 0} onClick={() => handleAdjustQuantity(-1)} aria-label="Quitar una botella del stock, sin marcarla como tomada">
                    <Icon name="minus" size={14} />
                  </button>
                  {/* Ver BodyPage: el `key` va en el span interno para que la
                      región viva no se desmonte y siga anunciando. */}
                  <span className="wine-qty" aria-live="polite">
                    <span key={wine.quantity} className="wine-qty__n">{wine.quantity}</span>
                  </span>
                  <button type="button" className="qty-btn" disabled={pending} onClick={() => handleAdjustQuantity(1)} aria-label="Sumar una botella al stock">
                    <Icon name="plus" size={14} />
                  </button>
                </div>
              )}
            </div>

            {/* ── QUÉ ES ESTE VINO, ANTES QUE QUÉ HACER CON ÉL ────────────────
                Pegado a la identidad y a las acciones, arriba de todo lo demás.
                El resumen, las barras de cuerpo/acidez/tanino y los aromas son lo
                que contesta "¿cómo es este vino?" — la pregunta de los primeros
                cinco segundos, y la única razón por la que alguien vuelve a abrir
                la ficha de una botella que ya conoce.

                Venía DESPUÉS del plan de la noche: para leer de qué se trata el
                vino había que pasar por encima de una tira de chips, una
                temperatura, una playlist y un plato con receta. Es al revés —
                primero qué es, después qué hacer con eso—, así que el plan bajó a
                donde corresponde. */}
            <WineAbout
              loading={aiLoading}
              failed={aiFailed}
              info={aiInfo}
              onRetry={() => loadDescription(true)}
              wine={wine}
            />

            {/* ── QUÉ HACER CON ELLA: TEMPERATURA, MÚSICA Y UN PLATO ──────────
                Pegado a la descripción, porque son la misma pregunta en dos
                tiempos: qué es este vino y qué hacés con eso. Vivía cinco
                bloques más abajo, del otro lado de tu puntuación, tus notas y
                los datos de compra — o sea que para pasar de "es un tinto
                tánico" a "servila a 16-18 °C" había que cruzar media ficha de
                cosas tuyas que no tenían nada que ver.

                Sigue costando cero: la temperatura sale de la ficha ya cargada y
                la playlist de una lista fija; sólo la receta llama al server, y
                sólo si la pedís.

                Se muestra siempre, también sin stock: el plan es de la noche, no
                del inventario. Una botella que se terminó es una que vas a
                reponer, y saber qué cocinar con ella es parte de decidirlo. */}
            <div id="plan">
              <WinePlan wine={wine} info={aiInfo} />
            </div>

            {/* ── TU EXPERIENCIA ────────────────────────────────────────────
                Lo que puntuaste, escribiste y viviste con esta botella.
                "Lo tuyo" decía lo mismo pero sonaba a placeholder, pegado a
                subtítulos concretos como "Tu opinión" — se cambió por algo que
                nombra qué hay adentro sin sumar otra vaguedad a la pila.

                La ficha son once bloques y hasta ahora todos pesaban igual: la
                misma caja, el mismo borde, el mismo aire entre uno y otro. Para
                encontrar tus momentos había que leerlos todos —y tus momentos
                son lo único de esta pantalla que no existe en ninguna otra app.

                Tres zonas en vez de once cajas: el vino (arriba), tu experiencia
                (acá) y la comunidad (al final). El rótulo va en voz baja a
                propósito: no es un título que compita con los de los bloques,
                es un cartel de calle para saber en qué parte de la ficha estás. */}
            <h2 className="wine-zone" id="cata">Tu experiencia</h2>

            {/* Una sola calificación: puntuar ES tu opinión pública. Antes había
                dos widgets de estrellas en esta misma pantalla. */}
            <WineOpinion
              name={wine.name}
              winery={wine.winery}
              varietal={wine.varietal}
              vintage={wine.vintage}
              onRated={(value) => {
                /**
                 * Puntuar escribe en DOS lados: la reseña pública (la maneja
                 * `WineOpinion`, que ya avisa si falla) y el vino de tu bodega,
                 * que es de donde salen los filtros, el orden y el promedio del
                 * perfil. Esto es lo segundo.
                 *
                 * El `.catch(() => {})` que había acá tragaba ese fallo entero:
                 * la reseña quedaba publicada, el vino seguía con el puntaje
                 * viejo, y nadie se enteraba hasta que Mi Bodega ordenaba mal o
                 * el promedio no cerraba. Un error silencioso que además dejaba
                 * los dos lados diciendo cosas distintas.
                 *
                 * Se vuelve al puntaje anterior para que el estado local diga la
                 * verdad de lo que quedó guardado, y se avisa qué pasó.
                 */
                const anterior = wine.rating;
                setWine((w) => ({ ...w, rating: value }));
                updateWine(id, { rating: value }).catch(() => {
                  setWine((w) => ({ ...w, rating: anterior }));
                  showError("Publicamos tu puntuación, pero no se actualizó en tu bodega.");
                });
              }}
            />

            {wine.notes && (
              <div className="wine-detail-notes">
                <h3>Notas</h3>
                <p>{wine.notes}</p>
              </div>
            )}

            {/* Dónde lo guardás y cómo lo conseguiste eran dos bloques con título,
                de 132px cada uno, para mostrar entre uno y cuatro chips. Es un solo
                renglón de datos: cada ícono ya dice qué es y ninguno necesita que
                se lo presente con un encabezado. La ventana de guarda no está acá
                porque ya la dice el bloque de arriba. */}
            {(wine.cellar?.location || wine.cellar?.shelf || wine.purchase?.price > 0 || wine.purchase?.store) && (
              <div className="wine-meta-row">
                {(wine.cellar?.location || wine.cellar?.shelf) && (
                  <span className="wine-meta-chip">
                    <Icon name="map-pin" size={13} />{" "}
                    {[wine.cellar?.location, wine.cellar?.shelf].filter(Boolean).join(" · ")}
                  </span>
                )}
                {wine.purchase?.price > 0 && (
                  <span className="wine-meta-chip">
                    <Icon name="tag" size={13} /> ${wine.purchase.price.toLocaleString("es-AR")}
                  </span>
                )}
                {wine.purchase?.store && (
                  <span className="wine-meta-chip"><Icon name="store" size={13} /> {wine.purchase.store}</span>
                )}
                {/* La fecha de compra no está acá: subió a la ficha, al lado de
                    la guarda, donde "desde cuándo lo tengo" y "cuándo tomarlo"
                    se leen juntas y significan algo. Repetirla sería el mismo
                    dato dos veces. */}
              </div>
            )}

            {/* Las opiniones de otros y el precio de referencia se fueron al
                final de la ficha, después de tus momentos: ver "LA COMUNIDAD"
                abajo del diario. */}
          </>
        ) : (
          <WineDetailEditor
            draft={draft}
            updateDraftField={updateDraftField}
            saving={saving}
            handleSaveEdit={handleSaveEdit}
            setEditing={setEditing}
          />
        )}


        {/* El diario cierra "tu experiencia", y por eso ahora se esconde mientras
            editás: sin el rótulo de la zona —que vive del otro lado del
            formulario— quedaba flotando abajo de los campos, como si fuera
            parte de lo que estás cambiando. */}
        {!editing && (
        <WineMoments
          ref={momentsRef}
          moments={moments}
          momentsLoading={momentsLoading}
          momentsFailed={momentsFailed}
          loadMoments={loadMoments}
          showMomentForm={showMomentForm}
          setShowMomentForm={setShowMomentForm}
          momentDraft={momentDraft}
          setMomentDraft={setMomentDraft}
          handleAddMoment={handleAddMoment}
          savingMoment={savingMoment}
          shareAsCard={shareAsCard}
          sharingCard={sharingCard}
          setLightbox={setLightbox}
          showError={showError}
        />
        )}

        {/* ── LA COMUNIDAD ──────────────────────────────────────────────────
            Lo que no es tuyo: lo que opinaron otros y lo que sale en el
            mercado. "Lo de afuera" decía lo mismo con menos precisión, al lado
            de subtítulos que ya nombran cada cosa ("Opiniones de la
            comunidad", "Precio de mercado"). Material de consulta —se mira
            cuando se busca, no cuando se abre la ficha— y por eso va último,
            después de tu diario.

            Estaba al revés: tus momentos, que son lo único que esta app tiene y
            ninguna otra, quedaban abajo de un link a MercadoLibre. */}
        {!editing && (
          <>
            <h2 className="wine-zone" id="comunidad">La comunidad</h2>

            {/* Las opiniones NO se envuelven en una sección plegable, aunque la
                lista sea larga: `WineReviews` ya se pliega solo y deja el
                promedio a la vista. Meterlo adentro de otro plegable sería
                obligar a dos toques para llegar a lo mismo. */}
            <WineReviews name={wine.name} winery={wine.winery} varietal={wine.varietal} />

            {/* ── PRECIO: SÓLO EXISTE LA SECCIÓN SI HAY UN PRECIO ────────────
                Esto era siempre un plegable "Precio · Sin datos todavía", y en
                una ficha donde arriba se lee el chip "$9.800" de lo que pagaste,
                ese renglón se contradecía con la pantalla: el precio está a la
                vista y abajo dice que no hay datos. Sin caer en la cuenta de que
                uno es TU precio y el otro el de la gente, se lee como un error.

                Dos arreglos, y ninguno es explicar mejor:
                — El rótulo deja de ser "Precio" a secas y dice de quién es el
                  número: "Precio de mercado". Ya no compite con tu chip.
                — Sin promedio no hay plegable. Lo único que quedaba adentro era
                  el link a MercadoLibre, así que el link va solo, en un renglón:
                  contesta la misma pregunta sin pedir un toque ni anunciar un
                  vacío. Un plegable que se abre para mostrar una disculpa es
                  ruido con bisagra.

                Con promedio sí se pliega —el resumen viaja en el encabezado y
                casi siempre alcanza con el número— y adentro aparece lo que sólo
                acá se puede saber: cómo te fue a vos contra lo que paga el
                resto. */}
            {communityPrice ? (
              <CollapsibleSection
                id="wine-price"
                title="Precio de mercado"
                icon="tag"
                hint={`~$${communityPrice.avg.toLocaleString("es-AR")}`}
              >
                <div className="wine-price">
                  <div className="wine-price__row">
                    <div className="wine-price__info">
                      <span className="wine-price__value">
                        ${communityPrice.avg.toLocaleString("es-AR")} {communityPrice.currency}
                        <em> · promedio de {communityPrice.count} {communityPrice.count === 1 ? "persona" : "personas"}</em>
                      </span>
                    </div>
                  </div>

                  {/* La comparación es la razón por la que uno abre esto. El
                      número pelado no dice nada —¿$12.000 es caro?— y el chip de
                      arriba tampoco: recién puestos uno al lado del otro
                      contestan "¿lo compré bien?". Con una banda del 10% para no
                      celebrar una diferencia de cien pesos como un hallazgo. */}
                  {wine.purchase?.price > 0 && (() => {
                    const tuyo = Number(wine.purchase.price);
                    const brecha = (tuyo - communityPrice.avg) / communityPrice.avg;
                    const veredicto =
                      Math.abs(brecha) < 0.1
                        ? "en línea con lo que paga el resto"
                        : brecha < 0
                          ? `${Math.round(-brecha * 100)}% por debajo del promedio`
                          : `${Math.round(brecha * 100)}% por encima del promedio`;
                    return (
                      <p className="wine-price__yours">
                        Vos pagaste ${tuyo.toLocaleString("es-AR")} — {veredicto}.
                      </p>
                    );
                  })()}

                  <a
                    className="wine-price__meli"
                    href={mercadoLibreUrl(wine.name, wine.winery, wine.varietal)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Ver precios en MercadoLibre <Icon name="arrow-right" size={15} />
                  </a>
                </div>
              </CollapsibleSection>
            ) : priceLoading ? null : (
              /* Nada mientras se busca: dibujar el link solo y reemplazarlo un
                 segundo después por el plegable del promedio es un salto de
                 layout al final de cada ficha. Se espera y se pinta una vez. */
              <a
                className="wine-price__meli wine-price__meli--solo"
                href={mercadoLibreUrl(wine.name, wine.winery, wine.varietal)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon name="tag" size={15} /> Ver precios en MercadoLibre
              </a>
            )}
          </>
        )}

        {/* Eliminar, al final y en voz baja: estaba a un centímetro de "favorito"
            y "probado", que se tocan todos los días. Ahora es sólo el ícono,
            mismo lenguaje que el tacho de la fila desplegada en Mi Bodega —
            ahí ya no hace falta el texto al lado, el ícono solo alcanza y pesa
            menos en una pantalla que ya cerró con las acciones de todos los días. */}
        {!editing && (
          <div className="wine-detail-danger">
            <button
              type="button"
              className="wine-detail-danger__btn"
              onClick={() => setShowDeleteConfirm(true)}
              title={noEsTuyo ? "Eliminar de mi historial" : "Eliminar de mi bodega"}
              aria-label={noEsTuyo ? "Eliminar de mi historial" : "Eliminar de mi bodega"}
            >
              <Icon name="trash" size={16} />
            </button>
          </div>
        )}
      </div>

      {lightbox && (
        <PhotoLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          caption={lightbox.caption}
          onClose={() => setLightbox(null)}
        />
      )}

      <ConfirmModal
        isOpen={showDeleteConfirm}
        title="¿Eliminar vino?"
        /* Qué se va y qué se queda. Con los momentos contados, porque no es lo
           mismo borrar una botella que cargaste ayer que una sobre la que
           escribiste cuatro noches — y esa diferencia la sabe la app, no la
           persona que está por tocar Eliminar. */
        /* De dónde se va: de la bodega si es tuyo, de tus probados si lo tomaste
           afuera. Decirle "tu bodega" a un vino que nunca tuviste es justo lo
           que hace dudar antes de confirmar. */
        message={
          moments.length > 0
            ? `Se quita "${wineDisplayName(wine)}" de ${noEsTuyo ? "tus probados" : "tu bodega"}. ${
                moments.length === 1
                  ? "El momento que escribiste queda"
                  : `Los ${moments.length} momentos que escribiste quedan`
              } en tu diario, y el vino sigue existiendo en el catálogo de Rincones.`
            : `Se quita "${wineDisplayName(wine)}" de ${
                noEsTuyo ? "tus probados" : "tu bodega"
              }. El vino sigue existiendo en el catálogo de Rincones.`
        }
        confirmText="Eliminar"
        cancelText="Cancelar"
        isDangerous
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {abriendo && (
        <OpenBottleSheet
          wine={wine}
          saving={pending}
          onCancel={() => setAbriendo(false)}
          onConfirm={(cantidad) => {
            setAbriendo(false);
            handleOpenBottle(cantidad);
          }}
        />
      )}
    </div>
  );
}
