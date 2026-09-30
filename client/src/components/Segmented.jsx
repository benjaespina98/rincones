import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * El segmentado de "elegí una vista entre pocas, con su número al lado" —
 * estaba construido dos veces con el mismo marcado (Bodega y Guardados),
 * sólo con las opciones cambiadas. Un tercer lugar que necesite lo mismo ya
 * no tiene que copiarlo de nuevo.
 *
 * `options`: [{ id, label (string o nodo), count?, title? }]
 *
 * ── EL ACTIVO SIEMPRE SE VE ────────────────────────────────────────────────
 * Desde que Mi Bodega tiene varias vistas, la cápsula puede no entrar entera
 * en un teléfono y se desplaza (ver `.segmented` en App.css). Sin esto, entrar
 * por un enlace a la última dejaba la lista mostrando algo cuyo botón estaba
 * fuera de pantalla: el usuario ve vinos que no pidió y el control que lo
 * explica no está a la vista.
 *
 * ── POR QUÉ EL INDICADOR SE MUEVE Y NO SE PRENDE ───────────────────────────
 * Antes el activo se pintaba con un fondo en su propio botón: al cambiar de
 * pestaña, uno se apagaba y el otro se prendía. Eso no dice de dónde venís ni
 * a dónde fuiste — son dos eventos sueltos. Un indicador que se DESLIZA cuenta
 * el movimiento, y de paso hace que la cápsula se lea como un solo control en
 * vez de tres botones pegados.
 *
 * Se anima con `transform` sobre un elemento único y absoluto, nunca con el
 * `background` de cada botón: mover una caja es lo más barato que sabe hacer un
 * navegador, y prender fondos obliga a repintar los tres.
 *
 * La posición se mide del DOM y no se calcula: los botones tienen anchos
 * distintos —"Favoritos" mide más que "En stock", y el número de al lado
 * cambia con los datos— así que cualquier cuenta a mano se rompe en cuanto
 * alguien carga un vino. Se remide con `ResizeObserver` porque el ancho cambia
 * sin que cambie `value`: al cargar los conteos, al rotar el teléfono, al
 * cambiar el tamaño de fuente del sistema.
 */
export default function Segmented({ options, value, onChange, ariaLabel, className = "" }) {
  const contenedorRef = useRef(null);
  const activoRef = useRef(null);
  const [indicador, setIndicador] = useState(null);

  const medir = useCallback(() => {
    const btn = activoRef.current;
    const cont = contenedorRef.current;
    if (!btn || !cont) return;
    // `offsetLeft` y no `getBoundingClientRect`: la cápsula scrollea, y el rect
    // viaja con el scroll mientras el indicador vive adentro del mismo
    // contenedor desplazado. Con offsets los dos se mueven juntos.
    setIndicador({ left: btn.offsetLeft, width: btn.offsetWidth });
  }, []);

  // `useLayoutEffect`: si se midiera después del pintado, el indicador
  // aparecería un frame en la posición vieja y saltaría. Se ve.
  useLayoutEffect(medir, [medir, value, options]);

  useEffect(() => {
    const cont = contenedorRef.current;
    if (!cont || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(medir);
    ro.observe(cont);
    for (const hijo of cont.children) ro.observe(hijo);
    return () => ro.disconnect();
  }, [medir, options]);

  /**
   * El botón activo se mantiene a la vista DENTRO de la cápsula.
   *
   * ── POR QUÉ NO ES UN scrollIntoView ────────────────────────────────────────
   * Lo era, con `block: "nearest"` justamente para no tocar el scroll vertical.
   * No alcanza: `scrollIntoView` recorre TODOS los ancestros que scrollean, y
   * cuando la cápsula está pegada arriba (`position: sticky`, como en la barra
   * de secciones de la ficha del vino) el navegador usa la posición estática
   * del elemento —la de antes de pegarse— y manda la página ahí.
   *
   * Se veía así: tocabas "Comunidad", la página saltaba abajo, y antes de que
   * terminara el movimiento volvía sola al lugar donde arranca la barra. El
   * componente que llamaba no tenía forma de enterarse; el salto lo deshacía
   * este efecto, tres archivos más allá. Medido en el navegador: el scroll iba
   * a 1914 y volvía a 569, que es exactamente donde empieza la cápsula.
   *
   * Moviendo `scrollLeft` a mano se hace lo único que se quería —correr la
   * cápsula de costado— y no se puede tocar el scroll de nadie más.
   */
  useEffect(() => {
    const cont = contenedorRef.current;
    const btn = activoRef.current;
    if (!cont || !btn) return;
    const izq = btn.offsetLeft;
    const der = izq + btn.offsetWidth;
    const visibleIzq = cont.scrollLeft;
    const visibleDer = visibleIzq + cont.clientWidth;
    if (izq < visibleIzq) cont.scrollLeft = izq - 12;
    else if (der > visibleDer) cont.scrollLeft = der - cont.clientWidth + 12;
  }, [value]);

  return (
    <div
      ref={contenedorRef}
      className={`segmented ${className}`.trim()}
      role="group"
      aria-label={ariaLabel}
    >
      {/* Decorativo: lo que anuncia el estado es `aria-pressed` de cada botón. */}
      {indicador && (
        <span
          className="segmented__indicador"
          aria-hidden="true"
          style={{
            transform: `translateX(${indicador.left}px)`,
            width: `${indicador.width}px`,
          }}
        />
      )}
      {options.map((opt) => {
        const activo = value === opt.id;
        return (
          <button
            key={opt.id}
            ref={activo ? activoRef : null}
            type="button"
            className={`segmented__btn ${activo ? "is-active" : ""}`}
            aria-pressed={activo}
            title={opt.title}
            onClick={() => onChange(opt.id)}
          >
            {opt.label}
            {opt.count > 0 && <span className="segmented__n">{opt.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
