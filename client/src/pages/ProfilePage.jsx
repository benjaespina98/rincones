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
import Icon from "../components/Icon";
import DeleteAccountModal from "../components/DeleteAccountModal";
import { exportarMisDatos, eliminarCuenta } from "../services/accountApi";
import ProfileEditor from "../components/ProfileEditor";
import PreferencesEditor from "../components/PreferencesEditor";
import TypeSplit from "../components/TypeSplit";
import TopRanking from "../components/TopRanking";
import Contador from "../components/Contador";
import {
  fraseDelMes,
  esUva,
  limpiarRegion,
  agrupar,
  conRepeticion,
  queMostrarDeLaInversion,
} from "../utils/perfilDatos";
import MomentsDiary from "../components/MomentsDiary";
import CafecitoLink from "../components/CafecitoLink";

import ConfirmModal from "../components/ConfirmModal";
import "./ProfilePage.css";

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, isAdmin, logout, refreshUser } = useAuth();
  const { showSuccess, showError } = useToast();
  const { stats: wineStats, loading: statsLoading } = useWineStats();
  const { spending } = useSpendingStats();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
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

  /**
   * Bajar el archivo con todo lo cargado.
   *
   * El estado `exportando` no es decorativo: el archivo se arma del lado del
   * servidor leyendo cinco colecciones, y con una bodega grande puede tardar
   * unos segundos sin que pase nada visible. Sin el aviso, el toque parece no
   * haber funcionado y la persona lo repite.
   */
  const exportarDatos = async () => {
    if (exportando) return;
    setExportando(true);
    try {
      const nombre = await exportarMisDatos();
      showSuccess?.(`Descargamos ${nombre}`);
    } catch {
      errorHaptic();
      showError?.("No pudimos preparar el archivo. Probá de nuevo.");
    } finally {
      setExportando(false);
    }
  };

  /**
   * La baja.
   *
   * No se atrapa el error acá: el modal lo muestra adentro, al lado de los
   * campos, que es donde la persona está mirando. Atraparlo acá y mostrar un
   * toast dejaría el formulario abierto como si no hubiera pasado nada.
   */
  const eliminarMiCuenta = async ({ confirmEmail, password }) => {
    await eliminarCuenta({ confirmEmail, password });
    // La sesión ya no vale: el server borró el usuario y limpió las cookies.
    navigate("/login", { replace: true });
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

  /* ── LO QUE SE MUESTRA, DEPURADO ───────────────────────────────────────────
     Reglas en utils/perfilDatos.js. Un "Blend" no es una uva, "Mendoza" y
     "Mendoza Argentina" son la misma región, y un ranking donde nada se repite
     no es un ranking. Y un total de gasto sobre un solo vino con precio parece
     el de toda la bodega. */
  const uvasFrecuentes = conRepeticion(
    agrupar((wineStats?.topVarietals || []).filter((v) => esUva(v.varietal)), "varietal")
  );
  const regionesFrecuentes = conRepeticion(
    agrupar(wineStats?.topRegions || [], "region", limpiarRegion)
  );
  const inversion = spending
    ? queMostrarDeLaInversion({
        winesWithPrice: spending.winesWithPrice,
        totalVinos: wineStats?.totals?.total || 0,
        avgPriceByType: spending.avgPriceByType,
        bestValueWine: spending.bestValueWine,
      })
    : null;

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

        {/* "Cambiar contraseña" vivía acá, como pantalla propia con contraseña
            actual + nueva. Se fue: el camino de siempre es "Olvidé mi
            contraseña" desde el login, que ya existe (ResetPasswordPage) y no
            depende de que la persona recuerde la actual — que es justo el caso
            en el que más se necesita cambiarla. Mantener las dos puertas para
            la misma acción era el problema, no la solución. */}
        {isAdmin && (
          <button className="account-item" type="button" onClick={() => navigate("/admin")}>
            <span className="account-item__icon"><Icon name="grid" size={18} /></span>
            <span className="account-item__label">Panel de administración</span>
            <Icon name="chevron-right" size={16} className="account-item__chevron" />
          </button>
        )}

        {/* ── TUS DATOS ──────────────────────────────────────────────────────
            Llevárselos y darse de baja van juntos y en ese orden, porque son la
            misma decisión vista de dos lados. Sin la exportación, la baja
            obliga a elegir entre irse y conservar lo propio — y lo propio acá
            son años de cargar botellas con lo que se pagó, dónde está guardada
            cada una y con quién se tomó. */}
        <button className="account-item" type="button" onClick={() => navigate("/privacidad")}>
          <span className="account-item__icon"><Icon name="lock" size={18} /></span>
          <span className="account-item__label">Privacidad y términos</span>
          <Icon name="chevron-right" size={16} className="account-item__chevron" />
        </button>

        <button className="account-item" type="button" onClick={exportarDatos} disabled={exportando}>
          <span className="account-item__icon"><Icon name="arrow-right" size={18} /></span>
          <span className="account-item__label">
            {exportando ? "Preparando el archivo…" : "Descargar mis datos"}
          </span>
          {!exportando && <Icon name="chevron-right" size={16} className="account-item__chevron" />}
        </button>

        <button
          className="account-item account-item--danger"
          type="button"
          onClick={() => setShowLogoutConfirm(true)}
        >
          <span className="account-item__icon"><Icon name="log-out" size={18} /></span>
          <span className="account-item__label">Cerrar sesión</span>
        </button>

        {/* La baja va última y separada del resto: es la única acción de esta
            pantalla que no se puede deshacer. */}
        <button
          className="account-item account-item--danger"
          type="button"
          onClick={() => setShowDeleteAccount(true)}
        >
          <span className="account-item__icon"><Icon name="trash" size={18} /></span>
          <span className="account-item__label">Eliminar mi cuenta</span>
        </button>
      </div>

      <h2 className="profile-section-title">Tu perfil</h2>

      {/* ── UN NÚMERO CON TIEMPO ADENTRO ────────────────────────────────────
          Acá vivía la tarjeta de nivel ("Nv 3 · Conocedor", con barra de
          progreso): un logro de videojuego que no contestaba nada que se
          pudiera usar. Lo que faltaba de verdad era esto — los tres números de
          abajo son todos "de siempre" (vinos totales, probados totales) y
          ninguno dice si tomaste mucho ESTE mes. Un renglón, no una sección
          nueva: es la respuesta a la pregunta, no un bloque más para leer. */}
      {!statsLoading && (wineStats?.recientes?.esteAnio || 0) > 0 && (
        <p className="profile-recent">
          <Icon name="calendar" size={13} />{" "}
          {fraseDelMes({
            esteMes: wineStats.recientes.esteMes,
            esteAnio: wineStats.recientes.esteAnio,
            anio: new Date().getFullYear(),
          })}
        </p>
      )}

      {/* ── TRES NÚMEROS QUE AHORA DICEN ALGO ──────────────────────────────
          Eran "Vinos 8 · Probados 4 · Rating 4.2": ciertos y mudos. Un número
          sin referencia no se puede leer —¿8 es mucho?, ¿4.2 sobre qué?— y los
          tres datos que lo vuelven legible ya venían en la misma respuesta y no
          los miraba nadie: las BOTELLAS (que no son lo mismo que los vinos: ocho
          etiquetas pueden ser quince botellas), sobre CUÁNTOS probaste (en
          cifras, no en porcentaje — "1 de 2" no pide la cuenta que sí pide
          "50%"), y que el promedio sale sólo de lo que puntuaste. */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className={`value ${statsLoading ? "is-loading" : ""}`}>
            {statsLoading ? "" : <Contador valor={wineStats?.totals?.total || 0} />}
          </div>
          <div className="label">Vinos</div>
          {/* "4 botellas" solo, debajo de "2", se leía como un segundo dato
              suelto — ¿4 qué? Con "en" adelante queda una sola frase que se lee
              de corrido: "2 Vinos, en 4 botellas". */}
          {!statsLoading && (wineStats?.totals?.total || 0) > 0 && (
            <div className="stat-card__hint">
              {(wineStats?.totals?.bottles || 0) > 0
                ? `en ${wineStats.totals.bottles === 1 ? "1 botella" : `${wineStats.totals.bottles} botellas`}`
                : "sin botellas en stock"}
            </div>
          )}
        </div>
        <div className="stat-card">
          <div className={`value ${statsLoading ? "is-loading" : ""}`}>
            {statsLoading ? "" : <Contador valor={wineStats?.totals?.consumed || 0} />}
          </div>
          <div className="label">Ya tomados</div>
          {/* Antes era un porcentaje ("50% de tu colección"): pide una cuenta
              mental para volver al número de arriba. "1 de 2 vinos" usa el
              mismo par de cifras que ya está a la vista, sin traducirlas. */}
          {!statsLoading && (wineStats?.totals?.total || 0) > 0 && (
            <div className="stat-card__hint">
              {wineStats.totals.consumed === wineStats.totals.total
                ? wineStats.totals.total === 1 ? "tu único vino" : "todos tus vinos"
                : `de ${wineStats.totals.total} ${wineStats.totals.total === 1 ? "vino" : "vinos"}`}
            </div>
          )}
        </div>
        <div className="stat-card">
          <div className={`value ${statsLoading ? "is-loading" : ""}`}>
            {statsLoading ? "" : wineStats?.avgRating ? <Contador valor={wineStats.avgRating} decimales={1} /> : "—"}
          </div>
          <div className="label">Puntuación</div>
          {/* La raya sola, sin nada abajo, se leía como un dato roto. Ahora dice
              por qué está vacía en vez de sólo mostrar el vacío. */}
          {!statsLoading &&
            (wineStats?.avgRating > 0 ? (
              <div className="stat-card__hint">
                {wineStats.ratedCount > 0
                  ? `promedio de ${wineStats.ratedCount} ${wineStats.ratedCount === 1 ? "vino" : "vinos"}`
                  : "promedio de lo que puntuaste"}
              </div>
            ) : (
              <div className="stat-card__hint">todavía sin puntuar</div>
            ))}
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
      {/* Antes ésta y "Tu inversión" eran dos <section> seguidas, cada una con
          su propia caja: el gasto no es un tema distinto de qué tomás y qué
          elegís, es el mismo perfil visto desde otro número. Una sola sección
          con tres tarjetas adentro en vez de dos secciones con una y dos. */}
      {((wineStats && !statsLoading && (wineStats.totals?.total || 0) > 0) ||
        (spending && spending.totalSpent > 0 && inversion?.total)) && (
        <section className="insights">
          {wineStats && !statsLoading && (wineStats.totals?.total || 0) > 0 && (
            <>
              {wineStats.countsByType?.length > 0 && (
                <div className="insight">
                  <h3 className="insight__title">Qué tomás</h3>
                  <TypeSplit counts={wineStats.countsByType} total={wineStats.totals?.total || 0} />
                </div>
              )}

              {(uvasFrecuentes.length > 0 || regionesFrecuentes.length > 0) && (
                <div className="insight">
                  <h3 className="insight__title">Lo que más elegís</h3>
                  <div className="insight__cols">
                    <TopRanking label="Uvas" items={uvasFrecuentes} nameKey="varietal" />
                    <TopRanking label="Regiones" items={regionesFrecuentes} nameKey="region" />
                  </div>
                </div>
              )}
            </>
          )}

          {spending && spending.totalSpent > 0 && inversion?.total && (
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

                {inversion.mejorRelacion && (
                  <p className="spend__row">
                    <span className="spend__row-label">Mejor relación</span>
                    <span className="spend__row-value">
                      {spending.bestValueWine.name} · {spending.bestValueWine.rating}★
                    </span>
                  </p>
                )}

                {inversion.porTipo && (
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
          )}
        </section>
      )}

      {/* Con poco precio cargado no se muestra un total que parezca el de toda la
          bodega: se dice cuánto falta, que es lo único accionable. */}
      {!statsLoading && inversion?.aviso && <p className="profile-aviso">{inversion.aviso}</p>}

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

      {/* El final de la pantalla, a propósito: la letra chica de la app. */}
      <CafecitoLink />

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

      {/* La baja de cuenta. El modal pide el email escrito a mano y la
          contraseña: existía desde hace rato pero no estaba montado en ninguna
          pantalla, así que `DELETE /api/users/me` sólo se podía alcanzar por
          API. O sea que la app ofrecía borrar tus datos a quien supiera usar
          curl. */}
      <DeleteAccountModal
        isOpen={showDeleteAccount}
        email={user?.email}
        onCancel={() => setShowDeleteAccount(false)}
        onConfirm={eliminarMiCuenta}
        onExport={exportarDatos}
        exporting={exportando}
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
    </div>
  );
}
