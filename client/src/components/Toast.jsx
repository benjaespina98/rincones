import { useEffect, useState } from "react";
import "./Toast.css";

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

  const icons = {
    success: "✓",
    error: "✕",
    warning: "⚠",
    info: "ℹ",
  };

  return (
    <div className={`toast toast--${type} ${isClosing ? "toast--closing" : ""}`}>
      <div className="toast__icon">{icons[type]}</div>
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
        onClick={handleClose}
        aria-label="Cerrar notificación"
      >
        ✕
      </button>
    </div>
  );
};

export default Toast;
