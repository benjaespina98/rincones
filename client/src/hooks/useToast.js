import { useToast as useToastContext } from "../context/ToastContext";

// Re-export hook con interfaz simplificada
export const useToast = () => {
  const context = useToastContext();

  // Retornar una función que se pueda usar directamente
  return (message, type = "info", duration = 3000) => {
    if (type === "success") {
      return context.showSuccess(message, duration);
    } else if (type === "error") {
      return context.showError(message, duration);
    } else if (type === "warning") {
      return context.showWarning(message, duration);
    } else {
      return context.addToast(message, type, duration);
    }
  };
};
