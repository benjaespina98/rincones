import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "./Icon";
import { trackPromoClick, trackPromoImpression } from "../services/promotionsApi";
import { trackEvent } from "../services/analyticsApi";
import { tapHaptic } from "../utils/haptics";
import "./PromoCarousel.css";

/**
 * El espacio destacado de Descubrí: eventos reales y publicidades.
 *
 * ── LAS DECISIONES QUE LO HACEN PROFESIONAL Y NO MOLESTO ────────────────────
 *
 * 1. LO PAGO SE DECLARA PAGO. Una tarjeta con `sponsored` lleva el cartel
 *    "Publicidad", siempre y sin excepción. No es un requisito legal a
 *    regañadientes: es lo que mantiene creíble a TODO lo demás de la pantalla.
 *    El día que el usuario no sepa si una recomendación es una recomendación,
 *    dejó de confiar en la app entera.
 *
 * 2. LA ROTACIÓN NO PELEA CON EL USUARIO. Se pausa al pasar el dedo o el mouse,
 *    al enfocar con teclado y mientras la pestaña está en segundo plano. Un
 *    carrusel que se mueve mientras estás leyendo es la razón por la que la gente
 *    odia los carruseles.
 *
 * 3. RESPETA "menos movimiento". Con `prefers-reduced-motion` no rota sola: las
 *    flechas y los puntos quedan, el automatismo no. Para quien tiene vértigo o
 *    trastornos vestibulares, una animación que no pidió no es un detalle.
 *
 * 4. SE PUEDE MANEJAR A MANO. Puntos para ir directo, flechas en escritorio,
 *    swipe nativo en celular y foco por teclado. El movimiento automático es una
 *    cortesía, nunca la única forma de ver algo.
 *
 * 5. NO DEJA UN HUECO. Sin campañas cargadas no renderiza nada y Descubrí sigue
 *    mostrando su contenido curado: la pantalla nunca queda con un espacio vacío
 *    esperando publicidad que no existe.
 *
 * ── SWIPE SIN LIBRERÍA ──────────────────────────────────────────────────────
 * El desplazamiento es `overflow-x` con `scroll-snap` del CSS. Trae gratis el
 * gesto nativo, la inercia del sistema y el comportamiento correcto en cada
 * plataforma —cosas que una implementación a mano con eventos de touch imita mal
 * y termina peleando con el scroll vertical de la página—.
 */

/** Cada cuánto pasa a la siguiente. Suficiente para leer un título y bajada. */
const INTERVALO_MS = 6500;

const prefiereQuieto = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** Fecha del evento en lenguaje corto: "12 de octubre". */
const fechaCorta = (valor) => {
  if (!valor) return "";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "long" });
};

/** Lugar · fecha, lo concreto primero. Vacío si la tarjeta no tiene ninguno. */
const subtitulo = (promo) => {
  const partes = [
    promo.place?.venue || promo.place?.city,
    fechaCorta(promo.eventAt),
  ];
  return partes.filter(Boolean).join(" · ");
};

