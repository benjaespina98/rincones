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

  useEffect(() => {
    if (duration === 0) return;

    const timer = setTimeout(() => {
      setIsClosing(true);
      setTimeout(() => onClose?.(), 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

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
    >
      <div className="toast__icon" aria-hidden="true"><Icon name={TYPE_ICONS[type] || "info"} size={18} /></div>
      <div className="toast__message">{message}</div>
      {action?.label && typeof action?.onClick === "function" && (
        <button
          className="toast__action"
          onClick={action.onClick}
          type="button"
        >
          {action.label}
        </button>
      )}
      <button
        className="toast__close"
        type="button"
        onClick={handleClose}
        aria-label="Cerrar notificación"
      >
        <Icon name="x" size={15} />
      </button>
    </div>
  );
};

export default Toast;
