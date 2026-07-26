/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback } from "react";
import Toast from "../components/Toast";

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = "info", duration = 3000, action = null) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    setToasts((prev) => [...prev, { id, message, type, duration, action }]);

    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showSuccess = useCallback((message, duration) => {
    return addToast(message, "success", duration);
  }, [addToast]);

  const showError = useCallback((message, duration) => {
    return addToast(message, "error", duration);
  }, [addToast]);

  const showWarning = useCallback((message, duration) => {
    return addToast(message, "warning", duration);
  }, [addToast]);

  const showInfo = useCallback((message, duration) => {
    return addToast(message, "info", duration);
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ addToast, removeToast, showSuccess, showError, showWarning, showInfo }}>
      {children}
      {/* Región viva: casi todo el feedback de la app (guardar, borrar, favoritos,
          errores) vive en toasts, así que sin esto un lector de pantalla no
          anuncia nada. Los errores además usan role="alert" en cada Toast. */}
      <div className="toast-container" role="status" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            duration={toast.duration}
            action={toast.action}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast debe ser usado dentro de ToastProvider");
  }
  return context;
};
