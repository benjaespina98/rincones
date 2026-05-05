import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "../context/ToastContext";
import "./AuthPages.css";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const emailFromQuery = searchParams.get("email") || "";

  const [email, setEmail] = useState(emailFromQuery);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { showToast } = useToast();

  useEffect(() => {
    if (emailFromQuery) setEmail(emailFromQuery);
  }, [emailFromQuery]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) return showToast({ message: "Falta token en la URL", type: "error" });
    if (!email) return showToast({ message: "Email requerido", type: "error" });
    if (!password || password !== confirm) return showToast({ message: "Contraseñas no coinciden", type: "error" });

    try {
      setLoading(true);
      const apiURL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";
      const res = await fetch(`${apiURL}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email, newPassword: password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Error al restablecer contraseña");
      }

      showToast({ message: "Contraseña actualizada. Puedes ingresar ahora.", type: "success" });
      navigate("/login");
    } catch (err) {
      console.error(err);
      showToast({ message: err.message || "Error" , type: "error"});
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-center">
      <div className="auth-card">
        <h2>Crear nueva contraseña</h2>
        <p className="lead">La contraseña debe tener al menos 8 caracteres e incluir mayúsculas, minúsculas y números.</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <input type="email" placeholder="Correo" value={email} onChange={(e)=>setEmail(e.target.value)} disabled={loading} />
          <input type="password" placeholder="Nueva contraseña" value={password} onChange={(e)=>setPassword(e.target.value)} disabled={loading} />
          <input type="password" placeholder="Confirmar contraseña" value={confirm} onChange={(e)=>setConfirm(e.target.value)} disabled={loading} />

          <button type="submit" className="button button--primary" disabled={loading}>
            {loading ? "Guardando..." : "Cambiar contraseña"}
          </button>
        </form>

        <div className="auth-footer">
          <Link to="/login" className="muted-link">Volver al login</Link>
        </div>
      </div>
    </div>
  );
}
