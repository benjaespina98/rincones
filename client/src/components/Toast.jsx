import { useEffect, useState } from "react";
import Icon from "./Icon";
import "./Toast.css";

const TYPE_ICONS = {
  success: "check",
  error: "x",
  warning: "alert-triangle",
  info: "info",
};

const Toast = ({ message, type = "info", duration = 3000, action, onClose }) => {
  const [isClosing, setIsClosing] = useState(false);

  const [pausado, setPausado] = useState(false);

  useEffect(() => {
    if (duration === 0 || pausado) return;

    const timer = setTimeout(() => {
      setIsClosing(true);
      setTimeout(() => onClose?.(), 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose, pausado]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => onClose?.(), 300);
  };

  // Los errores interrumpen (alert); el resto se anuncia con la región polite
  // del contenedor, para no cortar lo que el usuario esté leyendo.
  const isError = type === "error";

  return (
    <div
      className={`toast toast--${type} ${isClosing ? "toast--closing" : ""}`}
      role={isError ? "alert" : undefined}
      aria-live={isError ? "assertive" : undefined}
      onPointerEnter={() => setPausado(true)}
      onPointerLeave={() => setPausado(false)}
      onFocus={() => setPausado(true)}
      onBlur={() => setPausado(false)}
    >
      <div className="toast__icon" aria-hidden="true"><Icon name={TYPE_ICONS[type] || "info"} size={18} /></div>
      <div className="toast__message">{message}</div>
      {/* Dos acciones como mucho, y la segunda visualmente por debajo.
          Abrir una botella dejó dos salidas que valen la pena a la vez —contar
          el momento y deshacer— y con una sola había que elegir cuál perder.
          Más de dos convierte el aviso en un menú, así que el componente no
          acepta más: `action` es la que se propone y `action.secondary` la que
          repara. */}
      {action?.label && typeof action?.onClick === "function" && (
        <div className="toast__actions">
          <button className="toast__action" onClick={action.onClick} type="button">
            {action.label}
          </button>
          {action.secondary?.label && typeof action.secondary?.onClick === "function" && (
            <button
              className="toast__action toast__action--secondary"
              onClick={action.secondary.onClick}
              type="button"
            >
              {action.secondary.label}
            </button>
          )}
        </div>
      )}
      {/* Con una acción el aviso se va solo: una "×" al lado de "Deshacer" competía con él. */}
      {!action?.label && (
      <button
        className="toast__close"
        type="button"
        onClick={handleClose}
        aria-label="Cerrar notificación"
      >
        <Icon name="x" size={15} />
      </button>
      )}
    </div>
  );
};

export default Toast;
