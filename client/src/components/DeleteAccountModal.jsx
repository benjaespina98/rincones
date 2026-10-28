import { useId, useState } from "react";
import "../styles/shared/ConfirmModal.css";
import "./DeleteAccountModal.css";
import Icon from "./Icon";
import Portal from "./Portal";
import { useSheet } from "../hooks/useSheet";

/**
 * Baja de cuenta.
 *
 * ── QUÉ HACE FALTA QUE LA PERSONA ENTIENDA ANTES DE TOCAR ───────────────────
 * Tres cosas, en este orden: qué se pierde (y que no vuelve), que puede
 * llevárselo antes, y recién después el candado. La lista de abajo sale del
 * inventario de `accountDeletion.service.js`: si se agrega una colección allá,
 * se agrega una línea acá, porque un aviso que se queda corto es peor que
 * ninguno.
 *
 * ── EL CANDADO ──────────────────────────────────────────────────────────────
 * El email se pide escrito a mano para que no se dispare por un toque de más.
 * Se muestra entero arriba del campo y NO como placeholder: el placeholder
 * desaparece al escribir y se corta en pantallas angostas, que era justo lo que
 * pasaba (se leía un fragmento del email). La contraseña sólo existe en las cuentas creadas
 * con email; quien entró con Google la deja vacía, y el cliente no tiene cómo
 * saber cuál es el caso, así que se dice en la etiqueta.
 *
 * Escape, el foco al abrir y al cerrar y el ciclo de Tab los resuelve
 * `useSheet`, igual que en las hojas. Mientras se borra no se puede cancelar:
 * a mitad de un borrado, "cancelar" no tiene qué deshacer.
 */
const SE_BORRA = [
  "Tu bodega y tus guardados",
  "Tus momentos",
  "Tus reseñas",
  "Tus consultas al Sommelier",
];

export default function DeleteAccountModal({
  isOpen,
  email,
  onConfirm,
  onCancel,
  onExport,
  exporting = false,
}) {
  const [confirmEmail, setConfirmEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ids = useId();
  const panelRef = useSheet(busy ? undefined : onCancel, { enabled: isOpen });

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
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !busy) onCancel?.();
        }}
      >
        <form
          ref={panelRef}
          className="confirm-modal delete-account"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${ids}-titulo`}
          aria-describedby={`${ids}-aviso`}
          tabIndex={-1}
          onSubmit={submit}
        >
          <div className="delete-account__header">
            <span className="delete-account__icono" aria-hidden="true">
              <Icon name="trash" size={22} />
            </span>
            <h2 className="delete-account__titulo" id={`${ids}-titulo`}>
              ¿Eliminar tu cuenta?
            </h2>
          </div>

          <div className="delete-account__cuerpo">
            <div id={`${ids}-aviso`}>
              <p className="delete-account__aviso">
                Se borra todo, para siempre. No se puede deshacer.
              </p>
              <ul className="delete-account__lista">
                {SE_BORRA.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            {onExport && (
              <button
                type="button"
                className="delete-account__exportar"
                onClick={onExport}
                disabled={exporting || busy}
              >
                {exporting ? "Preparando el archivo…" : "Descargar mis datos antes"}
              </button>
            )}

            <div className="delete-account__campo">
              <label className="delete-account__label" htmlFor={`${ids}-email`}>
                Para confirmar, escribí tu email
              </label>
              <p className="delete-account__email">{email}</p>
              <input
                id={`${ids}-email`}
                className="delete-account__input"
                type="email"
                inputMode="email"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="Tu email"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
              />
            </div>

            <div className="delete-account__campo">
              <label className="delete-account__label" htmlFor={`${ids}-pass`}>
                Tu contraseña
              </label>
              <p className="delete-account__ayuda">Si entraste con Google, dejala vacía.</p>
              <input
                id={`${ids}-pass`}
                className="delete-account__input"
                type="password"
                autoComplete="current-password"
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <p className="delete-account__error" role="alert">
                {error}
              </p>
            )}
          </div>

          <div className="delete-account__pie">
            <button
              className="confirm-modal__cancel"
              type="button"
              onClick={onCancel}
              disabled={busy}
            >
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
