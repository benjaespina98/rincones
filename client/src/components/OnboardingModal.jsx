import { useEffect, useState } from "react";
import { WINE_TYPES, VARIETALS } from "../data/wineReference";
import { saveOnboarding } from "../services/authApi";
import { useToast } from "../context/ToastContext";
import { successHaptic, tapHaptic } from "../utils/haptics";
import Icon from "./Icon";
import "../styles/components/OnboardingModal.css";
import Portal from "./Portal";

// Un subconjunto de varietales populares para no abrumar en el onboarding.
const POPULAR_VARIETALS = [
  "Malbec", "Cabernet Sauvignon", "Merlot", "Syrah", "Pinot Noir",
  "Bonarda", "Cabernet Franc", "Chardonnay", "Sauvignon Blanc", "Torrontés",
  "Blend",
].filter((v) => v === "Blend" || VARIETALS.includes(v));

const toggle = (list, value) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

/**
 * Onboarding de bienvenida: en 2 pasos rápidos el usuario elige qué estilos y
 * varietales le gustan. Se muestra una sola vez (flag onboarded) y personaliza
 * la experiencia. Diseño minimalista, mobile-first.
 */
export default function OnboardingModal({ onDone }) {
  const { showError } = useToast();
  const [step, setStep] = useState(0);
  const [types, setTypes] = useState([]);
  const [varietals, setVarietals] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const finish = async () => {
    try {
      setSaving(true);
      await saveOnboarding({ favoriteTypes: types, favoriteVarietals: varietals });
      successHaptic();
      onDone?.();
    } catch {
      showError("No pudimos guardar tus preferencias. Probá de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const next = () => {
    tapHaptic();
    if (step < 1) setStep(step + 1);
    else finish();
  };

  return (
    <Portal>
      <div className="onb" role="dialog" aria-modal="true" aria-label="Bienvenida">
        <div className="onb__panel">
          <div className="onb__progress">
            <span className={`onb__dot ${step >= 0 ? "is-on" : ""}`} />
            <span className={`onb__dot ${step >= 1 ? "is-on" : ""}`} />
          </div>

          {step === 0 && (
            <div className="onb__step">
              <span className="onb__mark"><Icon name="wine-glass" filled size={30} /></span>
              <h1 className="onb__title">Bienvenido a Rincones 🍷</h1>
              <p className="onb__sub">Para arrancar, ¿qué estilos de vino te gustan más?</p>

              <div className="onb__grid">
                {WINE_TYPES.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    className={`onb__chip ${types.includes(value) ? "is-sel" : ""}`}
                    onClick={() => { tapHaptic(); setTypes((t) => toggle(t, value)); }}
                    aria-pressed={types.includes(value)}
                  >
                    {label}
                    {types.includes(value) && <Icon name="check" size={15} />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="onb__step">
              <span className="onb__mark"><Icon name="sparkle" filled size={28} /></span>
              <h1 className="onb__title">¿Y tus varietales?</h1>
              <p className="onb__sub">Elegí los que más disfrutás (podés cambiarlos después).</p>

              <div className="onb__grid onb__grid--wrap">
                {POPULAR_VARIETALS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={`onb__chip ${varietals.includes(v) ? "is-sel" : ""}`}
                    onClick={() => { tapHaptic(); setVarietals((s) => toggle(s, v)); }}
                    aria-pressed={varietals.includes(v)}
                  >
                    {v}
                    {varietals.includes(v) && <Icon name="check" size={15} />}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="onb__actions">
            {step === 1 && (
              <button type="button" className="onb__back" onClick={() => setStep(0)} disabled={saving}>
                Atrás
              </button>
            )}
            <button type="button" className="onb__next" onClick={next} disabled={saving}>
              {saving ? "Guardando…" : step === 0 ? "Continuar" : "Empezar"}
              {!saving && <Icon name="arrow-right" size={17} />}
            </button>
          </div>

          <button type="button" className="onb__skip" onClick={finish} disabled={saving}>
            Omitir por ahora
          </button>
        </div>
      </div>
  </Portal>
  );
}