export default function PromoCarousel({ promos = [] }) {
  const navigate = useNavigate();
  const pistaRef = useRef(null);
  const [activo, setActivo] = useState(0);
  const [pausado, setPausado] = useState(false);
  // Se lee una vez al montar y no en cada render: el valor no cambia solo.
  const [quieto] = useState(prefiereQuieto);
  const vistas = useRef(new Set());

  const total = promos.length;

  /**
   * Impresión: se cuenta una sola vez por tarjeta y por visita.
   *
   * Sin el `Set`, la rotación automática sumaría una impresión cada 6 segundos
   * indefinidamente y el número no significaría nada —le estarías reportando a un
   * anunciante cuánto tiempo dejó la pestaña abierta una persona—.
   */
  const registrarImpresion = useCallback((promo) => {
    if (!promo?._id || vistas.current.has(promo._id)) return;
    vistas.current.add(promo._id);
    trackPromoImpression(promo._id);
  }, []);

  useEffect(() => {
    if (promos[activo]) registrarImpresion(promos[activo]);
  }, [activo, promos, registrarImpresion]);

  const irA = useCallback((indice) => {
    const pista = pistaRef.current;
    if (!pista) return;
    const destino = ((indice % total) + total) % total;
    const tarjeta = pista.children[destino];
    if (tarjeta) {
      pista.scrollTo({
        left: tarjeta.offsetLeft - pista.offsetLeft,
        behavior: prefiereQuieto() ? "auto" : "smooth",
      });
    }
    setActivo(destino);
  }, [total]);

  // Rotación automática. Se apaga con una sola tarjeta (no hay a dónde ir),
  // mientras el usuario está encima y si pidió menos movimiento.
  useEffect(() => {
    if (total <= 1 || pausado || quieto) return undefined;

    const id = setInterval(() => {
      // En segundo plano no tiene sentido rotar: gasta batería y cuando el
      // usuario vuelve encuentra una tarjeta que nunca eligió.
      if (document.visibilityState !== "visible") return;
      irA(activo + 1);
    }, INTERVALO_MS);

    return () => clearInterval(id);
  }, [activo, total, pausado, quieto, irA]);

  /**
   * El índice sale del scroll y no de un contador propio: si no, al deslizar con
   * el dedo los puntos quedarían marcando otra tarjeta que la que se ve.
   */
  const onScroll = () => {
    const pista = pistaRef.current;
    if (!pista) return;
    const centro = pista.scrollLeft + pista.clientWidth / 2;
    let cerca = 0;
    let menor = Infinity;
    for (let i = 0; i < pista.children.length; i += 1) {
      const hijo = pista.children[i];
      const medio = hijo.offsetLeft - pista.offsetLeft + hijo.clientWidth / 2;
      const dist = Math.abs(medio - centro);
      if (dist < menor) {
        menor = dist;
        cerca = i;
      }
    }
    if (cerca !== activo) setActivo(cerca);
  };

  const abrir = (promo) => {
    tapHaptic();
    trackPromoClick(promo._id);
    trackEvent("promo_click", { id: promo._id, kind: promo.kind, title: promo.title });

    const destino = String(promo.url || "").trim();
    if (!destino) return;

    // Un enlace interno navega dentro de la app; uno externo abre pestaña nueva
    // y no se lleva puesta la sesión de nadie (`noopener`).
    if (destino.startsWith("/")) navigate(destino);
    else window.open(destino, "_blank", "noopener,noreferrer");
  };

  // Va ANTES del corte de abajo: los hooks no pueden quedar detrás de un return
  // condicional, o el orden cambia entre renders y React pierde el hilo del
  // estado. Es la regla que rompe silenciosamente cuando `promos` pasa de vacío
  // a tener contenido, que es justo lo que hace esta pantalla al cargar.
  const etiquetaViva = useMemo(
    () => `Destacado ${activo + 1} de ${total}: ${promos[activo]?.title || ""}`,
    [activo, total, promos]
  );

  // Sin nada vigente no hay hueco: la sección simplemente no existe.
  if (total === 0) return null;

  return (
    <section
      className="promos"
      aria-roledescription="carrusel"
      aria-label="Eventos y destacados"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocusCapture={() => setPausado(true)}
      onBlurCapture={() => setPausado(false)}
      onTouchStart={() => setPausado(true)}
    >
      <div className="promos__track" ref={pistaRef} onScroll={onScroll}>
        {promos.map((promo, i) => (
          <article
            key={promo._id}
            className={`promo ${promo.sponsored ? "is-sponsored" : ""}`}
            style={promo.accent ? { "--promo-accent": promo.accent } : undefined}
            // Las que no se ven quedan fuera del recorrido por teclado: tabular
            // por tarjetas invisibles es desorientador.
            aria-hidden={i !== activo ? "true" : undefined}
          >
            {promo.image && (
              <img
                className="promo__bg"
                src={promo.image}
                alt=""
                loading="lazy"
                decoding="async"
              />
            )}

            <div className="promo__body">
              <span className="promo__kicker">
                {promo.sponsored ? (
                  // El cartel de publicidad va primero y sin eufemismos.
                  <span className="promo__adtag">Publicidad</span>
                ) : (
                  <>
                    <Icon name={promo.kind === "event" ? "calendar" : "sparkle"} size={12} />
                    {promo.kind === "event" ? "Evento" : "Destacado"}
                  </>
                )}
                {promo.sponsor?.name && (
                  <span className="promo__sponsor">{promo.sponsor.name}</span>
                )}
              </span>

              <h3 className="promo__title">{promo.title}</h3>
              {promo.summary && <p className="promo__summary">{promo.summary}</p>}

              <div className="promo__foot">
                {subtitulo(promo) && <span className="promo__meta">{subtitulo(promo)}</span>}
                {promo.url && (
                  <button
                    type="button"
                    className="promo__cta"
                    onClick={() => abrir(promo)}
                    tabIndex={i === activo ? 0 : -1}
                  >
                    {promo.ctaLabel || "Ver más"}
                    <Icon name="arrow-right" size={15} />
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      {total > 1 && (
        <div className="promos__nav">
          {/* Los puntos son botones de verdad, no adorno: llevan a su tarjeta. */}
          <div className="promos__dots" role="tablist" aria-label="Elegir destacado">
            {promos.map((promo, i) => (
              <button
                key={promo._id}
                type="button"
                role="tab"
                aria-selected={i === activo}
                aria-label={`Ver: ${promo.title}`}
                className={`promos__dot ${i === activo ? "is-active" : ""}`}
                onClick={() => irA(i)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Para lector de pantalla: qué tarjeta está a la vista ahora. Sin esto, la
          rotación automática es un cambio silencioso de contenido. */}
      <span className="sr-only" aria-live="polite">{etiquetaViva}</span>
    </section>
  );
}
