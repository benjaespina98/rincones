import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../context/ToastContext";
import { useWineStats } from "../hooks/useWineStats";
import { useSpendingStats } from "../hooks/useSpendingStats";
import { getProfile, updateProfile } from "../services/authApi";
import { WINE_TYPE_LABELS } from "../data/wineReference";
import { calculateAge } from "../utils/age";
import { initials, avatarColor } from "../utils/identity";
import { errorHaptic } from "../utils/haptics";
import { getLevel } from "../utils/gamification";
import Icon from "../components/Icon";
import ProfileEditor from "../components/ProfileEditor";
import PreferencesEditor from "../components/PreferencesEditor";
import PasswordEditor from "../components/PasswordEditor";
import TypeSplit from "../components/TypeSplit";
import TopRanking from "../components/TopRanking";
import MomentsDiary from "../components/MomentsDiary";

import ConfirmModal from "../components/ConfirmModal";
import "../styles/pages/ProfilePage.css";

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, isAdmin, logout, refreshUser } = useAuth();
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
    avatar: user?.avatar || "",
    avatarPhoto: "",
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
      /**
       * El header vive de `user` (AuthContext), no de `profileData`.
       *
       * Son dos copias del mismo dato traídas de dos endpoints distintos
       * (`/auth/me` y `/users/me`), así que guardar acá dejaba la de arriba
       * vieja: cambiabas el nombre —o sacabas la foto de Google— y el header
       * seguía mostrando lo anterior hasta cerrar y volver a abrir la app.
       * Se notaba poco cuando el header sólo tenía iniciales; con la foto es
       * evidente.
       */
      await refreshUser?.();
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
        {/* La foto de Google, si la tenés, manda: es la foto de perfil de
            verdad. Sin foto, tus iniciales sobre el color que elegiste —las
            mismas que muestra la barra de arriba—. Acá vivía un emoji elegido
            de una fila de ocho, que era el único lugar de la app donde la
            cuenta se dibujaba como "una persona cualquiera" en vez de como la
            tuya, y encima no coincidía con el avatar del topbar tres
            centímetros más arriba. Ver `AVATAR_COLORS` en utils/identity.js. */}
        {profileData.avatarPhoto ? (
          <img className="avatar-large avatar-large--photo" src={profileData.avatarPhoto} alt="" />
        ) : (
          <div className={`avatar-large avatar-color--${avatarColor(profileData.avatar)}`}>
            {initials(user)}
          </div>
        )}
        <div className="profile-info">
          <span className="profile-kicker">Tu cuenta</span>
          {/* Sin nombre cargado, el <h2> quedaba VACÍO: el bloque más
              importante del perfil mostraba un hueco entre el rótulo y la
              edad. Una cuenta creada con Google o desde el panel puede no
              tener nombre todavía, y eso no es un error que haya que dibujar
              como un espacio en blanco — es algo que se puede completar, y la
              fila de abajo dice cómo. */}
          <h2>
            {[profileData.firstName, profileData.lastName].filter(Boolean).join(" ") || (
              <button type="button" className="profile-name-cta" onClick={() => setIsEditing(true)}>
                Poné tu nombre
              </button>
            )}
          </h2>
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
          <Icon name="chevron-right" size={16} className="account-item__chevron" />
        </button>

        <button className="account-item" type="button" onClick={() => setShowPrefs(true)}>
          <span className="account-item__icon"><Icon name="sparkles" size={18} /></span>
          <span className="account-item__label">Preferencias de gusto</span>
          <Icon name="chevron-right" size={16} className="account-item__chevron" />
        </button>

        <button className="account-item" type="button" onClick={() => setShowPassword(true)}>
          <span className="account-item__icon"><Icon name="lock" size={18} /></span>
          <span className="account-item__label">Cambiar contraseña</span>
          <Icon name="chevron-right" size={16} className="account-item__chevron" />
        </button>

        {/* Ícono propio: llevaba el mismo candado que "Cambiar contraseña", dos
            filas más arriba. Dos renglones seguidos con el mismo dibujo y
            destinos que no tienen nada que ver se leen como si fueran lo
            mismo. */}
        {isAdmin && (
          <button className="account-item" type="button" onClick={() => navigate("/admin")}>
            <span className="account-item__icon"><Icon name="grid" size={18} /></span>
            <span className="account-item__label">Panel de administración</span>
            <Icon name="chevron-right" size={16} className="account-item__chevron" />
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

      <h2 className="profile-section-title">Tu perfil</h2>

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
                      ? "Nivel máximo"
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

      {/* ── TRES NÚMEROS QUE AHORA DICEN ALGO ──────────────────────────────
          Eran "Vinos 8 · Probados 4 · Rating 4.2": ciertos y mudos. Un número
          sin referencia no se puede leer —¿8 es mucho?, ¿4.2 sobre qué?— y los
          tres datos que lo vuelven legible ya venían en la misma respuesta y no
          los miraba nadie: las BOTELLAS (que no son lo mismo que los vinos: ocho
          etiquetas pueden ser quince botellas), qué PARTE de tu colección
          probaste, y que el promedio sale sólo de lo que puntuaste. */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className={`value ${statsLoading ? "is-loading" : ""}`}>
            {statsLoading ? "" : wineStats?.totals?.total || 0}
          </div>
          <div className="label">Vinos</div>
          {!statsLoading && (wineStats?.totals?.bottles || 0) > 0 && (
            <div className="stat-card__hint">
              {wineStats.totals.bottles === 1
                ? "1 botella"
                : `${wineStats.totals.bottles} botellas`}
            </div>
          )}
        </div>
        <div className="stat-card">
          <div className={`value ${statsLoading ? "is-loading" : ""}`}>
            {statsLoading ? "" : wineStats?.totals?.consumed || 0}
          </div>
          <div className="label">Probados</div>
          {!statsLoading && (wineStats?.totals?.total || 0) > 0 && (
            <div className="stat-card__hint">
              {Math.round(((wineStats.totals.consumed || 0) / wineStats.totals.total) * 100)}% de tu
              colección
            </div>
          )}
        </div>
        <div className="stat-card">
          <div className={`value ${statsLoading ? "is-loading" : ""}`}>
            {statsLoading ? "" : wineStats?.avgRating ? wineStats.avgRating.toFixed(1) : "—"}
          </div>
          <div className="label">Puntuación</div>
          {!statsLoading && wineStats?.avgRating > 0 && (
            <div className="stat-card__hint">promedio de lo que puntuaste</div>
          )}
        </div>
      </div>

      {/* Usuario nuevo: sin esto, después de los tres ceros la pantalla se
          cortaba sin explicar que el perfil de gusto se construye solo. */}
      {!statsLoading && (wineStats?.totals?.total || 0) === 0 && (
        <div className="profile-empty">
          <p className="profile-empty__title">Todavía no hay datos suficientes</p>
          <p className="profile-empty__hint">
            Cargá vinos y acá vas a ver tus uvas, tus regiones y cómo puntuás.
          </p>
          <button type="button" className="empty-cta" onClick={() => navigate("/agregar")}>
            Escanear una etiqueta
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
          con un solo número y sin señalar deudas. */}

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

      {/* ── LAS VALORACIONES SON UNA PUERTA, NO UNA SECCIÓN ────────────────
          Acá estaba la lista abierta: cuatro valoraciones y un "ver las 23".
          Sumada a la cabecera, la lista de cuenta, el nivel, las estadísticas,
          el gasto y el diario, el perfil era una pantalla de scroll sin fondo
          donde nada se encontraba dos veces seguidas.

          Ahora es un renglón que dice cuántas son y las lleva a su propia
          pantalla, que es como lo resuelven las apps que ya pasaron por esto.
          El renglón se esconde solo si no puntuaste nada: una puerta a una
          habitación vacía es peor que ninguna puerta. */}
      {(wineStats?.ratedCount || 0) > 0 && (
        <button
          type="button"
          className="account-item account-item--feature"
          onClick={() => navigate("/valoraciones")}
        >
          <span className="account-item__icon"><Icon name="star" size={18} /></span>
          <span className="account-item__label">
            Tus valoraciones
            <em>{wineStats.ratedCount} {wineStats.ratedCount === 1 ? "vino puntuado" : "vinos puntuados"} · públicas</em>
          </span>
          {/* El mismo chevron que las otras filas de la lista: acá era una
              flecha distinta, así que dos filas que hacen lo mismo —llevarte a
              otra pantalla— se señalaban con dos símbolos. */}
          <Icon name="chevron-right" size={16} className="account-item__chevron" />
        </button>
      )}
      {/* Cuántos vinos probaste: es lo que decide si el diario vacío se muestra
          como invitación o no se muestra en absoluto. Ver MomentsDiary. */}
      <MomentsDiary probados={wineStats?.totals?.consumed || 0} />

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
