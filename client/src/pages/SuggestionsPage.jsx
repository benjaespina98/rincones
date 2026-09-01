import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useWishlist } from "../hooks/useWishlist";
import { useToast } from "../context/ToastContext";
import { searchWines } from "../services/wineSearchApi";
import { getSuggestedWines } from "../services/wineApi";
import { preguntarAlSommelier, mensajeDeError } from "../services/sommelierApi";
import { resolveFood } from "../data/foodSynonyms";
import { wineKey } from "../utils/text";
import Icon from "../components/Icon";
import StarRating from "../components/StarRating";
import WinePhoto from "../components/WinePhoto";
import WineMeta from "../components/WineMeta";
import { FOOD_PAIRINGS } from "../data/wineReference";
import { tapHaptic } from "../utils/haptics";
import { trackEvent } from "../services/analyticsApi";
import "../styles/pages/SuggestionsPage.css";

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
const COMIDAS = [
  { label: "Asado", pregunta: "¿Qué tomo con un asado?" },
  { label: "Pasta", pregunta: "¿Qué tomo con pasta?" },
  { label: "Pizza", pregunta: "¿Qué tomo con pizza?" },
  { label: "Milanesas", pregunta: "¿Qué tomo con milanesas?" },
];

const OTRAS_PREGUNTAS = [
  { label: "¿Qué vinos tengo?", pregunta: "¿Qué vinos tengo?" },
  { label: "¿Qué tomo con este clima?", pregunta: "¿Qué tomo hoy con este clima?" },
  { label: "¿Cuál abro hoy?", pregunta: "¿Cuál abro hoy?" },
  { label: "Malbec o Cabernet", pregunta: "Malbec o Cabernet" },
  { label: "Un tinto para regalar", pregunta: "Un tinto para regalar" },
];

let contador = 0;
const nuevoId = () => `m${(contador += 1)}`;

