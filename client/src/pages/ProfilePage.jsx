import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../context/ToastContext";
import { useWineStats } from "../hooks/useWineStats";
import { useSpendingStats } from "../hooks/useSpendingStats";
import { getProfile, updateProfile } from "../services/authApi";
import { WINE_TYPE_LABELS } from "../data/wineReference";
import ConfirmModal from "../components/ConfirmModal";
import Icon from "../components/Icon";
import "../styles/pages/ProfilePage.css";

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();
  const { stats: wineStats, loading: statsLoading } = useWineStats();
  const { spending } = useSpendingStats();

  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [formError, setFormError] = useState("");
  const [initialFormData, setInitialFormData] = useState(null);
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
        if (!mounted) return;
        if (profile) {
          setFormData((prev) => ({ ...prev, ...profile }));
          setInitialFormData((prev) => ({ ...prev, ...profile }));
        }
      } catch (err) {
        showError?.("Error al cargar perfil");
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
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch {
      showError?.("Error al cerrar sesión");
    }
  };

  if (loading) {
    return (
      <div className="profile-page">
        <div className="page-loading">
          <span className="spinner" aria-hidden="true" />
          <span>Cargando tu perfil…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <section className="profile-header">
        <div className="avatar-large">{formData.avatar || "👤"}</div>
        <div className="profile-info">
          <span className="profile-kicker">Tu cuenta</span>
          <h2>{formData.firstName} {formData.lastName}</h2>
          <p className="profile-email">{user?.email}</p>
          {formData.bio && <p className="profile-bio">{formData.bio}</p>}
        </div>
      </section>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="value">{statsLoading ? "…" : wineStats?.totals?.total || 0}</div>
          <div className="label">Vinos</div>
        </div>
        <div className="stat-card">
          <div className="value">{statsLoading ? "…" : wineStats?.totals?.consumed || 0}</div>
          <div className="label">Probados</div>
        </div>
        <div className="stat-card">
          <div className="value">
            {statsLoading ? "…" : wineStats?.avgRating ? wineStats.avgRating.toFixed(1) : "-"}
          </div>
          <div className="label">Rating</div>
        </div>
      </div>

      {wineStats && !statsLoading && (
        <section className="wine-insights">
          <h3 className="insights-title">✨ Tu perfil de vino</h3>
          
          {/* Types breakdown */}
          {wineStats.countsByType && wineStats.countsByType.length > 0 && (
            <div className="insight-card">
              <div className="insight-header">Por tipo</div>
              <div className="type-breakdown">
                {wineStats.countsByType.map((item) => (
                  <div key={item.type} className="type-item">
                    <span className="type-label">{WINE_TYPE_LABELS[item.type] || WINE_TYPE_LABELS.unknown}</span>
                    <span className="type-count">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Top varietals */}
          {wineStats.topVarietals && wineStats.topVarietals.length > 0 && (
            <div className="insight-card">
              <div className="insight-header">Varietales favoritos</div>
              <div className="top-list">
                {wineStats.topVarietals.slice(0, 5).map((item, idx) => (
                  <div key={item.varietal} className="top-item">
                    <span className="top-rank">{idx + 1}</span>
                    <span className="top-name">{item.varietal}</span>
                    <span className="top-value">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Top regions */}
          {wineStats.topRegions && wineStats.topRegions.length > 0 && (
            <div className="insight-card">
              <div className="insight-header">Regiones exploradas</div>
              <div className="top-list">
                {wineStats.topRegions.slice(0, 5).map((item, idx) => (
                  <div key={item.region} className="top-item">
                    <span className="top-rank">{idx + 1}</span>
                    <span className="top-name">{item.region}</span>
                    <span className="top-value">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Average rating */}
          {wineStats.avgRating > 0 && (
            <div className="insight-card">
              <div className="insight-header">Rating promedio</div>
              <div className="rating-display">
                <span className="rating-number">{wineStats.avgRating.toFixed(1)}</span>
                <span className="rating-stars">
                  {Array.from({ length: 5 }, (_, i) => (
                    <span key={i} className={i < Math.round(wineStats.avgRating) ? 'star filled' : 'star'}>
                      ⭐
                    </span>
                  ))}
                </span>
              </div>
            </div>
          )}
        </section>
      )}

      {spending && spending.totalSpent > 0 && (
        <section className="wine-insights">
          <h3 className="insights-title">💰 Mi inversión en vinos</h3>
          <div className="insight-card">
            <div className="insight-header">Total gastado</div>
            <div className="rating-display">
              <span className="rating-number">
                ${spending.totalSpent.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
              </span>
              <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                en {spending.winesWithPrice} {spending.winesWithPrice === 1 ? "vino" : "vinos"}
              </span>
            </div>
          </div>

          {spending.avgPriceByType && spending.avgPriceByType.length > 0 && (
            <div className="insight-card">
              <div className="insight-header">Precio promedio por tipo</div>
              <div className="type-breakdown">
                {spending.avgPriceByType.map((item) => (
                  <div key={item.type} className="type-item">
                    <span className="type-label">{WINE_TYPE_LABELS[item.type] || item.type}</span>
                    <span className="type-count">
                      ${item.avgPrice.toLocaleString("es-AR")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {spending.bestValueWine && (
            <div className="insight-card">
              <div className="insight-header">Mejor relación calidad/precio</div>
              <div className="type-item">
                <span className="type-label">{spending.bestValueWine.name}</span>
                <span className="type-count">
                  ${spending.bestValueWine.purchase?.price?.toLocaleString("es-AR")} · {spending.bestValueWine.rating}★
                </span>
              </div>
            </div>
          )}
        </section>
      )}

      {!isEditing ? (
        <>
          <div className="profile-card">
            <div className="info-sections">
              {formData.city && (
                <div className="info-section">
                  <span className="info-label">📍 Ubicación</span>
                  <span className="info-value">{formData.city}{formData.country ? `, ${formData.country}` : ""}</span>
                </div>
              )}
              {!formData.city && !formData.country && (
                <div className="info-section info-section--empty">
                  <span className="info-label">Perfil incompleto</span>
                  <span className="info-value">Completá tus datos para personalizar sugerencias.</span>
                </div>
              )}
            </div>
          </div>

          <div className="profile-actions profile-actions--stacked">
            <button className="btn-edit" onClick={() => setIsEditing(true)} type="button">
              <Icon name="pencil" size={17} /> Editar perfil
            </button>
            <button className="btn-logout" onClick={() => setShowLogoutConfirm(true)} type="button">
              <Icon name="log-out" size={17} /> Cerrar sesión
            </button>
          </div>
        </>
      ) : (
        <div className="edit-form">
          <div className="edit-form__section-title">Editá tu perfil</div>

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

          <div className="profile-actions profile-actions--sticky">
            <button className="btn-cancel-edit" onClick={() => setIsEditing(false)} type="button">Cancelar</button>
            <button className="btn-save" onClick={handleSave} type="button" disabled={loading}>Guardar cambios</button>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={showLogoutConfirm}
        title="¿Cerrar sesión?"
        message="Se cerrará tu sesión en este dispositivo."
        confirmText="Cerrar sesión"
        cancelText="Cancelar"
        isDangerous
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={handleLogout}
      />
    </div>
  );
}
