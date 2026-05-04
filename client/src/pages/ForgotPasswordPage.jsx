import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../context/ToastContext";

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
      const apiURL = import.meta.env.VITE_API_URL || "http://localhost:3001";
      const res = await fetch(`${apiURL}/api/auth/forgot-password`, {
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
      <div className="card">
        <h2>Restablecer contraseña</h2>
        <p>Ingresa tu correo y te enviaremos instrucciones para restablecer tu contraseña.</p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
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
      </div>
    </div>
  );
}
