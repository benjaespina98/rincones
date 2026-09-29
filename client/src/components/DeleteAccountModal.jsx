import { useEffect, useRef, useState } from "react";
import "../styles/shared/ConfirmModal.css";
import Portal from "./Portal";

/**
 * Baja de cuenta. Pide el email escrito a mano (y la contraseña, para las
 * cuentas que tienen) para que no se dispare por un toque de más. Reusa el
 * estilo de ConfirmModal; el foco arranca en el primer campo y Escape cancela.
 */
export default function DeleteAccountModal({ isOpen, email, onConfirm, onCancel }) {
  const [confirmEmail, setConfirmEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const emailRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    emailRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) onCancel?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onCancel, busy]);

  if (!isOpen) return null;

  const emailMatches = confirmEmail.trim().toLowerCase() === String(email || "").toLowerCase();

  const submit = async (e) => {
    e.preventDefault();
    if (!emailMatches || busy) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm({ confirmEmail: confirmEmail.trim(), password });
    } catch (err) {
      setError(err?.response?.data?.message || "No pudimos eliminar la cuenta. Probá de nuevo.");
      setBusy(false);
    }
  };

  return (
    <Portal>
      <div
        className="confirm-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !busy) onCancel?.();
        }}
      >
        <form className="confirm-modal" onSubmit={submit}>
          <div className="confirm-modal__header">
            <h2 className="confirm-modal__title" id="delete-account-title">¿Eliminar tu cuenta?</h2>
          </div>

          <div className="confirm-modal__body">
            <p className="confirm-modal__message">
              Se borran tu bodega, tus reseñas y todo lo que cargaste. No se puede deshacer.
              Para confirmar, escribí tu email.
            </p>
            <input
              ref={emailRef}
              className="confirm-modal__field"
              type="email"
              autoComplete="off"
              aria-label="Tu email"
              placeholder={email}
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
            />
            <input
              className="confirm-modal__field"
              type="password"
              autoComplete="current-password"
              aria-label="Tu contraseña (si tu cuenta tiene una)"
              placeholder="Contraseña (si tu cuenta tiene una)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <p className="confirm-modal__error" role="alert">{error}</p>}
          </div>

          <div className="confirm-modal__footer">
            <button className="confirm-modal__cancel" type="button" onClick={onCancel} disabled={busy}>
              Cancelar
            </button>
            <button
              className="confirm-modal__confirm confirm-modal__confirm--danger"
              type="submit"
              disabled={!emailMatches || busy}
            >
              {busy ? "Eliminando…" : "Eliminar cuenta"}
            </button>
          </div>
        </form>
      </div>
    </Portal>
  );
}
