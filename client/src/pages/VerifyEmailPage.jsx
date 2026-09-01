import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { verifyEmail } from "../services/authApi";
import { useAuth } from "../hooks/useAuth";
import Icon from "../components/Icon";
import "./Auth.css";

// Estados de la confirmación. Es una sola llamada, sin pasos intermedios que
// valga la pena mostrar por separado — la espera es corta y no hay nada que
// explicar mientras tanto, a diferencia del escaneo.
const ESTADOS = { cargando: "cargando", ok: "ok", error: "error" };

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const email = searchParams.get("email") || "";
  const { user, refreshUser } = useAuth();

  const [estado, setEstado] = useState(ESTADOS.cargando);
  const [mensaje, setMensaje] = useState("");
  // El link puede llegar sin datos (se copió mal, o alguien lo abrió a mano) o
  // el pedido puede llegar dos veces en desarrollo (StrictMode monta dos
  // veces): que se dispare una sola vez por token.
  const yaPedido = useRef(false);

  useEffect(() => {
    if (!token || !email) {
      setEstado(ESTADOS.error);
      setMensaje("El enlace es inválido o está incompleto. Pedí uno nuevo desde tu perfil.");
      return;
    }
    if (yaPedido.current) return;
    yaPedido.current = true;

    verifyEmail({ token, email })
      .then(() => {
        setEstado(ESTADOS.ok);
        /**
         * ── EL BUG: "TENGO QUE ACTUALIZAR PARA QUE ME RECONOZCA" ──────────────
         *
         * Acá decía `if (user) refreshUser()`, y `user` es el de la primera
         * pintada: este efecto corre una sola vez (deps `[token, email]`, a
         * propósito) y `user` queda congelado en lo que valía en ese instante.
         *
         * El caso que rompía es el más común de todos: tocar el link desde la
         * app de mail casi siempre abre una pestaña NUEVA, y en una pestaña
         * nueva `AuthContext` arranca sin sesión todavía —está a mitad de
         * preguntarle al server quién sos— así que `user` es `null` en esa
         * primera pintada. La cuenta SÍ quedaba confirmada (`verifyEmail` ya
         * había contestado bien, por eso esta pantalla decía "¡Email
         * confirmado!"), pero nadie volvía a avisarle al resto de la app: la
         * hidratación propia de `AuthContext` podía terminar de correr ANTES de
         * que el servidor supiera de la verificación, y ahí quedaba trabada con
         * el estado viejo hasta un F5.
         *
         * `refreshUser` no tiene ese problema —es `hydrateUser`, la misma
         * función siempre (ver el `useCallback` en AuthContext.jsx)— así que
         * llamarla sin la condición es seguro pase lo que pase: con sesión en
         * este navegador, se entera de la confirmación; sin sesión (alguien
         * abrió el link sin estar logueado en esta pestaña), no hace nada malo.
         */
        refreshUser();
      })
      .catch((err) => {
        setEstado(ESTADOS.error);
        setMensaje(err.response?.data?.message || "El enlace es inválido o expiró.");
      });
    // Sólo debe correr una vez, con el token/email de la URL: no tiene que
    // reiniciar el pedido por un re-render ajeno a esos dos valores.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, email]);

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-brand__mark" aria-hidden="true">
            <Icon name={estado === ESTADOS.ok ? "check" : "mail"} size={26} />
          </span>
          <h1 className="auth-brand__title">
            {estado === ESTADOS.cargando && "Confirmando tu email…"}
            {estado === ESTADOS.ok && "¡Email confirmado!"}
            {estado === ESTADOS.error && "No pudimos confirmarlo"}
          </h1>
          {estado === ESTADOS.ok && (
            <p className="auth-brand__subtitle">Ya podés usar Rincones con la cuenta habilitada del todo.</p>
          )}
        </div>

        {estado === ESTADOS.cargando && <span className="auth-spinner" aria-hidden="true" />}

        {estado === ESTADOS.error && (
          <div className="auth-error" role="alert">
            <Icon name="alert-triangle" size={16} />
            {mensaje}
          </div>
        )}

        <div className="auth-footer">
          <Link to={user ? "/perfil" : "/login"} className="auth-link">
            {user ? "Ir a mi perfil" : "← Volver al inicio de sesión"}
          </Link>
        </div>
      </div>
    </div>
  );
}
