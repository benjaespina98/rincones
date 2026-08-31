import { useEffect, useRef } from "react";

/**
 * El segmentado de "elegí una vista entre pocas, con su número al lado" —
 * estaba construido dos veces con el mismo marcado (Bodega y Guardados),
 * sólo con las opciones cambiadas. Un tercer lugar que necesite lo mismo ya
 * no tiene que copiarlo de nuevo.
 *
 * `options`: [{ id, label (string o nodo), count?, title? }]
 *
 * ── EL ACTIVO SIEMPRE SE VE ────────────────────────────────────────────────
 * Desde que Mi Bodega tiene cuatro vistas, la cápsula puede no entrar entera
 * en un teléfono y se desplaza (ver `.segmented` en App.css). Sin esto, entrar
 * por un enlace a la última —/guardados manda a "Quiero probar"— dejaba la
 * lista mostrando algo cuyo botón estaba fuera de pantalla: el usuario ve
 * vinos que no pidió y el control que lo explica no está a la vista.
 *
 * `block: "nearest"` para no arrastrar la página entera: lo único que tiene
 * que moverse es la tira.
 */
export default function Segmented({ options, value, onChange, ariaLabel, className = "" }) {
  const activoRef = useRef(null);

  useEffect(() => {
    activoRef.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [value]);

  return (
    <div className={`segmented ${className}`.trim()} role="group" aria-label={ariaLabel}>
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
