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
import { getLevel } from "../utils/gamification";
import Icon from "../components/Icon";
import ProfileEditor from "../components/ProfileEditor";
import PreferencesEditor from "../components/PreferencesEditor";
import PasswordEditor from "../components/PasswordEditor";
import TypeSplit from "../components/TypeSplit";
import TopRanking from "../components/TopRanking";
import MomentsDiary from "../components/MomentsDiary";
import MyRatings from "../components/MyRatings";
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
  const [showPrefs, setShowPrefs] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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
        showError?.("No se pudo cargar tu perfil");
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

        <button className="account-item" type="button" onClick={() => setShowPrefs(true)}>
          <span className="account-item__icon"><Icon name="sparkles" size={18} /></span>
          <span className="account-item__label">Preferencias de gusto</span>
          <Icon name="chevron-down" size={16} className="account-item__chevron" />
        </button>

        <button className="account-item" type="button" onClick={() => setShowPassword(true)}>
          <span className="account-item__icon"><Icon name="lock" size={18} /></span>
          <span className="account-item__label">Cambiar contraseña</span>
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

      {/* Progreso primero: es lo que más cambia y lo que da sentido al resto. */}
      {/* Sin guard, esto renderizaba "Nv 1 / 0 logros" durante la carga y después
          saltaba al valor real: un parpadeo de datos falsos. */}
      {statsLoading && <div className="level-card level-card--skeleton" aria-hidden="true" />}

      {!statsLoading && (() => {
        const total = wineStats?.totals?.total || 0;
        const lvl = getLevel(total);
        return (
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
        );
      })()}

      <div className="stats-grid">
        <div className="stat-card">
          <div className={`value ${statsLoading ? "is-loading" : ""}`}>
            {statsLoading ? "" : wineStats?.totals?.total || 0}
          </div>
          <div className="label">Vinos</div>
        </div>
        <div className="stat-card">
          <div className={`value ${statsLoading ? "is-loading" : ""}`}>
            {statsLoading ? "" : wineStats?.totals?.consumed || 0}
          </div>
          <div className="label">Probados</div>
        </div>
        <div className="stat-card">
          <div className={`value ${statsLoading ? "is-loading" : ""}`}>
            {statsLoading ? "" : wineStats?.avgRating ? wineStats.avgRating.toFixed(1) : "—"}
          </div>
          <div className="label">Rating</div>
        </div>
      </div>

      {/* Usuario nuevo: sin esto, después de los tres ceros la pantalla se
          cortaba sin explicar que el perfil de gusto se construye solo. */}
      {!statsLoading && (wineStats?.totals?.total || 0) === 0 && (
        <div className="profile-empty">
          <p className="profile-empty__title">Tu perfil de gusto se arma solo</p>
          <p className="profile-empty__hint">
            A medida que cargues vinos vas a ver acá tus uvas y regiones preferidas, y cómo puntuás.
          </p>
          <button type="button" className="empty-cta" onClick={() => navigate("/agregar")}>
            Escanear mi primer vino
          </button>
        </div>
      )}

      {/* Antes acá había SIETE tarjetas del mismo peso visual —tipo, varietales,
          regiones, rating promedio, y tres de gastos— y una de ellas repetía el
          rating que ya estaba tres líneas más arriba. Ahora son tres bloques con
          jerarquía: qué tomás, qué te gusta, cuánto gastás. */}
      {wineStats && !statsLoading && (wineStats.totals?.total || 0) > 0 && (
        <section className="insights">
          {wineStats.countsByType?.length > 0 && (
            <div className="insight">
              <h3 className="insight__title">Qué tomás</h3>
              <TypeSplit counts={wineStats.countsByType} total={wineStats.totals?.total || 0} />
            </div>
          )}

          {(wineStats.topVarietals?.length > 0 || wineStats.topRegions?.length > 0) && (
            <div className="insight">
              <h3 className="insight__title">Lo que más elegís</h3>
              <div className="insight__cols">
                <TopRanking
                  label="Uvas"
                  items={wineStats.topVarietals}
                  nameKey="varietal"
                />
                <TopRanking
                  label="Regiones"
                  items={wineStats.topRegions}
                  nameKey="region"
                />
              </div>
            </div>
          )}
        </section>
      )}

      {/* Los logros no están más. Eran ocho medallas de las que la mayoría se
          veía apagada —"Coleccionista: llegá a 10 vinos"— y una cuadrícula de
          seis pendientes al lado de dos cumplidas es un recordatorio de lo que
          NO hiciste, no una celebración. El nivel de arriba ya cuenta el avance
          con un solo número y sin señalar deudas. El código de `getAchievements`
          queda en utils/gamification por si vuelven con otra forma. */}

      {spending && spending.totalSpent > 0 && (
        <section className="insights">
          <div className="insight">
            <h3 className="insight__title">Tu inversión</h3>
            <div className="spend">
              <div className="spend__total">
                <span className="spend__amount">
                  ${spending.totalSpent.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                </span>
                <span className="spend__sub">
                  en {spending.winesWithPrice} {spending.winesWithPrice === 1 ? "vino" : "vinos"} con precio cargado
                </span>
              </div>

              {spending.bestValueWine && (
                <p className="spend__row">
                  <span className="spend__row-label">Mejor relación</span>
                  <span className="spend__row-value">
                    {spending.bestValueWine.name} · {spending.bestValueWine.rating}★
                  </span>
                </p>
              )}

              {spending.avgPriceByType?.length > 0 && (
                <p className="spend__row">
                  <span className="spend__row-label">Promedio por tipo</span>
                  <span className="spend__row-value">
                    {spending.avgPriceByType
                      .map((t) => `${WINE_TYPE_LABELS[t.type] || t.type} $${t.avgPrice.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`)
                      .join(" · ")}
                  </span>
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Lo que registraste, en dos secciones: las valoraciones (públicas) y el
          diario (privado). Van después de las estadísticas porque se leen de
          otra manera —una por una, sin apuro— y porque crecen sin techo,
          mientras que lo de arriba mide siempre lo mismo. Las dos se esconden
          solas si están vacías. */}
      <MyRatings />
      <MomentsDiary />

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

      {showPrefs && (
        <PreferencesEditor
          initialTypes={profileData.preferences?.favoriteTypes || []}
          initialVarietals={profileData.preferences?.favoriteVarietals || []}
          onClose={() => setShowPrefs(false)}
          onSaved={(prefs) =>
            setProfileData((p) => ({ ...p, preferences: { ...p.preferences, ...prefs } }))
          }
        />
      )}

      {showPassword && <PasswordEditor onClose={() => setShowPassword(false)} />}
    </div>
  );
}
