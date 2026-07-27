import { useState } from "react";
import Icon from "./Icon";

export default function PasswordInput({
  value,
  onChange,
  placeholder = "••••••••",
  disabled = false,
  autoComplete = "current-password",
  name = "password",
  id,
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="auth-input-wrap">
      <span className="auth-input-wrap__icon" aria-hidden="true">
        <Icon name="lock" size={18} />
      </span>
      <input
        id={id}
        name={name}
        type={show ? "text" : "password"}
        className="auth-input"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
      />
      {/* Sin tabIndex={-1}: quien navega por teclado también necesita poder
          revelar la contraseña que está escribiendo. */}
      <button
        type="button"
        className="auth-toggle-eye"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={show}
      >
        <Icon name={show ? "eye-off" : "eye"} size={18} />
      </button>
    </div>
  );
}
