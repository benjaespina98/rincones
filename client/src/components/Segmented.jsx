/**
 * El segmentado de "elegí una vista entre pocas, con su número al lado" —
 * estaba construido dos veces con el mismo marcado (Bodega y Guardados),
 * sólo con las opciones cambiadas. Un tercer lugar que necesite lo mismo ya
 * no tiene que copiarlo de nuevo.
 *
 * `options`: [{ id, label (string o nodo), count?, title? }]
 */
export default function Segmented({ options, value, onChange, ariaLabel, className = "" }) {
  return (
    <div className={`segmented ${className}`.trim()} role="group" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className={`segmented__btn ${value === opt.id ? "is-active" : ""}`}
          aria-pressed={value === opt.id}
          title={opt.title}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
          {opt.count > 0 && <span className="segmented__n">{opt.count}</span>}
        </button>
      ))}
    </div>
  );
}
