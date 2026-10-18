import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useWishlist } from "../hooks/useWishlist";
import { useToast } from "../context/ToastContext";
import { searchWines, getWineRecipe } from "../services/wineSearchApi";
import { getSuggestedWines } from "../services/wineApi";
import {
  preguntarAlSommelier,
  mensajeDeError,
  traerConversacion,
  enviarFeedback,
  preguntarConFoto,
} from "../services/sommelierApi";
import { resolveFood } from "../data/foodSynonyms";
import { wineKey } from "../utils/text";
import Icon from "../components/Icon";
import Chip from "../components/Chip";
import { recorteDeVinos } from "../utils/recorteDeVinos";
import Logo from "../components/Logo";
import SommelierChats from "../components/SommelierChats";
import RespuestaAcciones from "../components/RespuestaAcciones";
import { TopbarContext } from "../context/TopbarContext";
import { useWineStats } from "../hooks/useWineStats";
import { getCellarReady } from "../services/wineApi";
import {
  atajosDeArranque,
  azarConSemilla,
  otraComida,
  otraPregunta,
} from "../utils/atajosDeArranque";
import FilaDeAtajos from "../components/FilaDeAtajos";
import { resizeImage } from "../utils/image";
import { preguntarEnVivo, SinStreaming } from "../services/sommelierStream";
import { usePlaceholderRotativo } from "../hooks/usePlaceholderRotativo";
import { leerSesion, guardarSesion } from "../utils/sesionSommelier";
import { irHasta } from "../utils/scroll";
import StarRating from "../components/StarRating";
import WinePhoto from "../components/WinePhoto";
import WineMeta from "../components/WineMeta";
import WineRecipeSheet from "../components/WineRecipeSheet";
import { FOOD_PAIRINGS } from "../data/wineReference";
import { tapHaptic } from "../utils/haptics";
import { trackEvent } from "../services/analyticsApi";
import "./SuggestionsPage.css";

/**
 * ══ EL SOMMELIER ═══════════════════════════════════════════════════════════
 *
 * Era un formulario: elegías una comida de una lista de chips y abajo aparecían
 * vinos. Funcionaba, pero contestaba UNA sola pregunta —"¿con qué acompaño
 * esto?"— y ninguna de las otras diez que uno le hace de verdad a alguien que
 * sabe de vino: en qué se diferencian dos uvas, qué hace tal bodega, qué abrir
 * en un cumpleaños, si conviene guardar una botella o tomarla ya.
 *
 * Ahora es una conversación. Y la conversación no es el fin: es la forma más
 * corta de preguntar cualquiera de esas cosas sin que la app tenga que
 * adivinar de antemano cuáles son.
 *
 * ── POR QUÉ NO PARECE UN CHAT DE IA ────────────────────────────────────────
 * Porque las decisiones visuales van todas en la dirección contraria:
 *
 *   · La respuesta NO va en una burbuja gris con un avatar de robot al lado.
 *     Va como texto de la app, del mismo tamaño y color que el resto. Lo que
 *     entra en burbuja es lo que escribe la persona, que es lo que de verdad
 *     necesita distinguirse.
 *   · No hay "escribiendo…" con puntitos animados ni "¡Hola! Soy tu asistente
 *     virtual" — la pantalla no se presenta como si fuera alguien. El "Hola,
 *     {nombre}" que sí tiene arriba es otra cosa: no es la guía saludando, es
 *     Rincones reconociendo a quien entró, lo mismo que hace cualquier pantalla
 *     de inicio. La diferencia es de quién habla, no de si hay saludo o no.
 *   · Y sobre todo: la respuesta trae BOTELLAS. Cuando la pregunta es sobre
 *     qué tomar, abajo del texto aparecen las mismas tarjetas que dibuja Mi
 *     Bodega —con su foto, su stock, su ficha— y las del catálogo para lo que
 *     no tenés. Eso no lo puede hacer un chat pegado adentro de una app: hay
 *     que ser la app.
 *
 * ── DE DÓNDE SALE CADA COSA ────────────────────────────────────────────────
 *   texto y picks   del modelo, en el server, que ve tu bodega resumida y
 *                   elige de ahí (ver services/sommelier.service.js).
 *   "Para descubrir" del catálogo, buscado acá con la comida que la tabla
 *                   local reconoció. No cuesta cuota y es lo que evita que la
 *                   respuesta se quede corta cuando tu bodega no tiene nada
 *                   que pegue.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * ── EL ARRANQUE: DOS TIRAS CHICAS, CADA UNA CON SU TRABAJO ─────────────────
 *
 * Habían quedado fundidas en una sola tira mezclada, y ahí se perdía algo: sin
 * separación, ni "Asado" ni "¿Qué Malbec tengo?" dicen para qué sirve tocarlos
 * hasta que ya los tocaste. Ahora son dos grupos, cada uno con su lugar y una
 * frase corta que dice qué hace:
 *
 *   COMIDAS      Arriba de todo, con el "te digo qué vino le va" al lado: es
 *                maridaje, y tocar un plato (o escribir el tuyo) es la
 *                pregunta más corta que hay para eso.
 *   OTRAS_PREGUNTAS  Pegadas arriba del campo, donde se sigue la conversación:
 *                son ejemplos de todo lo demás que se le puede preguntar —tu
 *                bodega, qué abrir hoy— y viven ahí porque son la última
 *                cosa que se lee antes de escribir.
 *
 * Ninguna de las dos lleva marco, título ni ícono de sección: son la misma
 * pastilla chica (`.somm__chip`) que ya usa el resto de la pantalla.
 *
 * Y todo en PRIMERA PERSONA, porque son botones que la persona toca para
 * hablar. "¿Qué Malbec tengo?" y no "¿Qué Malbec tenés?": lo segundo pone a la
 * app preguntándole al usuario, que es al revés de lo que pasa al tocarlo.
 */
/* Los atajos de arranque ya no son listas fijas: ver utils/atajosDeArranque.js. Las comidas
   dependen del momento del día, el día y la estación; las preguntas, de lo que hay en tu
   bodega de verdad. */

/* El texto de ayuda del campo, rotando entre ejemplos (ver usePlaceholderRotativo.js). La
   primera es la de siempre; las otras enseñan todo lo que se le puede preguntar. Cortas a
   propósito: el campo es de un renglón y un texto de ayuda que no entra se corta. */
const FRASES_DEL_CAMPO = [
  "Preguntame lo que quieras",
  "Qué vas a comer hoy",
  "Preguntame qué abrir hoy",
  "Contame qué cocinás hoy",
  "Malbec o Cabernet, ¿cuál?",
  "Mandá la foto de un menú",
];

let contador = 0;
const nuevoId = () => `m${(contador += 1)}`;

/** Alto máximo del campo antes de que scrollee adentro — unas 5-6 líneas. Sin
 * tope, escribir un párrafo entero empujaría el compositor (y con él, media
 * conversación) fuera de la pantalla. */
const ALTO_MAX_INPUT = 120;

/** Cuánto tarda en dejar de creerse "rápido" y empezar a necesitar una
 * segunda frase que diga "seguís ahí". Ver el comentario grande sobre
 * TIMEOUT_MS/BUDGET_MS en sommelier.service.js: el modelo puede tardar hasta
 * ~10s en el peor caso (dos intentos completos), y "Buscando…" quieto todo
 * ese tiempo empieza a leerse como colgado antes de que en verdad lo esté. */
const PENSANDO_LARGO_MS = 4000;

