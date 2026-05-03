import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../context/ToastContext";
import { getProfile, updateProfile } from "../services/authApi";
import "./SettingsPage.css";

const SettingsPage = () => {
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({
    theme: "dark",
    language: "es",
    emailNotifications: true,
    suggestions: true,
  });

  // Cargar preferencias al montar
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const profile = await getProfile();
        setSettings({
          theme: profile.preferences?.theme || "dark",
          language: profile.preferences?.language || "es",
          emailNotifications: profile.preferences?.notifications?.email ?? true,
          suggestions: profile.preferences?.notifications?.suggestions ?? true,
        });
      } catch (error) {
        showError("Error al cargar configuración");
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [showError]);

  const handleToggle = (key) => {
    setSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSelect = (key, value) => {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      await updateProfile({
        theme: settings.theme,
        language: settings.language,
        notifications: {
          email: settings.emailNotifications,
          suggestions: settings.suggestions,
        },
      });
      showSuccess("Configuración actualizada");
    } catch (error) {
      showError("Error al actualizar configuración");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-page__container">
        <div className="settings-header">
          <h1>Configuración</h1>
          <p>Personaliza tu experiencia en Rincones</p>
        </div>

        {/* Appearance */}
        <div className="settings-section">
          <h2>Apariencia</h2>

          <div className="settings-item">
            <div className="settings-item__label">
              <span className="settings-label-main">Tema</span>
              <span className="settings-label-sub">Elige el color de la interfaz</span>
            </div>
            <div className="theme-selector">
              {["light", "dark"].map((theme) => (
                <button
                  key={theme}
                  className={`theme-option ${settings.theme === theme ? "theme-option--active" : ""}`}
                  onClick={() => handleSelect("theme", theme)}
                  type="button"
                >
                  <span className="theme-option__icon">
                    {theme === "dark" ? "🌙" : "☀️"}
                  </span>
                  <span className="theme-option__label">
                    {theme === "dark" ? "Oscuro" : "Claro"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="settings-item">
            <div className="settings-item__label">
              <span className="settings-label-main">Idioma</span>
              <span className="settings-label-sub">Selecciona tu idioma preferido</span>
            </div>
            <select
              value={settings.language}
              onChange={(e) => handleSelect("language", e.target.value)}
              className="settings-select"
            >
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>

        {/* Notifications */}
        <div className="settings-section">
          <h2>Notificaciones</h2>

          <div className="settings-item">
            <div className="settings-item__label">
              <span className="settings-label-main">Notificaciones por email</span>
              <span className="settings-label-sub">Recibe actualizaciones importantes</span>
            </div>
            <button
              className={`toggle ${settings.emailNotifications ? "toggle--on" : ""}`}
              onClick={() => handleToggle("emailNotifications")}
              type="button"
              aria-label="Toggle email notifications"
            >
              <span className="toggle__circle"></span>
            </button>
          </div>

          <div className="settings-item">
            <div className="settings-item__label">
              <span className="settings-label-main">Sugerencias personalizadas</span>
              <span className="settings-label-sub">Recomendaciones basadas en tus vinos</span>
            </div>
            <button
              className={`toggle ${settings.suggestions ? "toggle--on" : ""}`}
              onClick={() => handleToggle("suggestions")}
              type="button"
              aria-label="Toggle suggestions"
            >
              <span className="toggle__circle"></span>
            </button>
          </div>
        </div>

        {/* Privacy & Security */}
        <div className="settings-section">
          <h2>Privacidad y seguridad</h2>

          <div className="settings-item settings-item--no-border">
            <div className="settings-item__label">
              <span className="settings-label-main">Cambiar contraseña</span>
              <span className="settings-label-sub">Actualiza tu contraseña regularmente</span>
            </div>
            <button className="button button--secondary button--small" type="button">
              Cambiar
            </button>
          </div>
        </div>

        {/* Help & About */}
        <div className="settings-section">
          <h2>Ayuda</h2>

          <div className="settings-item settings-item--no-border">
            <div className="settings-item__label">
              <span className="settings-label-main">Preguntas frecuentes</span>
              <span className="settings-label-sub">Aprende cómo usar Rincones</span>
            </div>
            <button className="button button--secondary button--small" type="button">
              Ver →
            </button>
          </div>

          <div className="settings-item settings-item--no-border">
            <div className="settings-item__label">
              <span className="settings-label-main">Acerca de Rincones</span>
              <span className="settings-label-sub">v1.0.0</span>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="settings-actions">
          <button
            className="button button--primary"
            onClick={handleSave}
            type="button"
            disabled={loading}
          >
            {loading ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
