import { useEffect, useId, useRef, useState } from "react";
import Icon from "./Icon";
import { tapHaptic } from "../utils/haptics";
import "./Dropdown.css";

/**
 * Select custom con el look de la app (los <select> nativos abren el desplegable
 * del sistema operativo, que no respeta el tema y se ve fuera de lugar).
 *
 * props:
 *  - value, onChange(value)
 *  - options: [{ value, label }]
 *  - ariaLabel
 */
export default function Dropdown({ value, onChange, options, ariaLabel, className = "" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value) || options[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (v) => {
    tapHaptic();
    onChange(v);
    setOpen(false);
  };

  return (
    <div className={`dropdown ${className}`} ref={ref}>
      <button
        type="button"
        className="dropdown__trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
      >
        <span className="dropdown__value">{selected?.label}</span>
        <Icon name="chevron-down" size={16} className="dropdown__caret" />
      </button>

      {open && (
        <ul className="dropdown__list" id={listId} role="listbox" aria-label={ariaLabel}>
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={`dropdown__option ${o.value === value ? "is-selected" : ""}`}
                onClick={() => pick(o.value)}
              >
                <span>{o.label}</span>
                {o.value === value && <Icon name="check" size={15} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
