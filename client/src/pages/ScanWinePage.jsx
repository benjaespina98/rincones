import { leerCosecha } from "../utils/vintage";
import { textoDeEtiqueta } from "../utils/fichaDeEtiqueta";
import { mensajeDelServidor } from "../utils/mensajeDelServidor";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import LabelScanner from "../components/LabelScanner";
import Icon from "../components/Icon";
import { useToast } from "../context/ToastContext";
import { createWine, deleteWine, updateWine } from "../services/wineApi";
import { createWish, deleteWish } from "../services/wishApi";
import { WINE_TYPE_LABELS } from "../data/wineReference";
// Esta pantalla escribe la lista de deseos sin pasar por `useWishlist` (no la
// muestra, así que montar el hook sería pedir la lista entera al pedo). El
// precio es que el caché del hook queda viejo: sin esto, volver a Mi Bodega
// después de cargar un vino que venías siguiendo mostraba el vino en "Quiero
// probar" Y en la colección, o sea diciendo a la vez "lo quiero" y "lo tengo".
import { limpiarCacheDeDeseos } from "../hooks/useWishlist";
import { successHaptic } from "../utils/haptics";
import ScanReview from "../components/ScanReview";
import { trackEvent } from "../services/analyticsApi";
import "./ScanWinePage.css";

const toWinePayload = (draft) => ({
  name: draft.name?.trim() || "Vino sin nombre",
  winery: draft.winery?.trim() || "",
  line: draft.line?.trim() || "",
  region: draft.region?.trim() || "",
  varietal: draft.varietal?.trim() || "",
  vintage: leerCosecha(draft),
  type: draft.type || "unknown",
  image: draft.image || "",
  // Las botellas que elegiste en la revisión. Cero es la respuesta a "lo tomé
  // afuera": el vino existe en tu colección pero no hay ninguna botella tuya, así
  // que no se abre ningún lote ni se inventa una compra. Ver el comentario largo
  // en ScanReview, donde se pregunta.
  quantity: Math.max(0, Number.parseInt(draft.quantity, 10) || 0),

  // Sin botellas, el vino entra ya probado: si no lo tenés y lo estás cargando
  // igual, es porque lo tomaste. `tasted` es un eje independiente del stock, así
  // que esto no fuerza nada raro — sólo dice lo que pasó. El servidor completa el
  // resto del hecho (cuándo, y que cuenta como un consumo).
  tasted: Math.max(0, Number.parseInt(draft.quantity, 10) || 0) === 0,

  /**
   * De dónde salieron estos datos.
   *
   * Es EVIDENCIA, no una conclusión: el servidor recalcula el veredicto por su
   * cuenta y no acepta el que calculó la pantalla (ver `evaluarIdentificacion`
   * en el servicio). Mandarlo igual es lo que le permite distinguir un campo que
   * la persona escribió de uno que el modelo adivinó — que es exactamente lo que
   * le faltaba saber para decidir si este vino puede entrar al catálogo público.
   */
  identification: {
    source: draft.identSource || "scan",
    confidence: draft.identConfidence || {},
    editedFields: draft.identEditedFields || [],
    matchedFrom: draft.identMatchedFrom || "",
    // La única de estas que es una AFIRMACIÓN de la persona y no una medición:
    // "sí, este vino se llama igual que su bodega". Vale por lo mismo que vale un
    // campo tipeado, y sin ella un Norton o un Durigutti que todavía no esté en
    // el catálogo curado no podría publicarse nunca.
    sameNameConfirmed: draft.identSameNameConfirmed === true,
  },
});

