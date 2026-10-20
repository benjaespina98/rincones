/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useMemo } from "react";
import Toast from "../components/Toast";
import { agregarConTope } from "../utils/toastCola";

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = "info", duration = 3000, action = null) => {
    // `substr` está deprecado hace años; `slice` hace lo mismo y no depende de
    // una API que los navegadores mantienen sólo por compatibilidad.
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    setToasts((prev) => agregarConTope(prev, { id, message, type, duration, action }));

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

  /**
   * El valor del contexto, memoizado.
   *
   * Era un objeto literal nuevo en cada render, y este proveedor envuelve a TODA
   * la app y se re-renderiza cada vez que aparece o desaparece un toast. Con la
   * identidad del valor cambiando, React re-renderizaba todos los consumidores
   * de `useToast` —la ficha del vino, Mi Bodega entera, la home— cada vez que se
   * mostraba un "Guardado". El aviso más chico de la app costaba un render
   * general.
   *
   * Las seis funciones ya eran estables (`useCallback`), así que lo único que
   * faltaba era no tirar el objeto que las contiene. `AuthContext` ya lo hacía
   * así; esto lo empareja.
   */
  const value = useMemo(
    () => ({ addToast, removeToast, showSuccess, showError, showWarning, showInfo }),
    [addToast, removeToast, showSuccess, showError, showWarning, showInfo]
  );

  return (
    <ToastContext.Provider value={value}>
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
