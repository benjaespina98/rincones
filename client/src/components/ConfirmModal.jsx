import "../styles/components/ConfirmModal.css";

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
  if (!isOpen) return null;

  return (
    <div className="confirm-modal-overlay">
      <div className="confirm-modal">
        <div className="confirm-modal__header">
          <h2 className="confirm-modal__title">{title}</h2>
        </div>

        <div className="confirm-modal__body">
          <p className="confirm-modal__message">{message}</p>
        </div>

        <div className="confirm-modal__footer">
          <button
            className="confirm-modal__cancel"
            onClick={onCancel}
            autoFocus
            type="button"
          >
            {cancelText}
          </button>
          <button
            className={`confirm-modal__confirm ${
              isDangerous ? "confirm-modal__confirm--danger" : ""
            }`}
            onClick={onConfirm}
            type="button"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
