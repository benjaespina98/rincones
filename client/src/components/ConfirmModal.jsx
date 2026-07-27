import { useEffect, useRef } from "react";
import "../styles/components/ConfirmModal.css";
import Portal from "./Portal";

/**
 * Diálogo de confirmación.
 *
 * Era el único diálogo de la app sin `role="dialog"`, sin Escape y sin foco
 * inicial: con teclado o lector de pantalla quedaba fuera de alcance.
 */
export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  onConfirm,
  onCancel,
  isDangerous = false,
}) {
  const confirmRef = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    // En acciones destructivas el foco arranca en Cancelar, para que un Enter
    // reflejo no borre nada. Escape siempre cancela.
    (isDangerous ? cancelRef : confirmRef).current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onCancel?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onCancel, isDangerous]);

  if (!isOpen) return null;

  return (
    <Portal>
      <div
        className="confirm-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-message"
        onMouseDown={(e) => {
          // Tocar fuera cancela (patrón esperado en mobile).
          if (e.target === e.currentTarget) onCancel?.();
        }}
      >
        <div className="confirm-modal">
          <div className="confirm-modal__header">
            <h2 className="confirm-modal__title" id="confirm-modal-title">{title}</h2>
          </div>

          <div className="confirm-modal__body">
            <p className="confirm-modal__message" id="confirm-modal-message">{message}</p>
          </div>

          {/* El footer es row-reverse: en el DOM va cancelar primero. */}
          <div className="confirm-modal__footer">
            <button ref={cancelRef} className="confirm-modal__cancel" onClick={onCancel} type="button">
              {cancelText}
            </button>
            <button
              ref={confirmRef}
              className={`confirm-modal__confirm ${isDangerous ? "confirm-modal__confirm--danger" : ""}`}
              onClick={onConfirm}
              type="button"
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
  </Portal>
  );
}