export default function SuggestionsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addWish } = useWishlist();
  const { showError, showSuccess } = useToast();

  // El nombre de pila, con la misma cascada que ya usa el resto de la app para
  // firmar algo con quien sos (ver `author.name` en catalog.controller.js): si
  // todavía no lo pusiste, la parte del mail antes de la arroba. Sin ninguna de
  // las dos, mejor ningún nombre que uno inventado.
  const nombre = (user?.firstName || "").trim() || (user?.email || "").split("@")[0] || "";

  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [addingId, setAddingId] = useState(null);
  const [addedIds, setAddedIds] = useState(() => new Set());

  const finRef = useRef(null);
  const inputRef = useRef(null);

  /**
   * La conversación se sigue sola hacia abajo.
   *
   * Sin esto, la respuesta aparece fuera de la pantalla y hay que scrollear
   * para descubrir que llegó: la app parece no haber hecho nada. `end` y no
   * `center` para no dejar la última línea flotando en el medio.
   */
  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensajes, pensando]);

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
    async (pregunta) => {
      const limpia = pregunta.trim();
      if (limpia.length < 3 || pensando) return;

      tapHaptic();
      setTexto("");
      setPensando(true);

      // El historial que viaja son los mensajes que YA estaban: el nuevo va
      // aparte, como la pregunta. Se arma antes de tocar el estado para no
      // depender de que React haya aplicado el `set` de arriba.
      const previos = mensajes
        .filter((m) => !m.error)
        .map((m) => ({ role: m.role === "user" ? "user" : "assistant", text: m.text }));

      setMensajes((prev) => [...prev, { id: nuevoId(), role: "user", text: limpia }]);

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
      const comida = resolveFood(limpia);
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

      try {
        const data = await preguntarAlSommelier(limpia, previos);
        if (!data) throw new Error("sin respuesta");

        /**
         * El texto se pinta APENAS LLEGA, sin esperar a los vinos.
         *
         * Es lo que más cambia la sensación de velocidad: la respuesta es lo
         * que la persona vino a leer, y hacerla esperar a dos búsquedas de
         * catálogo que van abajo del texto es cobrarle a lo importante el
         * tiempo de lo accesorio. Las tarjetas aparecen solas un momento
         * después, debajo de algo que ya se está leyendo.
         */
        const id = nuevoId();
        setMensajes((prev) => [
          ...prev,
          {
            id,
            role: "guia",
            text: data.answer,
            wines: data.wines || [],
            descubrir: [],
            // Reserva el lugar del cargando sólo si de verdad va a haber algo.
            buscandoVinos: Boolean(comida) && !data.offTopic,
          },
        ]);
        // Se apaga acá y no al final: con el texto en pantalla ya no hay nada
        // que esperar para volver a preguntar, y dejar el campo bloqueado
        // mientras cargan unas tarjetas de abajo sería cobrarle a la persona el
        // tiempo de algo que ni siquiera está mirando.
        setPensando(false);
        trackEvent("sommelier_ask", { conVinos: (data.wines || []).length > 0 });

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
        // El error va COMO MENSAJE y no como un aviso que se va solo: es la
        // respuesta a lo que la persona acaba de preguntar, y tiene que quedar
        // en el lugar donde quedó la pregunta. Un toast dejaría la
        // conversación con una pregunta sin nada abajo.
        setMensajes((prev) => [
          ...prev,
          { id: nuevoId(), role: "guia", text: mensajeDeError(error), error: true },
        ]);
      } finally {
        setPensando(false);
      }
    },
    [mensajes, pensando, buscarParaDescubrir]
  );

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
    <div className="somm">
      <div className="somm__feed">
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
            <div className="somm__rail">
              {COMIDAS.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  className="somm__chip"
                  onClick={() => preguntar(c.pregunta)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {mensajes.map((m) =>
          m.role === "user" ? (
            <p key={m.id} className="somm__vos">
              {m.text}
            </p>
          ) : (
            <div key={m.id} className={`somm__resp ${m.error ? "is-error" : ""}`}>
              <p className="somm__texto">{m.text}</p>

              {/* ── LO QUE TENÉS ──────────────────────────────────────────
                  Las botellas que el modelo eligió de tu bodega, dibujadas
                  igual que en Mi Bodega y en la ficha: misma tarjeta, misma
                  foto, mismo "×3" del stock. Que el mismo vino se vea igual en
                  todas las pantallas es lo que hace que la app se sienta una
                  sola cosa y no tres pantallas del mismo proyecto. */}
              {m.wines?.length > 0 && (
                <>
                  <p className="somm__rotulo">De tu bodega</p>
                  <ul className="somm__lista">
                    {m.wines.map((wine) => (
                      <li
                        key={wine._id}
                        className="suggestion-card"
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
              {m.descubrir?.length > 0 && (
                <>
                  <p className="somm__rotulo">Para descubrir</p>
                  <ul className="somm__lista">
                    {m.descubrir.map((wine) => (
                      <li key={wine.id} className="discover-card">
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
            </div>
          )
        )}

        {/* Pensando. Una línea con el ritmo de una respiración y sin puntitos
            de chat: dice que hay algo en camino sin imitar a nadie escribiendo. */}
        {pensando && (
          <p className="somm__pensando" role="status">
            <span className="somm__pensando-punto" aria-hidden="true" />
            Buscando la mejor respuesta…
          </p>
        )}

        <div ref={finRef} aria-hidden="true" />
      </div>

      {/* ══ EL COMPOSITOR, ABAJO ═════════════════════════════════════════════
          Donde está el pulgar y donde lo espera cualquiera que haya usado un
          teléfono. Arriba —donde estaba— obligaba a subir la vista para
          escribir y bajarla para leer, en cada turno.

          Ya no lleva las repreguntas que proponía el modelo después de cada
          respuesta —una fila de pastillas nueva debajo de otra que ya se
          acababa de leer, turno tras turno—, pero sí conserva una tira FIJA,
          sólo en el arranque: ejemplos de todo lo que NO es maridaje —tu
          bodega, el clima de hoy, un regalo— pegados arriba del campo, que es
          lo último que se lee antes de escribir. Se esconde apenas arranca la
          conversación, igual que el resto del arranque. */}
      <div className="somm__pie">
        {mensajes.length === 0 && (
          <div className="somm__rail">
            {OTRAS_PREGUNTAS.map((s) => (
              <button
                key={s.label}
                type="button"
                className="somm__chip"
                onClick={() => preguntar(s.pregunta)}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        <form
          className="somm__campo"
          onSubmit={(e) => {
            e.preventDefault();
            preguntar(texto);
          }}
        >
          <input
            ref={inputRef}
            type="text"
            className="somm__input"
            /* Nombra la consulta más frecuente ANTES que la genérica: un campo
               que sólo dice "preguntá lo que quieras" no le hace pensar a nadie
               en escribir "milanesas", que es justo lo que mejor contesta. */
            placeholder="Qué vas a comer, o lo que quieras saber"
            aria-label="Tu consulta"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            enterKeyHint="send"
            maxLength={300}
          />
          <button
            type="submit"
            className="somm__enviar"
            disabled={texto.trim().length < 3 || pensando}
            aria-label="Enviar consulta"
          >
            {pensando ? (
              <span className="somm__spin" aria-hidden="true" />
            ) : (
              <Icon name="send" size={18} />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
