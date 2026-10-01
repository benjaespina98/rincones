import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { WINE_TYPES, VARIETALS } from "../data/wineReference";
import { saveOnboarding } from "../services/authApi";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../context/ToastContext";
import { successHaptic, tapHaptic } from "../utils/haptics";
import Icon from "../components/Icon";
import Logo from "../components/Logo";
import "../components/OnboardingModal.css";

/**
 * Onboarding obligatorio de preferencias, en 2 pasos.
 *
 * ── POR QUÉ ES UNA RUTA Y NO EL MODAL DE ANTES ──────────────────────────────
 * El modal vivía en `AppLayout` y se cerraba con un estado LOCAL del
 * componente (`onbDismissed`): sobrevivía a un re-render pero no a nada más,
 * así que en la práctica dependía de que `user.onboarded` llegara bien desde
 * el arranque. Y no llegaba: `buildAuthResponse` (server) no incluía
 * `onboarded`, así que justo después de registrarse quedaba `undefined` —
 * distinto de `false` — y el modal ni se mostraba. Recién se corregía solo
 * al volver a abrir la app (`/auth/me` sí lo devuelve), momento en el que el
 * onboarding aparecía "de la nada" en medio del uso normal. Los dos bugs
 * están resueltos: el server ahora manda `onboarded` en las cuatro respuestas
 * de auth, y esto ya no es un modal que se pueda perder — es una ruta que
 * `AppGate` fuerza antes de dejar pasar a cualquier otra pantalla.
 *
 * Mismo criterio visual que antes (`onb__*`, en OnboardingModal.css): el
 * fondo ya cubre el viewport entero, así que como página de nivel superior se
 * ve exactamente igual, sin la capa de `Portal` que hacía falta para escapar
 * del stacking context de `AppLayout`.
 */

const POPULAR_VARIETALS = [
  "Malbec", "Cabernet Sauvignon", "Merlot", "Syrah", "Pinot Noir",
  "Bonarda", "Cabernet Franc", "Chardonnay", "Sauvignon Blanc", "Torrontés",
  "Blend",
].filter((v) => v === "Blend" || VARIETALS.includes(v));

const toggle = (list, value) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const { showError } = useToast();
  const [step, setStep] = useState(0);
  const [types, setTypes] = useState([]);
  const [varietals, setVarietals] = useState([]);
  const [saving, setSaving] = useState(false);

  const finish = async () => {
    try {
      setSaving(true);
      await saveOnboarding({ favoriteTypes: types, favoriteVarietals: varietals });
      successHaptic();
      // El `user` de AuthContext es el que decide el gate (ver AppGate): sin
      // refrescarlo acá, `onboarded` seguiría en `false` y la navegación de
      // abajo rebotaría de nuevo contra esta misma pantalla.
      await refreshUser();
      navigate("/bodega", { replace: true });
    } catch {
      showError("No se pudieron guardar tus preferencias. Probá de nuevo.");
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
    <div className="onb">
      <div className="onb__panel">
        <div className="onb__progress">
          <span className={`onb__dot ${step >= 0 ? "is-on" : ""}`} />
          <span className={`onb__dot ${step >= 1 ? "is-on" : ""}`} />
        </div>

        {step === 0 && (
          <div className="onb__step">
            <span className="onb__mark"><Logo size={34} /></span>
            {/* Sin género: es el título más visible de la app y le ponía sexo a
                quien lo estaba leyendo. Ver la nota en LoginPage. */}
            {/* Sin el 🍷: la marca ya tiene su logo arriba, dibujado. Un emoji
                al lado del nombre es el gesto de una app que quiere caer bien.
                Y sin género —"Bienvenido/a" le pone sexo a quien lo lee—, que es
                por lo que antes decía "Te damos la bienvenida". */}
            <h1 className="onb__title">Empecemos</h1>
            <p className="onb__sub">¿Qué estilos tomás?</p>

            <div className="onb__grid">
              {WINE_TYPES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={`onb__chip ${types.includes(value) ? "is-sel" : ""}`}
                  /* La primera vez que alguien ve la app, "Tinto" y "Blanco"
                     son dos palabras iguales en un violeta igual. Con el tipo
                     puesto, cada una se enciende con SU color al elegirla: es
                     la misma clave que despues va a usar para reconocer un vino
                     en la lista, y se aprende acá sin que nadie la explique. */
                  data-wine-type={value}
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
            {/* Sin el "(podés cambiarlos después)": es una promesa que ninguna
                app hace falta que haga, y el paso ya tiene "Omitir". */}
            <h1 className="onb__title">¿Y qué uvas?</h1>
            <p className="onb__sub">Elegí las que más tomás.</p>

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

        {/* Sigue habiendo una salida rápida sin elegir nada — obligar a tocar
            algo para poder entrar sería peor que preguntar de más — pero acá
            "omitir" también termina el onboarding (`finish()` guarda listas
            vacías y marca `onboardedAt`). No es una forma de posponerlo: es la
            respuesta "no tengo preferencia todavía", y cuenta como completado. */}
        <button type="button" className="onb__skip" onClick={finish} disabled={saving}>
          Omitir
        </button>
      </div>
    </div>
  );
}
