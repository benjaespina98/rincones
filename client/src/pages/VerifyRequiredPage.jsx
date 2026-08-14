import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { resendVerification } from "../services/authApi";
import { useToast } from "../context/ToastContext";
import Icon from "../components/Icon";
import "./Auth.css";

/**
 * Gate obligatorio para cuentas nuevas sin email confirmado.
 *
 * `AppGate` manda acá antes de dejar pasar a cualquier pantalla de la app —
 * ver la decisión de producto en el resumen de esta iteración: una cuenta sin
 * verificar no puede escanear, guardar vinos ni tocar nada que dependa de que
 * la cuenta sea de quien dice ser. Las cuentas de ANTES de este cambio quedan
 * afuera de este gate (se migraron a `emailVerified: true`, ver
 * server/scripts/grandfatherVerifiedUsers.js) — esto sólo lo ve una cuenta
 * creada de acá en adelante.
 *
 * "Ya lo confirmé" no verifica nada por sí solo: sólo vuelve a preguntarle al
 * servidor quién sos (`refreshUser`). Si la persona ya tocó el link del mail
 * —en esta pestaña o en otra—, `emailVerified` ya es `true` ahí y el gate deja
 * pasar solo, sin que este botón haga magia.
 */
export default function VerifyRequiredPage() {
  const { user, logout, refreshUser } = useAuth();
  const { showSuccess, showError } = useToast();
  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);

  const resend = async () => {
    try {
      setResending(true);
      await resendVerification();
      showSuccess("Te mandamos un enlace nuevo a tu email");
    } catch {
      showError("No se pudo reenviar el enlace. Probá de nuevo en un rato.");
    } finally {
      setResending(false);
    }
  };

  const checkAgain = async () => {
    try {
      setChecking(true);
      await refreshUser();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-brand__mark" aria-hidden="true">
            <Icon name="mail" size={26} />
          </span>
          <h1 className="auth-brand__title">Confirmá tu email</h1>
          <p className="auth-brand__subtitle">
            {user?.email
              ? <>Te mandamos un enlace a <strong>{user.email}</strong>. Abrilo para activar tu cuenta.</>
              : "Te mandamos un enlace de confirmación a tu email."}
          </p>
        </div>

        <div className="auth-form">
          <button type="button" className="auth-submit" onClick={checkAgain} disabled={checking}>
            {checking ? <span className="auth-spinner" aria-hidden="true" /> : <>Ya lo confirmé <Icon name="check" size={18} /></>}
          </button>

          <button type="button" className="auth-linkbtn" onClick={resend} disabled={resending}>
            {resending ? "Enviando…" : "Reenviar enlace"}
          </button>
        </div>

        <div className="auth-footer">
          <button type="button" className="auth-link" onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
