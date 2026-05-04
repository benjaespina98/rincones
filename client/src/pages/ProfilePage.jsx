import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../context/ToastContext";
import { getProfile, updateProfile, getUserStats } from "../services/authApi";
import "../styles/pages/ProfilePage.css";

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [formError, setFormError] = useState("");
  const [initialFormData, setInitialFormData] = useState(null);
  const [stats, setStats] = useState({ winesCount: 0, tastedWines: 0, averageRating: 0 });
  const [formData, setFormData] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    bio: "",
    city: "",
    country: "",
    avatar: user?.avatar || "👤",
  });

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        setLoading(true);
        const profile = await getProfile();
        const userStats = await getUserStats();
        if (!mounted) return;
        if (profile) {
          setFormData((prev) => ({ ...prev, ...profile }));
          setInitialFormData((prev) => ({ ...prev, ...profile }));
        }
        if (userStats) setStats(userStats);
      } catch (err) {
        showError?.("Error al cargar perfil");
        // eslint-disable-next-line no-console
        console.error(err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [showError]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormError("");
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const validateProfile = () => {
    const firstName = String(formData.firstName || "").trim();
    const lastName = String(formData.lastName || "").trim();
    const bio = String(formData.bio || "");

    if (firstName.length < 2) {
      return "El nombre debe tener al menos 2 caracteres.";
    }

    if (firstName.length > 40 || lastName.length > 40) {
      return "Nombre y apellido deben tener hasta 40 caracteres.";
    }

    if (bio.length > 180) {
      return "La bio puede tener hasta 180 caracteres.";
    }

    return "";
  };

  const hasChanges =
    JSON.stringify({
      firstName: formData.firstName || "",
      lastName: formData.lastName || "",
      city: formData.city || "",
      country: formData.country || "",
      bio: formData.bio || "",
    }) !==
    JSON.stringify({
      firstName: initialFormData?.firstName || "",
      lastName: initialFormData?.lastName || "",
      city: initialFormData?.city || "",
      country: initialFormData?.country || "",
      bio: initialFormData?.bio || "",
    });

  const handleSave = async () => {
    const validationError = validateProfile();
    if (validationError) {
      setFormError(validationError);
      showError?.(validationError);
      return;
    }

    if (!hasChanges) {
      showSuccess?.("No hay cambios para guardar");
      setIsEditing(false);
      return;
    }

    try {
      setLoading(true);
      await updateProfile(formData);
      showSuccess?.("Perfil actualizado");
      setIsEditing(false);
      setInitialFormData(formData);
    } catch (err) {
      showError?.("Error al actualizar el perfil");
      // eslint-disable-next-line no-console
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (err) {
      showError?.("Error al cerrar sesión");
    }
  };

  if (loading) {
    return (
      <div className="profile-page">
        <div className="loading">Cargando perfil...</div>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <div className="profile-header">
        <div className="avatar-large">{formData.avatar || "👤"}</div>
        {!isEditing ? (
          <div className="profile-info">
            <h2>{formData.firstName} {formData.lastName}</h2>
            <p className="profile-email">{user?.email}</p>
            {formData.bio && <p className="profile-bio">{formData.bio}</p>}
          </div>
        ) : null}
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="value">{stats.winesCount || 0}</div>
          <div className="label">Vinos</div>
        </div>
        <div className="stat-card">
          <div className="value">{stats.tastedWines || 0}</div>
          <div className="label">Probados</div>
        </div>
        <div className="stat-card">
          <div className="value">{stats.averageRating ? stats.averageRating.toFixed(1) : "-"}</div>
          <div className="label">Rating</div>
        </div>
      </div>

      {!isEditing ? (
        <>
          <div className="profile-actions">
            <button className="btn-edit" onClick={() => setIsEditing(true)} type="button">✏️ Editar Perfil</button>
            <button className="btn-logout" onClick={() => setShowLogoutConfirm(true)} type="button">🚪 Cerrar Sesión</button>
          </div>

          <div className="info-sections">
            {formData.city && (
              <div className="info-section">
                <span className="info-label">📍 Ubicación</span>
                <span className="info-value">{formData.city}{formData.country ? `, ${formData.country}` : ""}</span>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="edit-form">
          <div className="form-row">
            <div className="form-control">
              <label htmlFor="firstName">Nombre</label>
              <input id="firstName" name="firstName" value={formData.firstName} onChange={handleChange} />
            </div>
            <div className="form-control">
              <label htmlFor="lastName">Apellido</label>
              <input id="lastName" name="lastName" value={formData.lastName} onChange={handleChange} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-control">
              <label htmlFor="city">Ciudad</label>
              <input id="city" name="city" value={formData.city} onChange={handleChange} />
            </div>
            <div className="form-control">
              <label htmlFor="country">País</label>
              <input id="country" name="country" value={formData.country} onChange={handleChange} />
            </div>
          </div>

          <div className="form-control">
            <label htmlFor="bio">Bio</label>
            <textarea id="bio" name="bio" value={formData.bio} onChange={handleChange} rows={4} />
            <small>{(formData.bio || "").length}/180</small>
          </div>

          {formError && <p className="profile-form-error">{formError}</p>}

          <div className="form-actions">
            <button className="btn-save" onClick={handleSave} type="button" disabled={loading}>Guardar</button>
            <button className="btn-cancel-edit" onClick={() => setIsEditing(false)} type="button">Cancelar</button>
          </div>
        </div>
      )}

      {showLogoutConfirm && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>¿Cerrar sesión?</h3>
            <p>Se cerrará tu sesión en este dispositivo.</p>
            <div className="modal-actions">
              <button className="btn-cancel-logout" onClick={() => setShowLogoutConfirm(false)} type="button">Cancelar</button>
              <button className="btn-confirm-logout" onClick={handleLogout} type="button">Cerrar Sesión</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
