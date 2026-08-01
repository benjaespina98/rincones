import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PromoCard from "./PromoCard";
import { trackPromoClick, trackPromoImpression } from "../services/promotionsApi";
import { trackEvent } from "../services/analyticsApi";
import { tapHaptic } from "../utils/haptics";
import "./PromoCarousel.css";

/**
 * El espacio destacado de Descubrí: eventos reales y publicidades.
 *
 * ── LAS DECISIONES QUE LO HACEN PROFESIONAL Y NO MOLESTO ────────────────────
 *
 * 1. LO PAGO SE DECLARA PAGO. Lo resuelve PromoCard, que es la misma tarjeta que
 *    se ve en la vista previa del panel.
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
 * 4. SE PUEDE MANEJAR A MANO. Puntos para ir directo, swipe nativo en celular y
 *    foco por teclado. El movimiento automático es una cortesía, nunca la única
 *    forma de ver algo.
 *
 * 5. NO DEJA UN HUECO. Sin campañas al aire no renderiza nada y Descubrí sigue
 *    mostrando su contenido curado: la pantalla nunca queda con un espacio vacío
 *    esperando publicidad que no existe.
 *
 * ── QUÉ CUENTA COMO IMPRESIÓN ───────────────────────────────────────────────
 * Una tarjeta que existe en el DOM no es una tarjeta que alguien vio. El carrusel
 * está arriba de todo pero puede quedar bajo el borde de la pantalla, y contar una
 * impresión por eso sería cobrarle a un anunciante por algo que no pasó. Se cuenta
 * cuando la tarjeta estuvo AL MENOS A LA MITAD A LA VISTA DURANTE UN SEGUNDO
 * seguido, que es el criterio que usa la industria, y una sola vez por tarjeta y
 * por visita: si no, la rotación automática sumaría una impresión cada seis
 * segundos y el número diría cuánto tiempo alguien dejó la pestaña abierta.
 *
 * ── SWIPE SIN LIBRERÍA ──────────────────────────────────────────────────────
 * El desplazamiento es `overflow-x` con `scroll-snap` del CSS. Trae gratis el
 * gesto nativo, la inercia del sistema y el comportamiento correcto en cada
 * plataforma —cosas que una implementación a mano con eventos de touch imita mal
 * y termina peleando con el scroll vertical de la página—.
 */

/** Cada cuánto pasa a la siguiente. Suficiente para leer un título y bajada. */
const INTERVALO_MS = 6500;

/** Cuánto tiene que estar a la vista para que cuente como vista. */
const MS_PARA_CONTAR = 1000;

const prefiereQuieto = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

export default function PromoCarousel({ promos = [] }) {
  const pistaRef = useRef(null);
  const [activo, setActivo] = useState(0);
  const [pausado, setPausado] = useState(false);
  // Se lee una vez al montar y no en cada render: el valor no cambia solo.
  const [quieto] = useState(prefiereQuieto);
  // Sin IntersectionObserver (navegador viejo) se asume visible desde el arranque:
  // perder TODAS las impresiones es peor que contar alguna que quedó abajo del
  // borde de la pantalla.
  const [aLaVista, setALaVista] = useState(
    () => typeof IntersectionObserver === "undefined"
  );
  const vistas = useRef(new Set());

  const total = promos.length;

  /**
   * Visibilidad real de la sección. Es la puerta de entrada del conteo: sin esto
   * una tarjeta que nunca entró en pantalla contaría igual.
   */
  useEffect(() => {
    const pista = pistaRef.current;
    if (!pista || typeof IntersectionObserver === "undefined") return undefined;

    const observer = new IntersectionObserver(
      ([entrada]) => setALaVista(entrada.isIntersecting),
      { threshold: 0.5 }
    );
    observer.observe(pista);
    return () => observer.disconnect();
  }, []);

  /**
   * Impresión: una sola vez por tarjeta y por visita, y sólo si la tarjeta se
   * sostuvo a la vista. El temporizador se cancela al cambiar de tarjeta o al
   * salir de pantalla, así que pasar de largo scrolleando no cuenta.
   */
  useEffect(() => {
    const promo = promos[activo];
    if (!aLaVista || !promo?._id || vistas.current.has(promo._id)) return undefined;

    const timer = setTimeout(() => {
      vistas.current.add(promo._id);
      trackPromoImpression(promo._id);
    }, MS_PARA_CONTAR);

    return () => clearTimeout(timer);
  }, [activo, promos, aLaVista]);

  const irA = useCallback(
    (indice) => {
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
    },
    [total]
  );

  // Rotación automática. Se apaga con una sola tarjeta (no hay a dónde ir),
  // mientras el usuario está encima, si pidió menos movimiento y cuando el
  // carrusel no está a la vista: rotar algo que nadie está mirando gasta batería
  // y hace que al volver la persona encuentre una tarjeta que nunca eligió.
  useEffect(() => {
    if (total <= 1 || pausado || quieto || !aLaVista) return undefined;

    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      irA(activo + 1);
    }, INTERVALO_MS);

    return () => clearInterval(id);
  }, [activo, total, pausado, quieto, aLaVista, irA]);

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

  /**
   * Registra el clic. NO navega: de eso se encarga el <a href> de la tarjeta.
   *
   * Antes esta función hacía las dos cosas, y en ese orden: primero contaba, y
   * después llamaba a `window.open`. Cualquier cosa que fallara al contar —una
   * extensión que corta el pedido, un error de red— se llevaba puesta la
   * navegación, y el anunciante terminaba pagando por una tarjeta que al tocarla
   * no hacía nada. Ahora el conteo es lo accesorio y llegar es lo que no se
   * negocia.
   *
   * El clic se cuenta sólo si LLEVA a algún lado: un toque sobre una tarjeta que
   * no navega infla el número con algo que no le sirvió a nadie, y el clic es
   * justo el dato que el anunciante mira.
   */
  const registrarClic = (promo) => {
    if (!String(promo.url || "").trim()) return;

    tapHaptic();
    trackPromoClick(promo._id);
    trackEvent("promo_click", { id: promo._id, kind: promo.kind, title: promo.title });
  };

  // Va ANTES del corte de abajo: los hooks no pueden quedar detrás de un return
  // condicional, o el orden cambia entre renders y React pierde el hilo del
  // estado. Es la regla que rompe silenciosamente cuando `promos` pasa de vacío
  // a tener contenido, que es justo lo que hace esta pantalla al cargar.
  const etiquetaViva = useMemo(
    () => `Destacado ${activo + 1} de ${total}: ${promos[activo]?.title || ""}`,
    [activo, total, promos]
  );

  // Sin nada al aire no hay hueco: la sección simplemente no existe.
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
          <PromoCard
            key={promo._id}
            promo={promo}
            onOpen={registrarClic}
            // Las que no se ven quedan fuera del recorrido por teclado: tabular
            // por tarjetas invisibles es desorientador.
            interactive={i === activo}
          />
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
