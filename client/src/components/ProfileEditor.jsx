import { useEffect, useRef, useState } from "react";
import { birthDateError, maxBirthDateForAge } from "../utils/age";
import Icon from "./Icon";
import "../styles/components/ProfileEditor.css";
import Portal from "./Portal";

const AVATAR_OPTIONS = ["👤", "🍷", "🍇", "🥂", "🍾", "🧑‍🌾", "😎", "🌟"];

const BIO_MAX = 180;
const NAME_MAX = 40;

// El server manda birthDate como ISO completo; el <input type="date"> necesita
// sólo "YYYY-MM-DD".
const toDateInput = (value) => (value ? String(value).slice(0, 10) : "");

const getInitial = (data) => ({
  firstName: data?.firstName || "",
  lastName: data?.lastName || "",
  city: data?.city || "",
  country: data?.country || "",
  bio: data?.bio || "",
  birthDate: toDateInput(data?.birthDate),
  avatar: data?.avatar || "👤",
});

/**
 * Editor de perfil a pantalla completa.
 *
 * Antes la edición reemplazaba el contenido de la página de perfil por un
 * formulario suelto: se perdían las estadísticas y no se leía como "otra
 * pantalla". Este patrón —overlay full-screen con header Cancelar/Guardar— es
 * el de las apps reales (Instagram, LinkedIn) y deja claro que estás editando.
 */
// El padre monta este componente sólo cuando se está editando (y le pasa una
// `key` para forzar estado fresco), así el formulario se inicializa desde
// `initialData` sin efectos de sincronización.
export default function ProfileEditor({ initialData, email, saving, onCancel, onSave }) {
  const [form, setForm] = useState(() => getInitial(initialData));
  const [error, setError] = useState("");
  const firstFieldRef = useRef(null);

  // Bloquea el scroll del fondo y da foco al primer campo al abrir.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = setTimeout(() => firstFieldRef.current?.focus(), 120);
    return () => {
      document.body.style.overflow = previous;
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !saving) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [saving, onCancel]);

  const setField = (name, value) => {
    setError("");
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const validate = () => {
    if (form.firstName.trim().length < 2) return "El nombre debe tener al menos 2 caracteres.";
    if (form.firstName.length > NAME_MAX || form.lastName.length > NAME_MAX)
      return `Nombre y apellido pueden tener hasta ${NAME_MAX} caracteres.`;
    const birthErr = birthDateError(form.birthDate);
    if (birthErr) return birthErr;
    if (form.bio.length > BIO_MAX) return `La bio puede tener hasta ${BIO_MAX} caracteres.`;
    return "";
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    onSave(form);
  };

  const displayName = `${form.firstName} ${form.lastName}`.trim() || "Tu nombre";

  return (
    <Portal>
      <div className="profile-editor" role="dialog" aria-modal="true" aria-label="Editar perfil">
        <form className="profile-editor__panel" onSubmit={handleSubmit}>
          <header className="profile-editor__bar">
            <button
              type="button"
              className="profile-editor__bar-btn"
              onClick={onCancel}
              disabled={saving}
            >
              Cancelar
            </button>
            <span className="profile-editor__bar-title">Editar perfil</span>
            <button
              type="submit"
              className="profile-editor__bar-btn profile-editor__bar-btn--primary"
              disabled={saving}
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </header>

          <div className="profile-editor__scroll">
            <section className="profile-editor__avatar-section">
              <div className="profile-editor__avatar">{form.avatar}</div>
              <p className="profile-editor__avatar-label">Elegí tu avatar</p>
              <div className="profile-editor__avatar-options">
                {AVATAR_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className={`profile-editor__avatar-chip ${
                      form.avatar === emoji ? "is-selected" : ""
                    }`}
                    onClick={() => setField("avatar", emoji)}
                    aria-label={`Avatar ${emoji}`}
                    aria-pressed={form.avatar === emoji}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </section>

            <section className="profile-editor__group">
              <span className="profile-editor__group-title">Datos personales</span>

              <div className="profile-editor__row">
                <label className="profile-editor__field">
                  <span>Nombre</span>
                  <input
                    ref={firstFieldRef}
                    type="text"
                    value={form.firstName}
                    maxLength={NAME_MAX}
                    onChange={(e) => setField("firstName", e.target.value)}
                    placeholder="Benjamín"
                  />
                </label>
                <label className="profile-editor__field">
                  <span>Apellido</span>
                  <input
                    type="text"
                    value={form.lastName}
                    maxLength={NAME_MAX}
                    onChange={(e) => setField("lastName", e.target.value)}
                    placeholder="Espina"
                  />
                </label>
              </div>

              <label className="profile-editor__field">
                <span>Fecha de nacimiento</span>
                <input
                  type="date"
                  value={form.birthDate}
                  max={maxBirthDateForAge()}
                  onChange={(e) => setField("birthDate", e.target.value)}
                />
              </label>

              <div className="profile-editor__readonly">
                <span>Correo</span>
                <p title={email}>{email || "—"}</p>
              </div>
            </section>

            <section className="profile-editor__group">
              <span className="profile-editor__group-title">Ubicación</span>
              <div className="profile-editor__row">
                <label className="profile-editor__field">
                  <span>Ciudad</span>
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => setField("city", e.target.value)}
                    placeholder="Mendoza"
                  />
                </label>
                <label className="profile-editor__field">
                  <span>País</span>
                  <input
                    type="text"
                    value={form.country}
                    onChange={(e) => setField("country", e.target.value)}
                    placeholder="Argentina"
                  />
                </label>
              </div>
            </section>

            <section className="profile-editor__group">
              <span className="profile-editor__group-title">Sobre vos</span>
              <label className="profile-editor__field">
                <span>Bio</span>
                <textarea
                  value={form.bio}
                  maxLength={BIO_MAX}
                  rows={4}
                  onChange={(e) => setField("bio", e.target.value)}
                  placeholder="Amante del Malbec y las tardes de picada…"
                />
                <small className="profile-editor__count">
                  {form.bio.length}/{BIO_MAX}
                </small>
              </label>
            </section>

            {error && (
              <p className="profile-editor__error" role="alert">
                <Icon name="alert-triangle" size={15} /> {error}
              </p>
            )}

            <p className="profile-editor__preview-hint">
              Aparecerás como <strong>{displayName}</strong>
            </p>
          </div>
        </form>
      </div>
  </Portal>
  );
}