export default function ScanWinePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { addToast, removeToast, showSuccess, showError } = useToast();

  /**
   * El alta va DIRECTO a la API, sin pasar por `useWineCollection`.
   *
   * Antes esta pantalla montaba el hook entero sólo para quedarse con `addWine`,
   * y el hook trae TODA tu colección al montar. O sea que abrir el escáner
   * disparaba una descarga completa de la bodega que después se tiraba a la
   * basura: esta pantalla no muestra ninguna lista, y al guardar navega a la
   * ficha del vino, así que ese estado moría sin que nadie lo hubiera leído.
   *
   * Es el camino crítico en un teléfono —sacar la foto y guardar— y era donde
   * menos podía permitirse una consulta de más.
   */

  /**
   * ── ESCANEAR LLEVA DIRECTO A LA CÁMARA ───────────────────────────────────────
   * No hay una pantalla de "dos puertas" antes: esta ruta ES el escáner. Cargar a mano está a un
   * toque adentro de la propia vista de captura, y cancelar vuelve a donde estabas. Antes había una
   * pantalla intermedia con un título, un párrafo y dos botones, y casi todo el mundo pagaba ese paso
   * para llegar a la cámara.
   */
  // Cancelar la captura: vuelve a la pantalla anterior; si se entró directo a esta URL, a la bodega.
  const salir = () => (location.key !== "default" ? navigate(-1) : navigate("/bodega", { replace: true }));
  // Lectura pendiente de revisión. SIEMPRE pasamos por acá tras una foto: es lo
  // que evita que un dato mal leído entre a la bodega sin que nadie lo vea.
  const [review, setReview] = useState(null);
  const [saving, setSaving] = useState(false);

  // Un enlace viejo a /agregar?q=… buscaba acá. Ahora se busca en Descubrí:
  // lo mandamos allá con el término puesto, en vez de perderlo.
  const [searchParams] = useSearchParams();
  const legacyQuery = searchParams.get("q");
  useEffect(() => {
    if (legacyQuery) navigate(`/?q=${encodeURIComponent(legacyQuery)}`, { replace: true });
  }, [legacyQuery, navigate]);

  /**
   * "Ya lo tengo", desde Guardados: la revisión se abre con el vino puesto.
   *
   * Antes ese botón navegaba a /agregar pelado y la pantalla no se enteraba de
   * nada: quien ya había guardado un vino con su bodega, su uva y su región
   * tenía que volver a escribir las tres. Ahora el vino viaja por el estado de
   * la navegación y esto lo levanta una sola vez, al entrar.
   */
  // "Escanear" de la barra, tocado estando en esta misma pantalla: la barra manda un `intento` nuevo
  // cada vez, y si había una revisión abierta se descarta para volver a la cámara.
  const intento = location.state?.intento;
  useEffect(() => {
    if (!intento) return;
    setReview(null);
    navigate(".", { replace: true, state: null });
    // Sólo cuando cambia el intento: las demás dependencias son estables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intento]);
  const desdeGuardadoId = location.state?.desdeGuardado || "";
  const wishPrecargado = location.state?.wish || null;
  useEffect(() => {
    if (wishPrecargado) startManual(wishPrecargado);
    // Se limpia el estado para que volver atrás —o recargar— no reabra el
    // formulario de un vino que quizá ya se guardó, ni la cámara.
    if (wishPrecargado || location.state?.modo) {
      navigate(".", { replace: true, state: null });
    }
    // Sólo al montar: las dependencias reales son estables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Guarda el vino escaneado en la bodega y lleva directo a su ficha, que es
  // donde el usuario ve la descripción y puede editar/agregar momentos.
  //
  // El aviso de éxito lleva "Deshacer": recién se creó, así que deshacer es
  // simplemente borrarlo — no hay stock que devolver ni lotes que reacomodar,
  // a diferencia de abrir una botella (ver BodyPage.handleOpenBottle, mismo
  // patrón de toast). Vale para los tres niveles de confianza por igual: el
  // toque de guardar ya fue una decisión de la persona, esto es la red de
  // seguridad para el toque equivocado, no una confirmación adicional.
  // `deseo` es el guardado que este alta va a quitar de Guardados, por si «Deshacer» tiene que
  // devolverlo. Viaja por parámetro y lo cierra el aviso: con una ref compartida, guardar un segundo
  // vino antes de que venza el primer aviso hacía que su «Deshacer» devolviera el deseo equivocado.
  const saveWine = async (draft, deseo = null) => {
    const payload = toWinePayload(draft);
    const { wine: created, merged, added } = await createWine(payload);
    successHaptic();
    // El evento que más dice del producto: cargar un vino es la acción por la que
    // existe la app. `source` distingue el escaneo de la carga a mano, que es lo
    // que permite saber si el lector de etiquetas vale lo que cuesta.
    // `destino` distingue las dos cargas que ahora la pantalla pregunta de
    // frente: la botella que entra a la cava y la copa que tomaste afuera. Son
    // dos usos distintos del producto y hasta ahora se contaban como uno solo.
    trackEvent("wine_added", {
      source: draft?.source || "escaneo",
      destino: payload.quantity === 0 ? "afuera" : "bodega",
    });

    // Con cero botellas el vino NO entró a tu bodega, entró a tu historial. El
    // aviso tiene que decir lo que pasó: "agregado a tu bodega" mandaría a
    // buscarlo a "En stock", que es el único lugar donde no está.
    const mensaje =
      payload.quantity === 0
        ? `"${created.name}" anotado como ya tomado`
        : `"${created.name}" agregado a tu bodega`;

    // El servidor reconoce un vino que ya tenías (`merged`) y le suma las botellas en vez de crear
    // otro. Ese vino tiene historial (puntaje, notas, momentos): "Deshacer" borrándolo sería perder
    // todo eso por un toque equivocado. Se avisa lo que pasó y no se ofrece borrar.
    if (merged) {
      const n = Number(added) || 0;
      addToast(
        n > 0
          ? `Ya tenías "${created.name}": sumamos ${n === 1 ? "1 botella" : `${n} botellas`}`
          : `Ya tenías "${created.name}": quedó como estaba`,
        "success",
        6000
      );
    } else {
      const toastId = addToast(mensaje, "success", 8000, {
        label: "Deshacer",
        onClick: async () => {
          removeToast(toastId);
          try {
            await deleteWine(created._id);
            // Si el vino salió de un deseo, deshacer el alta lo devuelve a Guardados: si no, un
            // toque equivocado borraba las dos cosas.
            if (deseo) {
              await createWish({
                name: deseo.name,
                winery: deseo.winery,
                type: deseo.type,
                region: deseo.region,
                varietal: deseo.varietal,
                vintage: deseo.vintage,
                notes: deseo.notes,
                image: deseo.image,
                favorite: deseo.favorite,
                source: deseo.source,
                priority: deseo.priority,
              }).catch(() => {});
              limpiarCacheDeDeseos();
            }
            // "Deshecho" es un participio suelto: suena a log del sistema, no a
            // alguien contándote qué pasó. Además no decía QUÉ se deshizo — ni de
            // dónde, que no es lo mismo si el vino nunca entró a la bodega.
            showSuccess(
              payload.quantity === 0
                ? `"${created.name}" ya no figura como tomado`
                : `"${created.name}" ya no está en tu bodega`
            );
            navigate("/bodega", { replace: true });
          } catch {
            showError("No se pudo deshacer");
          }
        },
      });
    }

    // `recienAgregado` enciende, una sola vez y en la ficha, el "¿sabías que?"
    // del vino: acabás de guardar la botella y en vez de un "listo" seco la app
    // te cuenta algo que no sabías. Es el único momento del recorrido donde no
    // compite con nada.
    navigate(`/vino/${created._id}`, { state: { recienAgregado: true } });
    return created;
  };

  /**
   * Tras la foto SIEMPRE mostramos la revisión.
   *
   * ── EL CRUCE CONTRA EL CATÁLOGO YA VINO HECHO ──────────────────────────────
   * Acá había una segunda llamada (`/catalog/match`) que buscaba la coincidencia
   * y rellenaba los huecos desde el navegador. Se fue al servidor, junto con algo
   * que antes no hacía NADIE: verificar que el vino exista y cómo se llama
   * exactamente (ver `conVerificacion` en labels.controller.js). Son la misma
   * pregunta —¿qué botella es ésta?— y hacerla en dos lugares distintos era lo
   * que permitía que el nombre entrara sin que ninguna fuente lo respaldara.
   *
   * De paso se va un viaje de red del camino crítico: entre la foto y la
   * revisión ahora hay una sola espera.
   */
  const handleCapture = (payload) => {
    setReview({
      photo: payload.preview || "",
      source: payload.source || "",
      values: {
        winery: payload.winery || "",
        line: payload.line || "",
        properName: payload.properName || "",
        varietal: payload.varietal || "",
        vintage: payload.vintage || "",
        region: payload.region || "",
        type: payload.type || "unknown",
      },
      confidence: { ...(payload.confidence || {}) },
      // Corte con proporciones, crianza y graduación que dice la etiqueta: van a las notas del vino al guardarlo.
      ficha: textoDeEtiqueta(payload),
      // Quién respalda este nombre: el catálogo curado, dos personas que
      // cargaron lo mismo, el modelo consultado por texto — o nadie.
      verification: payload.verification || null,
      // Lo que el servidor ya detectó que no cierra en esta lectura. La revisión
      // vuelve a calcularlo sobre lo que la persona vaya editando, pero arrancar
      // con esto evita que el cliente tenga que conocer todo el vocabulario de
      // uvas del catálogo para llegar a la misma conclusión.
      serverIssues: Array.isArray(payload.issues) ? payload.issues : [],
    });
  };

  // Carga manual: la misma pantalla de revisión, con todo vacío. Antes "Cargar a
  // mano" sólo dejaba escribir el nombre y el vino entraba con type "unknown".
  //
  // `previo` la abre con datos ya puestos: es el camino de "Ya lo tengo" desde
  // Guardados, donde la app YA sabe la bodega, la uva y la región del vino que
  // vos mismo guardaste. Mandarte a escribirlas de nuevo es pedirte un dato que
  // está a dos pantallas de distancia.
  const startManual = (previo = null) =>
    setReview({
      photo: previo?.image || "",
      source: "manual",
      values: {
        winery: previo?.winery || "",
        line: previo?.name || "",
        properName: "",
        varietal: previo?.varietal || "",
        vintage: previo?.vintage ? String(previo.vintage) : "",
        region: previo?.region || "",
        // Sólo un tipo del vocabulario: cualquier otra cosa (un evento, basura) es "sin tipo".
        type: Object.hasOwn(WINE_TYPE_LABELS, previo?.type) ? previo.type : "unknown",
      },
      confidence: {},
      verification: null,
      serverIssues: [],
      // De qué guardado vino, para poder sacarlo de la lista cuando entre a la
      // bodega: tenerlo en las dos listas a la vez es decir dos cosas
      // contradictorias ("lo quiero probar" y "lo tengo").
      desdeGuardado: previo?._id || desdeGuardadoId || "",
      // El corazón y las notas del deseo viajan con el vino: «Ya lo tengo» no puede borrarlos.
      deseoFavorito: previo?.favorite === true,
      deseoNotas: previo?.notes || "",
      // El deseo entero, para devolverlo si se deshace el alta.
      deseoOriginal: previo?._id ? previo : null,
    });

  const handleConfirmReview = async (draft) => {
    // El nombre ya no cae a la bodega, así que acá el vacío es real y hay que
    // pedirlo: sin línea ni nombre propio no sabemos cómo se llama la botella.
    if (!draft.name?.trim()) {
      showError("Escribí la línea o el nombre del vino");
      return;
    }
    try {
      setSaving(true);
      const deseoDeEsteAlta = review?.desdeGuardado ? review.deseoOriginal || null : null;
      const creado = await saveWine({
        ...draft,
        image: review?.photo || "",
        // Qué fuente respaldó esta identidad. Sigue siendo evidencia y no
        // conclusión: el servidor recalcula el veredicto por su cuenta.
        identMatchedFrom: review?.verification?.source || "",
      }, deseoDeEsteAlta);
      // El vino salió de Guardados y entró a la bodega: dejarlo en las dos
      // listas sería decir a la vez "lo quiero probar" y "lo tengo". Si el
      // borrado falla se reintenta una vez; si vuelve a fallar se avisa, sin
      // tapar que el alta —lo que se pidió— salió bien.
      if (review?.desdeGuardado) {
        if (creado && (review.deseoFavorito || review.deseoNotas)) {
          const cambios = {};
          if (review.deseoFavorito && creado.favorite !== true) cambios.favorite = true;
          if (review.deseoNotas && !String(creado.notes || "").trim()) cambios.notes = review.deseoNotas;
          if (Object.keys(cambios).length > 0) await updateWine(creado._id, cambios).catch(() => {});
        }
        let quedoEnGuardados = false;
        try {
          await deleteWish(review.desdeGuardado);
        } catch {
          try {
            await deleteWish(review.desdeGuardado);
          } catch (err) {
            // Ya borrado (404) no es un fallo: la lista quedó como se quería.
            quedoEnGuardados = err?.response?.status !== 404;
          }
        }
        limpiarCacheDeDeseos();
        if (quedoEnGuardados) {
          showError("El vino ya está en tu bodega, pero no pudimos sacarlo de Guardados. Borralo de ahí a mano.");
        }
      }
      // Lo que la etiqueta decía de la elaboración queda en las notas (sólo si no había nada escrito).
      if (creado && review?.ficha && !String(creado.notes || "").trim()) {
        await updateWine(creado._id, { notes: review.ficha }).catch(() => {});
      }
      setReview(null);
    } catch (err) {
      showError(mensajeDelServidor(err, "No se pudo guardar el vino. Probá de nuevo."));
    } finally {
      setSaving(false);
    }
  };

  /**
   * "Solo consultar": la ficha del vino, sin guardar nada.
   *
   * Reusa la ficha de catálogo (descripción, precio, reseñas) que ya sabe mostrar un vino
   * que NO está en tu bodega y ofrecer sumarlo después. El vino viaja por el estado de la
   * navegación, igual que desde Descubrí. La foto se manda sólo si es chica: el estado de
   * la historia del navegador tiene un tope y una foto de teléfono sin reducir lo pasa.
   */
  const handleConsult = (draft) => {
    trackEvent("scan_consult", { source: draft?.source || "escaneo" });
    const foto = draft.image || review?.photo;
    const imagen = typeof foto === "string" && foto.length < 400000 ? foto : "";
    navigate("/descubrir/vino", {
      state: {
        wine: {
          name: draft.name?.trim() || "Vino sin nombre",
          winery: draft.winery?.trim() || "",
          line: draft.line?.trim() || "",
          region: draft.region?.trim() || "",
          varietal: draft.varietal?.trim() || "",
          vintage: leerCosecha(draft),
          type: draft.type || "unknown",
          image: imagen,
        },
      },
    });
  };

  const handleWishReview = async (draft) => {
    if (!draft.name?.trim()) {
      showError("Escribí la línea o el nombre del vino");
      return;
    }
    try {
      setSaving(true);
      await createWish({
        name: draft.name.trim(),
        winery: draft.winery || "",
        region: draft.region || "",
        varietal: draft.varietal || "",
        type: draft.type || "unknown",
        source: review?.source === "manual" ? "manual" : "ocr",
      });
      // Igual que arriba: la lista cacheada quedó vieja y Mi Bodega la lee.
      limpiarCacheDeDeseos();
      successHaptic();
      showSuccess(`"${draft.name.trim()}" guardado en Favoritos`);
      setReview(null);
    } catch {
      showError("No se pudo guardar el vino en tu lista");
    } finally {
      setSaving(false);
    }
  };

  // --- Revisión de la lectura (siempre, tras foto o carga manual) ---
  if (review) {
    return (
      <div className="scan-wine-page">
        <ScanReview
          photo={review.photo}
          reading={review}
          verification={review.verification}
          saving={saving}
          onConfirm={handleConfirmReview}
          onWish={handleWishReview}
          onConsult={handleConsult}
          onCancel={() => setReview(null)}
          onRescan={review.source === "manual" ? undefined : () => setReview(null)}
          // "Buscar manualmente": la misma pantalla de revisión, en blanco, que
          // ya usa "Cargar a mano" desde la vista principal.
          onManual={review.source === "manual" ? undefined : startManual}
        />
      </div>
    );
  }

  // --- La captura: la cámara (o la galería si no hay permiso), con "Cargar a mano" adentro ---
  return (
    <div className="scan-wine-page">
      <div className="scanner-shell">
        <LabelScanner onCapture={handleCapture} onCancel={salir} onManual={() => startManual()} />
      </div>
    </div>
  );
}