/**
 * ── LA CONVERSACIÓN SOBREVIVE A CAMBIAR DE PESTAÑA ───────────────────────────
 *
 * Antes vivía sólo en memoria del componente: tocar "Mi Bodega" para mirar
 * algo y volver a Sommelier —React desmonta la pantalla al salir— dejaba la
 * charla en cero, como si nunca hubiera pasado. Ningún chat de verdad hace
 * eso (ver el comentario grande de más arriba sobre por qué ésta se pensó
 * para sentirse como uno), así que era un hueco, no una decisión.
 *
 * `sessionStorage` y no `localStorage`: dura mientras la PESTAÑA sigue
 * abierta, no para siempre. Volver dentro de la sesión encuentra la charla
 * donde quedó; cerrar el navegador y volver otro día encuentra la pantalla
 * de arranque de siempre, no una conversación de hace una semana.
 *
 * Por usuario (la clave incluye el id): en una compu compartida, la sesión
 * de una persona no puede heredar la charla de la anterior.
 */
/* Qué se guarda y cómo se lee vive en utils/sesionSommelier.js. Se guardan los
   mensajes Y el id de la conversación del historial, juntos: sin el id, volver a
   la pantalla restauraba el hilo y la pregunta siguiente abría una conversación
   nueva. */

export default function SuggestionsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { addWish } = useWishlist();
  const { showError, showSuccess } = useToast();
  // Las acciones de la charla viven en la barra superior (ver context/TopbarContext.js).
  const { izquierda: barraIzq, derecha: barraDer } = useContext(TopbarContext);

  // El nombre de pila, con la misma cascada que ya usa el resto de la app para
  // firmar algo con quien sos (ver `author.name` en catalog.controller.js): si
  // todavía no lo pusiste, la parte del mail antes de la arroba. Sin ninguna de
  // las dos, mejor ningún nombre que uno inventado.
  const nombre = (user?.firstName || "").trim() || (user?.email || "").split("@")[0] || "";

  const [mensajes, setMensajes] = useState(() => {
    const previos = leerSesion(user?.id).mensajes;
    // El contador de ids es del módulo, no del componente (sobrevive a
    // remontar la pantalla dentro de la misma pestaña). Si se restauran
    // mensajes con ids "m7", el próximo tiene que seguir en "m8", no volver
    // a "m1" y chocar con uno que ya existe en la lista restaurada.
    const maxId = previos.reduce((max, m) => {
      const n = Number(String(m.id || "").replace(/^m/, ""));
      return Number.isFinite(n) ? Math.max(max, n) : max;
    }, 0);
    contador = Math.max(contador, maxId);
    return previos;
  });
  const [texto, setTexto] = useState("");

  /* ── LOS ATAJOS DE ARRANQUE ────────────────────────────────────────────────
     Se calculan con lo que la persona tiene: los vinos listos para tomar y las
     estadísticas de su bodega. La semilla se fija UNA vez por visita, así que cuando
     llegan los datos sólo cambian los atajos que dependen de ellos. La fila de
     preguntas aparece cuando se sabe qué hay en la bodega (`datosListos`), para que no
     se vea una versión genérica que cambia a los dos segundos. */
  const { stats, loading: statsCargando } = useWineStats();
  const [listos, setListos] = useState(null);
  const [semillaAtajos] = useState(() => Math.floor(Math.random() * 2 ** 31));
  useEffect(() => {
    let vigente = true;
    getCellarReady()
      .then((d) => vigente && setListos(Array.isArray(d) ? d : []))
      .catch(() => vigente && setListos([]));
    return () => {
      vigente = false;
    };
  }, []);
  const datosListos = listos !== null && !statsCargando;

  /* El campo y las filas de atajos conviven: mientras se escribe o el campo tiene foco no
     se renueva nada solo (ver FilaDeAtajos.jsx y usePlaceholderRotativo.js). */
  const [campoEnfocado, setCampoEnfocado] = useState(false);
  const placeholder = usePlaceholderRotativo(FRASES_DEL_CAMPO, {
    activo: !campoEnfocado && texto === "",
  });
  const escribiendo = campoEnfocado || texto.trim().length > 0;
  const atajos = useMemo(
    () =>
      atajosDeArranque({
        listos: listos || [],
        hayStock: (stats?.totals?.bottles || 0) > 0 || (listos || []).length > 0,
        probados: stats?.totals?.consumed || 0,
        uvasFrecuentes: (stats?.topVarietals || []).map((v) => v.varietal).filter(Boolean),
        azar: azarConSemilla(semillaAtajos),
      }),
    [listos, stats, semillaAtajos]
  );
  const [pensando, setPensando] = useState(false);
  /* El archivo de charlas: la hoja abierta o cerrada, y a qué conversación
     guardada pertenece la de ahora. `null` significa "todavía no se guardó
     ninguna": la crea el server con la primera pregunta y devuelve su id. */
  const [historialAbierto, setHistorialAbierto] = useState(false);
  // El id vuelve junto con los mensajes (ver utils/sesionSommelier.js).
  const [conversacionId, setConversacionId] = useState(() => leerSesion(user?.id).conversacionId);
  // Segunda frase de "pensando", sólo si de verdad se hace largo. Ver
  // PENSANDO_LARGO_MS.
  const [pensandoLargo, setPensandoLargo] = useState(false);
  const [addingId, setAddingId] = useState(null);
  const [addedIds, setAddedIds] = useState(() => new Set());
  // Respuestas cuyas listas de vinos se abrieron completas (ver `recorteDeVinos`).
  const [verTodos, setVerTodos] = useState(() => new Set());

  // La receta: qué mensaje la está pidiendo, cuál falló, y cuál tiene la
  // hoja abierta. Un vino por vez (como en WinePlan) — no hace falta más:
  // nadie pide dos recetas a la vez en la misma conversación.
  const [recetaLoadingId, setRecetaLoadingId] = useState(null);
  const [recetaFailedId, setRecetaFailedId] = useState(null);
  const [recetaAbiertaId, setRecetaAbiertaId] = useState(null);

  const finRef = useRef(null);
  const raizRef = useRef(null);
  // La foto: el selector de archivos (oculto) y la última que se mandó, para reintentar.
  const fotoRef = useRef(null);
  // Cancela la respuesta en vivo si la persona se va de la pantalla: se corta la llamada a
  // Gemini en vez de seguir pagando una respuesta que nadie va a leer.
  const cancelarRef = useRef(null);
  const ultimaFotoRef = useRef(null);
  const pieRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!pensando) {
      setPensandoLargo(false);
      return undefined;
    }
    const t = setTimeout(() => setPensandoLargo(true), PENSANDO_LARGO_MS);
    return () => clearTimeout(t);
  }, [pensando]);

  /**
   * El campo crece con lo que escribís, hasta ALTO_MAX_INPUT.
   *
   * Antes era un `<input>` de una sola línea: una pregunta de más de un
   * renglón (habituales — "qué maridaje le pongo a un asado de tira con
   * chimichurri picante") se escribía scrolleando horizontalmente ADENTRO
   * del campo, invisible hasta que la releías. Ningún chat de verdad hace
   * eso. Se recalcula en cada cambio de `texto` (no sólo al tipear): así
   * también se achica solo cuando `preguntar` limpia el campo después de
   * enviar, sin tener que llamar esto a mano desde dos lugares distintos.
   */
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    if (!texto) {
      // Sin texto no hace falta medir nada: que la caja vuelva a su alto
      // natural de una sola línea, el que ya pone el CSS solo.
      //
      // Esto además esquiva una carrera real: al montar la pantalla, este
      // efecto corre ANTES de que el navegador termine de aplicar el CSS de
      // esta ruta (es un chunk lazy — ver el comentario sobre AdminLayout.css
      // en otra pantalla, mismo tipo de problema). Medir en ese instante
      // devuelve el alto de respaldo global (120px, `textarea` en App.css) en
      // vez del real, y como el efecto sólo vuelve a correr cuando CAMBIA el
      // texto, ese 120 de más quedaba pegado para siempre en un campo vacío.
      // Reproducido en vivo: recién cargada la pantalla, el campo nacía alto
      // como si tuviera cuatro renglones adentro sin una letra escrita.
      el.style.height = "";
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, ALTO_MAX_INPUT)}px`;
  }, [texto]);

  /**
   * La conversación se sigue sola hacia abajo.
   *
   * Sin esto, la respuesta aparece fuera de la pantalla y hay que scrollear
   * para descubrir que llegó: la app parece no haber hecho nada. `end` y no
   * `center` para no dejar la última línea flotando en el medio.
   */
  useEffect(() => {
    irHasta(finRef.current, { block: "end" });
  }, [mensajes, pensando]);

  // Se guarda en cada cambio, no sólo al salir: si se cierra la pestaña de
  // golpe (o el navegador se cae), la conversación que se guardó es la que
  // había hasta el último mensaje, no la de la última vez que alguien
  // recordó guardarla.
  useEffect(() => {
    // Un mensaje a medio escribir no se guarda: al volver se vería una respuesta cortada.
    guardarSesion(user?.id, { mensajes: mensajes.filter((m) => !m.escribiendo), conversacionId });
  }, [mensajes, conversacionId, user?.id]);

  /* El alto REAL del compositor, para reservar ese lugar al final de la lista. El
     compositor es fijo y crece: con la fila de repreguntas mide ~135px y sin ella
     ~83. Un margen fijo alcanzaba para uno y dejaba el último mensaje tapado en
     el otro. Se mide y se publica como `--somm-pie`; el CSS hace la cuenta. */
  useEffect(() => {
    const pie = pieRef.current;
    const raiz = raizRef.current;
    if (!pie || !raiz || typeof ResizeObserver === "undefined") return undefined;
    const medir = () => raiz.style.setProperty("--somm-pie", `${pie.offsetHeight}px`);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(pie);
    return () => observador.disconnect();
  }, []);

  useEffect(() => () => cancelarRef.current?.abort(), []);

  const openCatalog = (wine) => navigate("/descubrir/vino", { state: { wine } });

  /**
   * Los vinos del catálogo que pegan con la comida de la pregunta.
   *
   * Es la parte que NO cuesta cuota: la comida la reconoce una tabla local y la
   * búsqueda pega contra el catálogo curado. Sirve para lo que el modelo no
   * puede resolver —recomendarte algo que no tenés— y para que la respuesta no
   * se quede en tres frases cuando tu bodega no tiene nada que vaya.
   */
  const buscarParaDescubrir = useCallback(async (food) => {
    const varietals = [...new Set(FOOD_PAIRINGS[food]?.varietals || [])].slice(0, 3);
    if (varietals.length === 0) return [];

    const batches = await Promise.all(varietals.map((q) => searchWines(q).catch(() => [])));

    // El mismo veto de tipo que aplica el server sobre tu bodega: si la comida
    // define tipos, el vino tiene que ser de alguno. Sin esto, buscar "Malbec"
    // para un asado devuelve también los Malbec BLANCOS. Los de tipo
    // desconocido pasan: no sabemos que estén mal.
    const tiposOk = FOOD_PAIRINGS[food]?.types || [];
    const sirve = (w) =>
      tiposOk.length === 0 || !w.type || w.type === "unknown" || tiposOk.includes(w.type);

    const vistos = new Set();
    const mezcla = [];
    // Se intercalan los varietales para no llenar la lista con uno solo, y se
    // recorre más hondo que los 4 que se muestran porque el veto descarta.
    for (let i = 0; i < 6; i += 1) {
      for (const batch of batches) {
        const wine = batch[i];
        if (!wine || vistos.has(wine.id) || !sirve(wine)) continue;
        vistos.add(wine.id);
        mezcla.push(wine);
      }
    }
    // Se devuelve de más: quién queda afuera por "esto ya lo tenés" se decide
    // recién cuando se sabe qué eligió el modelo de tu bodega, y eso pasa
    // después — esta búsqueda arranca en paralelo, antes de saberlo.
    return mezcla.slice(0, 10);
  }, []);

  const preguntar = useCallback(
    async (pregunta, opciones = {}) => {
      const limpia = pregunta.trim();
      /* Con foto el texto es opcional: la imagen es la pregunta. */
      const foto = opciones.foto || null;
      if ((limpia.length < 3 && !foto) || pensando) return;

      /* "Otra opción": en vez de agregar un turno, REEMPLAZA la última respuesta en su
         lugar. La pregunta no se repite en pantalla y el modelo recibe la respuesta
         anterior para no volver a darla. Forma: { evitar, reemplazaId, reemplazaMensajeId }. */
      const regenerar = opciones.regenerar || null;

      tapHaptic();
      setTexto("");
      setPensando(true);

      // El historial que viaja son los mensajes que YA estaban: el nuevo va
      // aparte, como la pregunta. Se arma antes de tocar el estado para no
      // depender de que React haya aplicado el `set` de arriba.
      const iReemplazo = regenerar ? mensajes.findIndex((m) => m.id === regenerar.reemplazaId) : -1;
      const base = iReemplazo > 0 ? mensajes.slice(0, iReemplazo - 1) : mensajes;
      const previos = base
        .filter((m) => !m.error)
        .map((m) => ({ role: m.role === "user" ? "user" : "assistant", text: m.text }));

      if (regenerar) {
        // La respuesta vieja queda a la vista, atenuada, hasta que llegue la nueva.
        setMensajes((prev) =>
          prev.map((m) => (m.id === regenerar.reemplazaId ? { ...m, regenerando: true } : m))
        );
      } else {
        setMensajes((prev) => [
          ...prev,
          {
            id: nuevoId(),
            role: "user",
            text: limpia.length >= 3 ? limpia : "",
            // Sólo la miniatura (~6 KB): la foto grande no se guarda en la sesión.
            ...(foto ? { esFoto: true, foto: foto.miniatura } : {}),
          },
        ]);
      }

      /**
       * ── LAS TRES CONSULTAS ARRANCAN JUNTAS ────────────────────────────────
       *
       * La comida la reconoce una tabla local, así que se sabe ANTES de hablar
       * con nadie si esta pregunta es de maridaje. Y si lo es, las búsquedas de
       * vinos no dependen de lo que conteste el modelo: dependen del plato.
       *
       * Encadenadas —esperar la respuesta y recién ahí buscar— la pantalla
       * tardaba lo que tardan las dos cosas sumadas. Lanzadas juntas tarda lo
       * que tarda la más lenta, que es siempre el modelo.
       */
      // Una foto no tiene un plato escrito que reconocer: no hay búsqueda de catálogo.
      const comida = foto ? null : resolveFood(limpia);
      const pDescubrir = comida ? buscarParaDescubrir(comida.food).catch(() => []) : null;
      /**
       * El recomendador de siempre, como red.
       *
       * Ordena TU bodega para esa comida sin gastar cuota y sin depender de
       * nadie: la regla está escrita (ver recommendations.service.js) y anda
       * igual con Gemini caído o sin cupo. Se usa sólo si el modelo no eligió
       * ninguna botella, así el texto y las tarjetas nunca se contradicen.
       */
      const pBodega = comida ? getSuggestedWines({ food: comida.food }).catch(() => []) : null;

      /* ── LA RESPUESTA ESCRIBIÉNDOSE ───────────────────────────────────────────
         Una pregunta común se transmite: el texto aparece a medida que se genera, en un
         mensaje provisorio (`escribiendo`) que al llegar el final se reemplaza por el
         mensaje completo, con los vinos y las repreguntas. Si el streaming no se puede
         (el navegador, la red, un intermediario, la sesión vencida), se vuelve a la vía
         de siempre sin que la persona lo note. La foto y "otra opción" no se transmiten. */
      let idEnVivo = null;
      const consultarEnVivo = async () => {
        cancelarRef.current?.abort();
        const cancelar = new AbortController();
        cancelarRef.current = cancelar;
        try {
          return await preguntarEnVivo(limpia, previos, conversacionId, {
            signal: cancelar.signal,
            onTexto: (delta) => {
              if (!idEnVivo) {
                idEnVivo = nuevoId();
                const id = idEnVivo;
                setMensajes((prev) => [
                  ...prev,
                  { id, role: "guia", text: delta, escribiendo: true, wines: [], descubrir: [], followups: [] },
                ]);
              } else {
                const id = idEnVivo;
                setMensajes((prev) => prev.map((m) => (m.id === id ? { ...m, text: m.text + delta } : m)));
              }
            },
          });
        } catch (error) {
          if (!(error instanceof SinStreaming)) throw error;
          // Se saca lo provisorio (si lo hubo) y se repite por la vía normal.
          if (idEnVivo) {
            const id = idEnVivo;
            idEnVivo = null;
            setMensajes((prev) => prev.filter((m) => m.id !== id));
          }
          return preguntarAlSommelier(limpia, previos, conversacionId);
        }
      };

      try {
        if (foto) ultimaFotoRef.current = foto;
        const data = foto
          ? await preguntarConFoto(foto.blob, {
              question: limpia.length >= 3 ? limpia : "",
              history: previos,
              conversationId: conversacionId,
            })
          : regenerar
            ? await preguntarAlSommelier(limpia, previos, conversacionId, {
                regenerar: true,
                evitar: regenerar.evitar,
                reemplazaMensajeId: regenerar.reemplazaMensajeId,
              })
            : await consultarEnVivo();
        if (!data) throw new Error("sin respuesta");
        /* La primera pregunta crea la conversación del lado del server y su id
           vuelve acá, para que la siguiente se agregue a la misma en vez de
           abrir otra. Si el guardado falló, viene null y la charla sigue
           andando igual: el historial es lo accesorio. */
        if (data.conversationId) setConversacionId(data.conversationId);

        /**
         * El texto se pinta APENAS LLEGA, sin esperar a los vinos.
         *
         * Es lo que más cambia la sensación de velocidad: la respuesta es lo
         * que la persona vino a leer, y hacerla esperar a dos búsquedas de
         * catálogo que van abajo del texto es cobrarle a lo importante el
         * tiempo de lo accesorio. Las tarjetas aparecen solas un momento
         * después, debajo de algo que ya se está leyendo.
         */
        const id = idEnVivo || nuevoId();
        const nueva = {
            id,
            role: "guia",
            // El id del mensaje en el historial y el pulgar de la persona (ver
            // RespuestaAcciones.jsx). Sin historial guardado no hay a qué apuntar.
            mensajeId: data.mensajeId || null,
            feedback: null,
            text: data.answer,
            wines: data.wines || [],
            descubrir: [],
            // Reserva el lugar del cargando sólo si de verdad va a haber algo.
            buscandoVinos: Boolean(comida) && !data.offTopic,
            // Las repreguntas que el modelo propone para ESTA respuesta. Se
            // guardan en el mensaje (no aparte) para que sigan siendo las
            // correctas si se restaura la charla desde sessionStorage.
            followups: data.followups || [],
            // A qué vino/estilo referirle la receta, si el modelo detectó que
            // la persona busca un plato concreto (ver "recipeFor" en
            // sommelier.service.js). La receta en sí NO viaja acá — se pide
            // aparte, sólo si se toca el botón (ver pedirReceta más abajo).
            recipeWine: data.recipeWine || null,
        };
        setMensajes((prev) => {
          if (regenerar) return prev.map((m) => (m.id === regenerar.reemplazaId ? nueva : m));
          // Si se venía escribiendo, el mensaje completo ocupa ese mismo lugar.
          if (idEnVivo) return prev.map((m) => (m.id === idEnVivo ? nueva : m));
          return [...prev, nueva];
        });
        // Se apaga acá y no al final: con el texto en pantalla ya no hay nada
        // que esperar para volver a preguntar, y dejar el campo bloqueado
        // mientras cargan unas tarjetas de abajo sería cobrarle a la persona el
        // tiempo de algo que ni siquiera está mirando.
        setPensando(false);
        trackEvent("sommelier_ask", { conVinos: (data.wines || []).length > 0, foto: Boolean(foto) });

        if (comida && !data.offTopic) {
          const [catalogo, respaldo] = await Promise.all([pDescubrir, pBodega]);
          const deTuBodega = (data.wines || []).length > 0 ? data.wines : respaldo;
          // "Para descubrir" es justamente lo que NO tenés: repetir acá un vino
          // que ya está arriba es decir dos veces lo mismo. Recién ahora se
          // sabe cuáles son, porque la búsqueda salió antes que la respuesta.
          const mios = new Set(deTuBodega.map(wineKey));
          const descubrir = catalogo.filter((w) => !mios.has(wineKey(w))).slice(0, 4);

          setMensajes((prev) =>
            prev.map((m) =>
              m.id === id ? { ...m, wines: deTuBodega, descubrir, buscandoVinos: false } : m
            )
          );
        }
      } catch (error) {
        // La persona se fue de la pantalla: no hay nada que mostrar.
        if (error?.name === "AbortError") return;
        // Si se venía escribiendo, el texto a medias se saca: o hay respuesta o hay error.
        if (idEnVivo) {
          const id = idEnVivo;
          setMensajes((prev) => prev.filter((m) => m.id !== id));
        }
        // El error va COMO MENSAJE y no como un aviso que se va solo: es la
        // respuesta a lo que la persona acaba de preguntar, y tiene que quedar
        // en el lugar donde quedó la pregunta. Un toast dejaría la
        // conversación con una pregunta sin nada abajo.
        //
        // Guarda la pregunta original (`retry`) para que el botón de abajo
        // pueda reintentarla sin que la persona tenga que escribirla de
        // nuevo — perder lo que ya escribiste es el doble de trabajo por el
        // mismo error, y encima el más probable de todos (Gemini colgado un
        // instante, no un problema de la persona).
        //
        // EXCEPTO cuando el error es "llegaste al límite" (429): ahí
        // reintentar no cambia nada — el límite sigue puesto, así que el
        // botón fallaría otra vez en el acto. Ofrecerlo igual sería prometer
        // una salida que no existe.
        if (regenerar) {
          // La respuesta anterior sigue valiendo: se la restaura y se avisa aparte.
          setMensajes((prev) =>
            prev.map((m) => (m.id === regenerar.reemplazaId ? { ...m, regenerando: false } : m))
          );
          showError(mensajeDeError(error));
          return;
        }
        const esLimite = error?.response?.status === 429;
        setMensajes((prev) => [
          ...prev,
          {
            id: nuevoId(),
            role: "guia",
            text: mensajeDeError(error),
            error: true,
            retry: esLimite || foto ? undefined : limpia,
            // La foto no se escribe de nuevo: se reintenta la última (guardada en un ref).
            retryFoto: !esLimite && foto ? { texto: limpia } : undefined,
          },
        ]);
      } finally {
        setPensando(false);
      }
    },
    [mensajes, pensando, buscarParaDescubrir, conversacionId, showError]
  );

  /**
   * ── LA PREGUNTA LLEGA DESDE OTRA PANTALLA ───────────────────────────────
   *
   * "Descubrí" tiene su propio buscador, y son dos cosas parecidas pero no
   * iguales: ahí buscás un vino puntual por nombre, bodega o uva contra el
   * catálogo; acá le preguntás algo a alguien. El problema real no es tener
   * los dos —cada uno contesta lo suyo—, es el callejón sin salida: escribir
   * "¿qué tomo con asado?" en el buscador de Descubrí no encuentra ningún
   * vino que se llame así, y hasta ahora ahí se terminaba, sin decir que la
   * misma pregunta SÍ tiene respuesta acá (ver el botón "Preguntale al
   * Sommelier" en el vacío de la búsqueda, en DiscoverPage.jsx).
   *
   * Se dispara sola y no deja el texto esperando en el campo: quien tocó ese
   * botón ya decidió preguntar eso, así que pedirle un segundo toque para
   * enviar lo que ya escribió una vez sería cobrarle el mismo trabajo dos
   * veces. Se limpia el state de navegación enseguida (mismo patrón que
   * `recienAgregado` en WineDetailPage) para que volver con "atrás" o
   * refrescar la pantalla no la reenvíe sola.
   *
   * `yaEnviada` es lo que evita mandarla DOS veces en desarrollo: React
   * StrictMode corre cada efecto de montaje dos veces a propósito, y acá eso
   * no es gratis como en el resto de la app — `navigate` de sobra no hace
   * nada, pero `preguntar` de sobra es una segunda pregunta real, con su
   * propio gasto de cuota. Reproducido en vivo: la misma pregunta llegaba
   * duplicada, con dos respuestas (o dos errores) apiladas.
   */
  const preguntaEnviada = useRef(false);
  useEffect(() => {
    const pregunta = location.state?.pregunta;
    if (!pregunta || preguntaEnviada.current) return;
    preguntaEnviada.current = true;
    navigate(location.pathname, { replace: true, state: {} });
    preguntar(pregunta);
    // Sólo al montar: `preguntar` cambia en cada tecla que se escribe después
    // (depende de `mensajes`), y no hay que volver a correr esto por eso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * La receta del vino que el modelo detectó en esta respuesta.
   *
   * No se pide sola: generarla es OTRA llamada entera a Gemini (hasta 22s de
   * presupuesto propio — ver suggestRecipe en wineAi.service.js), y meterla
   * adentro del pedido del Sommelier le rompería el suyo (10s, pensado para
   * que la guía se sienta rápida). Se pide aparte, con el mismo endpoint que
   * ya usa la ficha del vino (`/api/catalog/recipe`, ya cacheado por vino +
   * plan), y sólo cuando la persona toca el botón — igual que en `WinePlan`.
   *
   * Un plan fijo ("cena") porque acá no hay selector de plan como en la
   * ficha: es el más neutro de los seis (ver PLANS en wineAi.service.js).
   */
  const pedirReceta = async (m) => {
    if (!m.recipeWine || recetaLoadingId) return;
    if (m.receta) {
      setRecetaAbiertaId(m.id);
      return;
    }

    setRecetaLoadingId(m.id);
    setRecetaFailedId(null);
    try {
      const data = await getWineRecipe(m.recipeWine, "cena");
      if (data) {
        setMensajes((prev) => prev.map((x) => (x.id === m.id ? { ...x, receta: data } : x)));
        setRecetaAbiertaId(m.id);
        trackEvent("sommelier_recipe");
      } else {
        setRecetaFailedId(m.id);
      }
    } catch {
      setRecetaFailedId(m.id);
    } finally {
      setRecetaLoadingId(null);
    }
  };

  /**
   * Las repreguntas de la ÚLTIMA respuesta, no de todas.
   *
   * El modelo las propone en cada turno (ver RESPONSE_SCHEMA en
   * sommelier.service.js), pero antes se descartaban del todo: mostrar la
   * fila que proponía CADA respuesta, una abajo de la otra, era justo lo que
   * se sacó en una vuelta anterior de esta pantalla ("una fila de pastillas
   * nueva debajo de otra que ya se acababa de leer, turno tras turno" — ver
   * el comentario grande más abajo). Acá se resuelve distinto: se muestra
   * SÓLO la fila de la respuesta más reciente, reemplazando a la anterior en
   * el mismo lugar fijo del compositor, no acumulando. Con eso el problema
   * que motivó sacarlas (el amontonamiento) no existe, y lo que costó
   * generar deja de tirarse: el modelo ya las pensaba en cada respuesta, sólo
   * que el cliente las ignoraba.
   */
  const repreguntas = useMemo(() => {
    for (let i = mensajes.length - 1; i >= 0; i -= 1) {
      const m = mensajes[i];
      if (m.role === "guia" && m.followups?.length > 0) return m.followups;
      // Si el último turno fue una pregunta de la persona o un error, no hay
      // repreguntas vigentes todavía (o el error ya tiene su propia acción,
      // "Reintentar") — no hace falta seguir mirando turnos más viejos.
      if (m.role === "user" || m.error) return null;
    }
    return null;
  }, [mensajes]);

  // ¿La pregunta de esta respuesta fue una foto? Entonces no hay "otra opción": la imagen
  // no se guarda y no se puede volver a mandar.
  const preguntaEsFoto = (idRespuesta) => {
    const i = mensajes.findIndex((x) => x.id === idRespuesta);
    return i > 0 && Boolean(mensajes[i - 1]?.esFoto);
  };

  // La última respuesta de la guía (no un error): la única a la que se le pide "otra opción".
  const idUltimaRespuesta = [...mensajes].reverse().find((m) => m.role !== "user" && !m.error)?.id;

  /**
   * Volver a empezar. Antes no hacía falta un botón para esto: salir de la
   * pantalla YA borraba la charla (era memoria del componente, nada más). Con
   * la conversación persistida en sessionStorage (ver más arriba) eso dejó de
   * pasar, así que ahora hace falta una forma explícita de decir "quiero
   * arrancar de cero" — sin ella, alguien que quiere cambiar de tema del todo
   * quedaría empujando la charla vieja para abajo para siempre.
   */
  const nuevaConversacion = () => {
    trackEvent("sommelier_reset");
    setMensajes([]);
    setConversacionId(null);
    setTexto("");
    setHistorialAbierto(false);
    inputRef.current?.focus();
  };

  /**
   * La foto de un menú, un plato o una botella.
   *
   * Se reduce a ~1280px antes de subirla (una foto de teléfono pesa 4–8 MB y el servidor
   * la descarta apenas la procesa) y se genera una miniatura para mostrarla en la charla.
   * Si el navegador no puede decodificarla (un HEIC en Chrome), se manda tal cual si no
   * es enorme: el servidor acepta HEIC. Lo que la persona escribió en el campo viaja
   * como texto de la foto.
   */
  const abrirSelectorDeFoto = () => {
    if (pensando) return;
    trackEvent("sommelier_foto_abrir");
    fotoRef.current?.click();
  };

  const alElegirFoto = async (e) => {
    const archivo = e.target.files?.[0];
    // Se vacía el selector: elegir la MISMA foto dos veces seguidas tiene que disparar el cambio.
    e.target.value = "";
    if (!archivo) return;
    if (!archivo.type.startsWith("image/")) {
      showError("Eso no parece una foto. Probá con otra.");
      return;
    }
    try {
      const [grande, chica] = await Promise.all([
        resizeImage(archivo, 1280, 0.82),
        resizeImage(archivo, 160, 0.6),
      ]);
      preguntar(texto, { foto: { blob: grande.blob, miniatura: chica.dataUrl } });
    } catch {
      if (archivo.size <= 5.5 * 1024 * 1024) {
        preguntar(texto, { foto: { blob: archivo, miniatura: "" } });
      } else {
        showError("No pudimos leer esa foto. Probá con otra.");
      }
    }
  };

  /**
   * "Otra opción" para la última respuesta: la misma pregunta, otra respuesta, en su
   * lugar. Ver RespuestaAcciones.jsx.
   */
  const otraOpcion = () => {
    const iUltima = mensajes.map((m) => m.role !== "user" && !m.error).lastIndexOf(true);
    if (iUltima < 1 || pensando) return;
    const ultima = mensajes[iUltima];
    const pregunta = mensajes[iUltima - 1];
    if (pregunta?.role !== "user" || pregunta.esFoto) return;
    trackEvent("sommelier_otra_opcion");
    preguntar(pregunta.text, {
      regenerar: {
        evitar: ultima.text,
        reemplazaId: ultima.id,
        reemplazaMensajeId: ultima.mensajeId,
      },
    });
  };

  /**
   * El pulgar. Se actualiza en pantalla de inmediato y se avisa al servidor; si falla,
   * vuelve a como estaba. Tocar el mismo pulgar dos veces lo quita.
   */
  const darPulgar = async (mensaje, valor) => {
    if (!conversacionId || !mensaje.mensajeId) return;
    const anterior = mensaje.feedback || null;
    const nuevo = anterior === valor ? null : valor;
    const poner = (v) =>
      setMensajes((prev) => prev.map((m) => (m.id === mensaje.id ? { ...m, feedback: v } : m)));
    poner(nuevo);
    trackEvent("sommelier_feedback", { valor: nuevo || "quitado" });
    try {
      await enviarFeedback(conversacionId, mensaje.mensajeId, nuevo);
    } catch {
      poner(anterior);
      showError("No pudimos guardar tu opinión. Probá de nuevo.");
    }
  };

  /**
   * Se borró una conversación del panel. Si era la que estaba abierta, la
   * pantalla vuelve a empezar: dejarla ahí mostraría una charla que ya no existe
   * y la próxima pregunta abriría una nueva sin que se note el cambio. No se
   * enfoca el campo: quien borra está mirando el panel, no escribiendo.
   */
  const alBorrarTodas = () => {
    // Se borró TODO el historial: si había una charla abierta con id, era una de ellas.
    if (!conversacionId) return;
    setMensajes([]);
    setConversacionId(null);
    setTexto("");
  };

  const alBorrarConversacion = (id) => {
    if (id !== conversacionId) return;
    setMensajes([]);
    setConversacionId(null);
    setTexto("");
  };

  /**
   * Abrir una charla del archivo.
   *
   * Los mensajes vuelven con la forma con que se guardaron (ver el modelo
   * `SommelierConversation`), que no es la del estado de esta pantalla: hay que
   * traducir. Los vinos guardados son un resumen —id, nombre, bodega, tipo,
   * foto— y eso es a propósito: el stock y el puntaje de hace un mes mostrados
   * como actuales serían peor que no mostrarlos. La tarjeta lleva a la ficha,
   * que tiene la verdad de hoy.
   */
  const abrirConversacion = async (id) => {
    setHistorialAbierto(false);
    try {
      const charla = await traerConversacion(id);
      if (!charla) return;
      setMensajes(
        charla.messages.map((m, i) => ({
          id: `${id}-${i}`,
          // La pantalla llama "guia" a la respuesta; el historial, "assistant". Sin
          // traducir, las repreguntas de una charla restaurada no se encontraban.
          role: m.role === "user" ? "user" : "guia",
          text: m.text,
          wines: m.deTuBodega || [],
          descubrir: m.paraDescubrir || [],
          followups: m.repreguntas || [],
          mensajeId: m._id ? String(m._id) : null,
          feedback: m.feedback || null,
        }))
      );
      setConversacionId(id);
      trackEvent("sommelier_historial_abrir");
    } catch {
      showError("No pudimos abrir esa consulta. Probá de nuevo.");
    }
  };

  const handleWant = async (wine) => {
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
        // "recomendación" y no "sommelier": el enum del modelo tiene cuatro
        // valores (manual, ocr, recomendación, search) y uno inventado hace
        // fallar la validación entera — el vino no se guardaría y la persona
        // vería un error sobre algo que la app hizo mal.
        source: "recomendación",
      });
      setAddedIds((prev) => new Set(prev).add(wine.id));
      showSuccess(`"${wine.name}" guardado en Quiero probar`);
    } catch {
      showError("No se pudo guardar el vino. Probá de nuevo.");
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="somm" ref={raizRef}>
      {/* `aria-live="polite"` para que un lector de pantalla anuncie la
          respuesta apenas llega, sin que la persona tenga que ir a buscarla
          — antes sólo "Buscando…" (role="status", más abajo) hablaba, y en
          cuanto desaparecía, silencio: nada avisaba que la respuesta ya
          estaba. */}
      <div className="somm__feed" aria-live="polite">
        {/* "Conversaciones" y "Nueva conversación" ya no viven acá: son íconos de la barra
            superior, como en cualquier chat de IA (ver el portal más abajo). Dibujadas en el
            cuerpo se iban con el scroll justo cuando la charla se hacía larga. */}

        {mensajes.length === 0 && (
          /* ── EL ARRANQUE: EL TÍTULO YA DICE PARA QUÉ SIRVE TOCAR UN CHIP ────
             Antes eran dos tarjetas con marco, ícono y título cada una —"Emparejar
             con comida", "Sugerencias rápidas"— y ocupaban media pantalla antes de
             que nadie escribiera nada. Se fue el marco, y con la última vuelta se
             fue también el título genérico ("Preguntame de vino") y la frase
             aparte que explicaba el gesto: las dos decían cosas parecidas en dos
             renglones. "¿Con qué maridamos hoy?" hace las dos cosas en uno solo,
             en el vocabulario propio de la pantalla —maridar, no "preguntar"—, y
             ya deja claro que tocar "Asado" pide una botella, no la receta. */
          <div className="somm__intro">
            {/* El saludo es de la APP, no de la guía: por eso va arriba y
                aparte del título, que es el que describe qué hace esta
                pantalla. Sin nombre (sesión sin perfil todavía) se esconde en
                vez de saludar a nadie. */}
            {nombre && <p className="somm__saludo">Hola, {nombre}</p>}
            <h2>¿Con qué maridamos hoy?</h2>
            <FilaDeAtajos
              className="somm__rail"
              inicial={atajos.comidas}
              siguiente={(actuales) => otraComida({ excluir: actuales.map((a) => a.label) })}
              pausado={escribiendo}
              renderItem={(c, { entra, saliendo }) => (
                <Chip
                  className={`somm__chip somm__chip--entra${saliendo ? " atajo--sale" : ""}`}
                  style={{ "--i": entra }}
                  onClick={() => preguntar(c.pregunta)}
                >
                  {c.label}
                </Chip>
              )}
            />

            {/* Estas vivían abajo, pegadas al compositor, con la pantalla vacía
                en el medio. Son lo mismo que las de arriba —tocar un chip
                pregunta algo—, así que arrancar de cero es un solo bloque y no
                dos mitades separadas por un hueco. Se mantienen como fila
                aparte porque son otra cosa: arriba hay comidas, acá preguntas
                sueltas. */}
            {datosListos && (
              <div className="somm__otras">
                <span className="somm__otras-rotulo">O preguntame</span>
                {/* La `key` cambia si cambian los datos de los que depende (llegó la bodega):
                    la fila se vuelve a armar. Las preguntas que dependen de la bodega son
                    fijas; las demás rotan solas. */}
                <FilaDeAtajos
                  key={atajos.preguntas.map((p) => p.label).join("|")}
                  className="somm__rail"
                  inicial={atajos.preguntas}
                  siguiente={(actuales) =>
                    otraPregunta({
                      excluir: actuales.map((a) => a.label),
                      uvasFrecuentes: (stats?.topVarietals || []).map((v) => v.varietal).filter(Boolean),
                    })
                  }
                  pausado={escribiendo}
                  renderItem={(p, { entra, saliendo }) => (
                    <Chip
                      className={`somm__chip somm__chip--entra${saliendo ? " atajo--sale" : ""}`}
                      style={{ "--i": entra + atajos.comidas.length }}
                      onClick={() => (p.accion === "foto" ? abrirSelectorDeFoto() : preguntar(p.pregunta))}
                    >
                      {p.accion === "foto" && <Icon name="camera" size={14} />}
                      {p.label}
                    </Chip>
                  )}
                />
              </div>
            )}
          </div>
        )}

        {mensajes.map((m) =>
          m.role === "user" ? (
            m.esFoto ? (
              <div key={m.id} className="somm__vos somm__vos--foto">
                {m.foto && <img className="somm__vos-foto" src={m.foto} alt="La foto que mandaste" />}
                <span>{m.text || "Foto de un menú o plato"}</span>
              </div>
            ) : (
              <p key={m.id} className="somm__vos">
                {m.text}
              </p>
            )
          ) : (
            <div
              key={m.id}
              className={`somm__resp ${m.error ? "is-error" : ""} ${m.regenerando ? "is-regenerando" : ""}`}
              // Mientras se escribe, un lector de pantalla espera a que termine en vez de leer cada
              // pedazo.
              aria-busy={m.escribiendo ? "true" : undefined}
            >
              {/* ── EL MONOGRAMA, QUE NO ES UN AVATAR ──────────────────────
                  Arriba, en el encabezado de este archivo, está escrito que la
                  respuesta no lleva avatar al lado. Eso sigue valiendo y esto
                  no lo contradice: lo que se descartó era un avatar de ROBOT,
                  una carita que hace que la pantalla se presente como si fuera
                  alguien. El monograma de Rincones es la marca de quién habla,
                  no un personaje — la misma distinción que este archivo ya hace
                  sobre el saludo ("no es la guía saludando, es Rincones
                  reconociendo a quien entró").

                  Y resuelve algo concreto: la respuesta es texto suelto del
                  mismo tamaño y color que el resto de la app, así que en una
                  conversación larga no hay forma de ver de un vistazo dónde
                  empieza cada una. El monograma marca ese arranque sin
                  convertir el texto en una burbuja. */}
              <span className="somm__marca" aria-hidden="true">
                <Logo size={34} />
              </span>
              <p className={`somm__texto${m.escribiendo ? " is-escribiendo" : ""}`}>{m.text}</p>

              {!m.error && !m.escribiendo && (
                <RespuestaAcciones
                  mensaje={m}
                  esUltima={m.id === idUltimaRespuesta && !preguntaEsFoto(m.id)}
                  ocupado={pensando}
                  onPulgar={darPulgar}
                  onOtra={otraOpcion}
                />
              )}

              {/* Sólo en la burbuja de error, y sólo si hay algo para
                  reintentar: vuelve a mandar la MISMA pregunta, no reabre el
                  campo para que la escribas de nuevo. */}
              {m.error && (m.retry || (m.retryFoto && ultimaFotoRef.current)) && (
                <button
                  type="button"
                  className="somm__reintentar"
                  onClick={() => {
                    trackEvent("sommelier_retry");
                    if (m.retryFoto) preguntar(m.retryFoto.texto, { foto: ultimaFotoRef.current });
                    else preguntar(m.retry);
                  }}
                  disabled={pensando}
                >
                  <Icon name="refresh" size={14} />
                  Reintentar
                </button>
              )}

              {/* El sommelier hace mérito al nombre: si detectó que la
                  persona quiere un PLATO concreto (no sólo una categoría de
                  comida), acá está el botón para pedirlo — la receta en sí
                  llega recién si se toca, nunca sola (ver pedirReceta). */}
              {m.recipeWine && (
                <button
                  type="button"
                  className="somm__receta"
                  onClick={() => pedirReceta(m)}
                  disabled={recetaLoadingId === m.id}
                >
                  {recetaLoadingId === m.id ? (
                    <>
                      <span className="somm__spin" aria-hidden="true" />
                      Pensando qué le va…
                    </>
                  ) : (
                    <>
                      <Icon name="utensils" size={15} />
                      {m.receta
                        ? m.receta.dish
                        : recetaFailedId === m.id
                          ? "Reintentar la receta"
                          : "Qué cocinar para acompañarla"}
                    </>
                  )}
                </button>
              )}
              {recetaFailedId === m.id && recetaLoadingId !== m.id && (
                <p className="somm__receta-error">No se pudo armar la receta ahora.</p>
              )}

              {/* ── LO QUE TENÉS ──────────────────────────────────────────
                  Las botellas que el modelo eligió de tu bodega, dibujadas
                  igual que en Mi Bodega y en la ficha: misma tarjeta, misma
                  foto, mismo "×3" del stock. Que el mismo vino se vea igual en
                  todas las pantallas es lo que hace que la app se sienta una
                  sola cosa y no tres pantallas del mismo proyecto. */}
              {recorteDeVinos(m, verTodos.has(m.id)).bodega.length > 0 && (
                <>
                  <p className="somm__rotulo">De tu bodega</p>
                  <ul className="somm__lista">
                    {recorteDeVinos(m, verTodos.has(m.id)).bodega.map((wine) => (
                      <li
                        key={wine._id}
                        className="suggestion-card"
                        data-wine-type={wine.type || undefined}
                        onClick={() => navigate(`/vino/${wine._id}`, { state: { wine } })}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) =>
                          e.key === "Enter" && navigate(`/vino/${wine._id}`, { state: { wine } })
                        }
                      >
                        <div className="suggestion-card__image">
                          <WinePhoto src={wine.image} type={wine.type} alt={wine.name} artSize={92} />
                        </div>
                        <div className="suggestion-card__body">
                          <p className="suggestion-card__name">{wine.name}</p>
                          {wine.winery && <p className="suggestion-card__winery">{wine.winery}</p>}
                          <div className="suggestion-card__meta">
                            <WineMeta type={wine.type} varietal={wine.varietal} vintage={wine.vintage} />
                            {wine.quantity > 0 && (
                              <span className="suggestion-card__stock">×{wine.quantity}</span>
                            )}
                          </div>
                          {wine.rating > 0 && <StarRating value={wine.rating} size="sm" />}
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {/* Las tarjetas llegan después del texto, así que el lugar donde
                  van se anuncia en vez de aparecer de golpe y empujar lo que se
                  está leyendo. Dos barras y no un spinner: dicen QUÉ viene. */}
              {m.buscandoVinos && (
                <div className="somm__vinos-cargando" aria-hidden="true">
                  <span />
                  <span />
                </div>
              )}

              {/* ── LO QUE NO ────────────────────────────────────────────── */}
              {recorteDeVinos(m, verTodos.has(m.id)).nuevos.length > 0 && (
                <>
                  <p className="somm__rotulo">Para descubrir</p>
                  <ul className="somm__lista">
                    {recorteDeVinos(m, verTodos.has(m.id)).nuevos.map((wine) => (
                      <li
                        key={wine.id}
                        className="discover-card"
                        data-wine-type={wine.type || undefined}
                      >
                        <div className="discover-card__row">
                          <button
                            type="button"
                            className="discover-card__main"
                            onClick={() => openCatalog(wine)}
                          >
                            <span className="discover-card__thumb">
                              <WinePhoto src={wine.image} type={wine.type} alt={wine.name} artSize={48} />
                            </span>
                            <span className="discover-card__body">
                              <span className="discover-card__name">{wine.name}</span>
                              <span className="discover-card__winery">{wine.winery}</span>
                              <WineMeta
                                className="discover-card__meta"
                                type={wine.type}
                                varietal={wine.varietal}
                                vintage={wine.vintage}
                                region={wine.region}
                              />
                            </span>
                            <Icon name="chevron-right" size={18} className="discover-card__caret" />
                          </button>

                          <button
                            type="button"
                            className={`discover-card__add ${addedIds.has(wine.id) ? "is-added" : ""}`}
                            onClick={() => handleWant(wine)}
                            disabled={addingId === wine.id || addedIds.has(wine.id)}
                            aria-label={`Guardar ${wine.name} en Quiero probar`}
                            title="Quiero probar"
                          >
                            {addedIds.has(wine.id) ? <Icon name="check" size={16} /> : <Icon name="heart" size={16} />}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {recorteDeVinos(m, verTodos.has(m.id)).ocultos > 0 && (
                <button
                  type="button"
                  className="somm__ver-mas"
                  onClick={() => setVerTodos((prev) => new Set(prev).add(m.id))}
                >
                  Ver {recorteDeVinos(m, false).ocultos} más
                  <Icon name="chevron-down" size={16} />
                </button>
              )}
            </div>
          )
        )}

        {/* Pensando. Una línea con el ritmo de una respiración y sin puntitos
            de chat: dice que hay algo en camino sin imitar a nadie escribiendo.
            Cambia de frase pasados PENSANDO_LARGO_MS: "Buscando…" quieto por
            más de cuatro segundos deja de leerse como "está pensando" y
            empieza a leerse como "se colgó", aunque adentro (ver
            sommelier.service.js) todavía esté dentro de lo esperado. */}
        {pensando && !mensajes.some((m) => m.escribiendo) && (
          <p className="somm__pensando" role="status">
            <span className="somm__pensando-punto" aria-hidden="true" />
            {pensandoLargo ? "Sigue pensando, ya casi…" : "Buscando la mejor respuesta…"}
          </p>
        )}

        <div ref={finRef} aria-hidden="true" />
      </div>

      {/* ══ EL COMPOSITOR, ABAJO ═════════════════════════════════════════════
          Donde está el pulgar y donde lo espera cualquiera que haya usado un
          teléfono. Arriba —donde estaba— obligaba a subir la vista para
          escribir y bajarla para leer, en cada turno.

          Antes de tener conversación de verdad no lleva las repreguntas que
          proponía el modelo turno a turno —eso era "una fila de pastillas
          nueva debajo de otra que ya se acababa de leer", y se sacó por
          amontonarse—, pero sí conserva una tira FIJA, sólo en el arranque:
          ejemplos de todo lo que NO es maridaje —tu bodega, el clima de hoy,
          un regalo— pegados arriba del campo, que es lo último que se lee
          antes de escribir. Se esconde apenas arranca la conversación.

          Adentro de la conversación, en cambio, SÍ vuelven las repreguntas —
          pero UNA fila, la de la última respuesta, en el mismo lugar fijo de
          siempre en vez de una nueva cada vez: eso resuelve el amontonamiento
          sin tirar lo que el modelo ya pensó (ver `repreguntas` más arriba). */}
      <div className="somm__pie" ref={pieRef}>

        {mensajes.length > 0 && !pensando && repreguntas?.length > 0 && (
          <div className="somm__rail">
            {repreguntas.map((r) => (
              <Chip
                key={r}
                className="somm__chip"
                onClick={() => {
                  trackEvent("sommelier_followup_click");
                  preguntar(r);
                }}
              >
                {r}
              </Chip>
            ))}
          </div>
        )}

        {/* ── SIN <form> A PROPÓSITO ────────────────────────────────────────
            Era un <form onSubmit>, y ESE es el motivo de la barra rara arriba
            del teclado que se reportó ("ese tilde que no tiene sentido"): Safari
            en iOS le agrega a cualquier campo adentro de un <form> su propia
            barra de navegación de formulario —flechas para saltar de campo en
            campo y un botón de "Listo"—, pensada para loguearse o completar una
            dirección, no para escribir en un chat. Ningún chat "de verdad"
            (WhatsApp, Instagram, y los otros asistentes de IA) mete el campo
            adentro de un form, y por eso el suyo se siente nativo y el nuestro
            no.
            Enviar sigue andando igual: el botón dispara `enviar()` directo, y
            Enter en el teclado lo hace vía `onKeyDown` — sin necesitar un
            submit de formulario para ninguno de los dos caminos. */}
        <div className="somm__campo">
          {/* La cámara, adentro de la cápsula y a la izquierda, como en los chats de IA. El
              selector es nativo y oculto: en el teléfono ofrece la cámara o la galería. */}
          <button
            type="button"
            className="somm__foto"
            onClick={abrirSelectorDeFoto}
            disabled={pensando}
            aria-label="Mandar una foto de un menú o de un plato"
          >
            <Icon name="camera" size={20} />
          </button>
          <input
            ref={fotoRef}
            type="file"
            accept="image/*"
            hidden
            onChange={alElegirFoto}
          />
          {/* `<textarea>` y no `<input>`: una pregunta de más de un renglón
              se escribía scrolleando horizontalmente, invisible mientras se
              tipea (ver el efecto de auto-alto más arriba). `rows={1}` es
              sólo el punto de partida — el efecto la estira sola.
              Enter manda, Shift+Enter mete un salto de línea: la misma
              convención que Slack, Gmail y cualquier chat con más de un
              renglón para escribir. */}
          <textarea
            ref={inputRef}
            className="somm__input"
            rows={1}
            /* Nombra la consulta más frecuente ANTES que la genérica: un campo
               que sólo dice "preguntá lo que quieras" no le hace pensar a nadie
               en escribir "milanesas", que es justo lo que mejor contesta.

               Terminaba en "saber", y esa palabra sola lo pasaba de renglón: a
               375px el campo mide 41px de alto y el texto pedía 62, así que lo
               primero que se veía al entrar era un placeholder cortado al
               medio. "Lo que quieras" ya dice lo mismo y entra. Medido, no
               estimado. */
            placeholder={placeholder}
            onFocus={() => setCampoEnfocado(true)}
            onBlur={() => setCampoEnfocado(false)}
            aria-label="Tu consulta"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                preguntar(texto);
              }
            }}
            enterKeyHint="send"
            maxLength={300}
            autoComplete="off"
          />
          <button
            type="button"
            className="somm__enviar"
            onClick={() => preguntar(texto)}
            disabled={texto.trim().length < 3 || pensando}
            aria-label="Enviar consulta"
          >
            {pensando ? (
              <span className="somm__spin" aria-hidden="true" />
            ) : (
              <Icon name="send" size={18} />
            )}
          </button>
        </div>
      </div>

      {/* La misma hoja que usa la ficha del vino (WinePlan): que una receta
          se vea igual la pida el Sommelier o la ficha es lo que hace que las
          dos se sientan la misma app y no dos features que no se hablan. */}
      {recetaAbiertaId &&
        (() => {
          const m = mensajes.find((x) => x.id === recetaAbiertaId);
          return m?.receta ? (
            <WineRecipeSheet
              receta={m.receta}
              wine={m.recipeWine}
              onClose={() => setRecetaAbiertaId(null)}
            />
          ) : null;
        })()}

      {/* En la barra superior: el menú de conversaciones a la izquierda y "nueva" a la
          derecha, antes del avatar. Sólo en el teléfono: en escritorio las conversaciones
          son una columna fija y esos controles viven adentro de ella. */}
      {barraIzq &&
        createPortal(
          <button
            type="button"
            className="somm-icono"
            aria-label="Ver conversaciones"
            onClick={() => setHistorialAbierto(true)}
          >
            <Icon name="menu" size={22} />
          </button>,
          barraIzq
        )}
      {barraDer &&
        createPortal(
          <button
            type="button"
            className="somm-icono"
            aria-label="Nueva conversación"
            disabled={mensajes.length === 0}
            onClick={nuevaConversacion}
          >
            <Icon name="compose" size={21} />
          </button>,
          barraDer
        )}

      <SommelierChats
        abierto={historialAbierto}
        onClose={() => setHistorialAbierto(false)}
        activoId={conversacionId}
        // Cada respuesta nueva cambia la charla activa o su largo: el panel se refresca.
        version={`${conversacionId}:${mensajes.length}`}
        onAbrir={abrirConversacion}
        onNueva={nuevaConversacion}
        onBorrada={alBorrarConversacion}
        onBorradasTodas={alBorrarTodas}
      />
    </div>
  );
}
