import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useToast } from "../context/ToastContext";
import "./AuthPages.css";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { showToast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) return showToast({ message: "Ingresa tu email", type: "error" });

    try {
      setLoading(true);
      const apiURL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";
      const res = await fetch(`${apiURL}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) throw new Error("Error al enviar instrucciones");
      showToast({ message: "Si el email existe, recibirás instrucciones", type: "success" });
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
        <h2>Restablecer contraseña</h2>
        <p className="lead">Ingresa tu correo y te enviaremos un enlace seguro para restablecer tu contraseña.</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <input
            type="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />

          <button type="submit" className="button button--primary" disabled={loading}>
            {loading ? "Enviando..." : "Enviar instrucciones"}
          </button>
        </form>

        <div className="auth-footer">
          <Link to="/login" className="muted-link">Volver al login</Link>
        </div>
      </div>
    </div>
  );
}
