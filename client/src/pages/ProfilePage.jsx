import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../context/ToastContext";
import { useWineStats } from "../hooks/useWineStats";
import { useSpendingStats } from "../hooks/useSpendingStats";
import { getProfile, updateProfile } from "../services/authApi";
import { WINE_TYPE_LABELS } from "../data/wineReference";
import { calculateAge } from "../utils/age";
import { errorHaptic } from "../utils/haptics";
import { getLevel, getAchievements, countUnlocked } from "../utils/gamification";
import Icon from "../components/Icon";
import ProfileEditor from "../components/ProfileEditor";
import ConfirmModal from "../components/ConfirmModal";
import "../styles/pages/ProfilePage.css";

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, isAdmin, logout } = useAuth();
  const { showSuccess, showError } = useToast();
  const { stats: wineStats, loading: statsLoading } = useWineStats();
  const { spending } = useSpendingStats();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [profileData, setProfileData] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    bio: "",
    city: "",
    country: "",
    birthDate: "",
    avatar: user?.avatar || "👤",
  });

  const age = calculateAge(profileData.birthDate);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        setLoading(true);
        const profile = await getProfile();
        if (!mounted) return;
        if (profile) {
          setProfileData((prev) => ({ ...prev, ...profile }));
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

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch {
      errorHaptic();
      showError?.("No se pudo cerrar la sesión");
    }
  };

  const handleSaveProfile = async (form) => {
    try {
      setSaving(true);
      const updated = { ...profileData, ...form };
      await updateProfile(updated);
      setProfileData(updated);
      setIsEditing(false);
      showSuccess?.("Perfil actualizado");
    } catch (err) {
      showError?.("No se pudo actualizar el perfil");
      console.error(err);
    } finally {
      setSaving(false);
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
        <div className="avatar-large">{profileData.avatar || "👤"}</div>
        <div className="profile-info">
          <span className="profile-kicker">Tu cuenta</span>
          <h2>{profileData.firstName} {profileData.lastName}</h2>
          {age != null && (
            <span className="profile-age">
              <Icon name="cake" size={14} /> {age} años
            </span>
          )}
          <p className="profile-email">{user?.email}</p>
          {(profileData.city || profileData.country) && (
            <p className="profile-location">
              <Icon name="map-pin" size={13} /> {[profileData.city, profileData.country].filter(Boolean).join(", ")}
            </p>
          )}
          {profileData.bio && <p className="profile-bio">{profileData.bio}</p>}
        </div>
      </section>

      {/* Cuenta: editar, admin y cerrar sesión. Separado de tu gusto de vino. */}
      <div className="account-list">
        <button className="account-item" type="button" onClick={() => setIsEditing(true)}>
          <span className="account-item__icon"><Icon name="pencil" size={18} /></span>
          <span className="account-item__label">Editar perfil</span>
          <Icon name="chevron-down" size={16} className="account-item__chevron" />
        </button>

        {isAdmin && (
          <button className="account-item" type="button" onClick={() => navigate("/admin")}>
            <span className="account-item__icon"><Icon name="lock" size={18} /></span>
            <span className="account-item__label">Panel de administración</span>
            <Icon name="chevron-down" size={16} className="account-item__chevron" />
          </button>
        )}

        <button
          className="account-item account-item--danger"
          type="button"
          onClick={() => setShowLogoutConfirm(true)}
        >
          <span className="account-item__icon"><Icon name="log-out" size={18} /></span>
          <span className="account-item__label">Cerrar sesión</span>
        </button>
      </div>

      <h2 className="profile-section-title">Tu perfil de vino</h2>

      {/* Nivel + progreso + logros (gamificación derivada de tus stats) */}
      {(() => {
        const total = wineStats?.totals?.total || 0;
        const lvl = getLevel(total);
        const achievements = getAchievements(wineStats);
        const unlocked = countUnlocked(achievements);
        return (
          <>
            <div className="level-card">
              <div className="level-card__top">
                <span className="level-card__badge">Nv {lvl.level}</span>
                <div className="level-card__meta">
                  <span className="level-card__title">{lvl.title}</span>
                  <span className="level-card__sub">
                    {lvl.isMax
                      ? "¡Nivel máximo alcanzado! 🏆"
                      : `${lvl.toNext} ${lvl.toNext === 1 ? "vino" : "vinos"} para ${lvl.nextTitle}`}
                  </span>
                </div>
              </div>
              <div className="level-bar" role="progressbar" aria-valuenow={Math.round(lvl.progress * 100)}>
                <span className="level-bar__fill" style={{ width: `${Math.round(lvl.progress * 100)}%` }} />
              </div>
            </div>

            <div className="ach">
              <div className="ach__head">
                <span className="ach__title">Logros</span>
                <span className="ach__count">{unlocked}/{achievements.length}</span>
              </div>
              <div className="ach__grid">
                {achievements.map((a) => (
                  <div key={a.id} className={`ach__item ${a.done ? "is-done" : ""}`} title={a.hint}>
                    <span className="ach__emoji">{a.icon}</span>
                    <span className="ach__label">{a.label}</span>
                    {a.done ? (
                      <Icon name="check" size={13} className="ach__check" />
                    ) : (
                      <span className="ach__hint">{a.hint}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        );
      })()}

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

      <ConfirmModal
        isOpen={showLogoutConfirm}
        title="¿Cerrar sesión?"
        message="Vas a tener que volver a ingresar tus datos para entrar."
        confirmText="Cerrar sesión"
        cancelText="Cancelar"
        isDangerous
        onConfirm={handleLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />

      {isEditing && (
        <ProfileEditor
          initialData={profileData}
          email={user?.email}
          saving={saving}
          onCancel={() => setIsEditing(false)}
          onSave={handleSaveProfile}
        />
      )}
    </div>
  );
}
