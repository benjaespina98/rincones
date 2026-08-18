import { useEffect, useState } from "react";
import Icon from "./Icon";
import Portal from "./Portal";
import ConceptTerm from "./ConceptTerm";
import { NIGHT_PLANS, playlistFor, playlistUrl } from "../data/playlists";
import { planTitle, planHint } from "../utils/momentCopy";
import { getWineRecipe } from "../services/wineSearchApi";
import "../styles/components/SettingsSheet.css";
import "../styles/components/WinePlan.css";

/**
 * El plan: qué hacer con esta botella.
 *
 * ── POR QUÉ EL TÍTULO NO DICE SIEMPRE "LA NOCHE" ────────────────────────────
 * Se llamaba "Plan de la noche" a cualquier hora. La app se abre a las nueve de
 * la mañana y a las tres de la tarde tanto como a las diez de la noche, y una
 * copa a la tardecita es un plan igual de válido: el único que no se había
 * enterado era el rótulo. Ahora sale del reloj (ver utils/momentCopy.js), como
 * el saludo y el título de la home.
 *
 * ── QUÉ PROBLEMA RESUELVE ───────────────────────────────────────────────────
 * La app ya sabía la temperatura de servicio y el maridaje, pero los tenía
 * enterrados en la ficha de IA y dichos como datos sueltos: "16-18 °C" y
 * "carne roja, quesos, pastas". Eso no le sirve a nadie parado en la cocina con
 * la botella en la mano. Acá las mismas cosas se dicen como lo que son: una
 * instrucción para esta noche.
 *
 * ── POR QUÉ ES INSTANTÁNEO ──────────────────────────────────────────────────
 * Elegir el plan no llama a ningún lado: la temperatura sale de la ficha que ya
 * está cargada (o de una tabla por tipo), y la playlist de una lista fija. Toca
 * un chip y aparece todo. La receta —lo único que hay que pensar de verdad— se
 * pide aparte y sólo si la querés.
 *
 * ── POR QUÉ LA RECETA SE ABRE EN UNA HOJA ───────────────────────────────────
 * Desplegada acá adentro medía 400px y empujaba las notas, los momentos y el
 * historial casi una pantalla hacia abajo — en una ficha que ya es larga. Una
 * receta se lee de una sentada y con las manos ocupadas: merece la pantalla
 * entera mientras se la lee, y no ocupar nada cuando no. Es la misma hoja que
 * usan los filtros y las preferencias.
 */

// Temperaturas de servicio por tipo, para cuando la ficha no trae `serve`.
// Son las de manual y no dependen de la botella: tomar un tinto a temperatura
// ambiente de verano argentino es el error más común y más fácil de evitar.
const TEMPERATURAS = {
  red: "16-18 °C",
  white: "8-10 °C",
  "rosé": "8-10 °C",
  sparkling: "6-8 °C",
  fortified: "12-14 °C",
};

// Otras versiones del plato, fuera de la app. La receta que damos es una; quien
// cocina siempre quiere comparar dos o tres antes de decidirse.
const recetasWeb = (plato) =>
  `https://www.google.com/search?q=${encodeURIComponent(`${plato} receta`)}`;

export default function WinePlan({ wine, info }) {
  const [plan, setPlan] = useState(null);
  // Las recetas ya traídas, por plan: cambiar de plan y volver no vuelve a pedir.
  const [recipes, setRecipes] = useState({});
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!sheetOpen) return undefined;
    const alTeclear = (e) => {
      if (e.key === "Escape") setSheetOpen(false);
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [sheetOpen]);

  const temperatura = info?.serve || TEMPERATURAS[wine.type] || "";

  // Un tinto muy tánico gana con aire; el resto no necesita que le digamos nada.
  // Sale de `structure`, que ya viene en la ficha, así que es específico de este
  // vino y no una regla genérica sobre los tintos.
  const airear = wine.type === "red" && Number(info?.structure?.tannin) >= 4;

  const receta = plan ? recipes[plan] : null;
  // La estructura viaja junto al tipo: con el cuerpo de ESTA botella, un Pinot
  // liviano deja de recibir la música de un tinto pesado sólo por ser tinto.
  const playlist = plan
    ? playlistFor(plan, wine.type, new Date().getHours(), info?.structure)
    : null;

  const elegirPlan = (value) => {
    setFailed(false);
    setPlan((actual) => (actual === value ? null : value));
  };

  const verReceta = async () => {
    if (!plan || loading) return;
    // Ya la teníamos: se abre y listo, sin volver a pedirla.
    if (recipes[plan]) {
      setSheetOpen(true);
      return;
    }

    setLoading(true);
    setFailed(false);
    try {
      const data = await getWineRecipe(wine, plan);
      if (data) {
        setRecipes((prev) => ({ ...prev, [plan]: data }));
        setSheetOpen(true);
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  // Se calculan una vez por render y no cambian mientras la ficha está abierta:
  // nadie tiene una ficha de vino abierta el tiempo suficiente como para cruzar
  // una franja horaria, y si pasa, se acomoda solo en la próxima visita.
  const titulo = planTitle();

  return (
    <section className="wine-plan" aria-label={titulo}>
      <div className="wine-plan__head">
        <h3>
          <Icon name="sparkles" size={15} /> {titulo}
        </h3>
        {!plan && <span className="wine-plan__hint">{planHint()}</span>}
      </div>

      {/* ── LA TEMPERATURA, EN DOS PASTILLAS Y NO EN UN PÁRRAFO ─────────────
          Era una oración de tres renglones que mezclaba dos instrucciones y una
          explicación ("Servila a 16-18 °C — abrila media hora antes: el aire le
          baja el tanino"), con dos palabras subrayadas en el medio. Se leía como
          un texto y son dos datos: cada uno en su pastilla, cada uno tocable, y
          el porqué adentro de la tarjeta que ya lo explica bien.

          Es lo único que se ve sin elegir plan, porque no depende del plan. */}
      {temperatura && (
        <div className="wine-plan__serve">
          <span className="wine-plan__pill">
            <Icon name="bottle" size={13} />
            Servila a{" "}
            <ConceptTerm id="temperatura" ctx={{ wine, info, serve: temperatura }}>
              {temperatura}
            </ConceptTerm>
          </span>
          {airear && (
            <span className="wine-plan__pill">
              <ConceptTerm id="decantar" ctx={{ wine, info }}>
                Abrila 30 min antes
              </ConceptTerm>
            </span>
          )}
        </div>
      )}

      {/* Una sola fila que se desliza, no tres que se apilan: cuatro planes
          entran casi enteros en un teléfono y los que no, se alcanzan
          arrastrando. Antes eran seis chips en tres renglones, media pantalla
          para elegir una palabra. */}
      <div className="wine-plan__chips" role="group" aria-label="Elegí el plan">
        {NIGHT_PLANS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className={`wine-plan__chip ${plan === value ? "is-on" : ""}`}
            onClick={() => elegirPlan(value)}
            aria-pressed={plan === value}
          >
            {label}
            {/* La cruz en el chip elegido: volver a tocarlo siempre cerró el
                plan, pero eso había que descubrirlo. Con la × el camino de
                vuelta se ve, que es lo que se le pide a cualquier cosa que se
                abre. */}
            {plan === value && <Icon name="x" size={12} className="wine-plan__chip-x" />}
          </button>
        ))}
      </div>

      {plan && (
        <div className="wine-plan__body">
          {playlist && (
            <a
              className="wine-plan__music"
              href={playlistUrl(playlist)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="wine-plan__music-icon">
                <Icon name="play" size={14} />
              </span>
              <span className="wine-plan__music-text">
                <strong>{playlist.name}</strong>
                <em>{playlist.mood}</em>
              </span>
              <Icon name="arrow-right" size={16} />
            </a>
          )}

          {/* Un solo botón, que cambia de texto según lo que va a pasar: pedir la
              receta, reintentarla, o abrir la que ya está. */}
          <button
            type="button"
            className="wine-plan__cta"
            onClick={verReceta}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="wine-plan__spin" aria-hidden="true" />
                Pensando qué le va…
              </>
            ) : (
              <>
                <Icon name="utensils" size={15} />
                {receta ? receta.dish : failed ? "Reintentar la receta" : "Qué cocinar para acompañarla"}
              </>
            )}
          </button>

          {failed && !loading && (
            <p className="wine-plan__failed">
              No se pudo armar la receta ahora. La botella y la música siguen en pie.
            </p>
          )}
        </div>
      )}

      {sheetOpen && receta && (
        <Portal>
          <div className="settings-sheet" onClick={() => setSheetOpen(false)} role="presentation">
            <div
              className="settings-sheet__panel wine-recipe-sheet"
              role="dialog"
              aria-modal="true"
              aria-label={`Receta: ${receta.dish}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="settings-sheet__head">
                <h2>{receta.dish}</h2>
                <button
                  type="button"
                  className="settings-sheet__close"
                  onClick={() => setSheetOpen(false)}
                  aria-label="Cerrar la receta"
                >
                  <Icon name="x" size={16} />
                </button>
              </div>

              <div className="settings-sheet__body wine-recipe">
                {/* El maridaje se explica justo donde acaba de aplicarse: abajo
                    de la frase que dice por qué ESTE plato va con ESTE vino. En
                    abstracto, "maridaje" no le interesa a nadie. */}
                {receta.why && (
                  <p className="wine-recipe__why">
                    {receta.why}{" "}
                    <ConceptTerm id="maridaje" ctx={{ wine, info }} className="wine-recipe__why-term">
                      ¿cómo se marida?
                    </ConceptTerm>
                  </p>
                )}

                {(receta.time || receta.servings) && (
                  <p className="wine-recipe__meta">
                    {receta.time && <span>{receta.time}</span>}
                    {receta.servings && (
                      <span>
                        <Icon name="users" size={12} /> {receta.servings}
                      </span>
                    )}
                  </p>
                )}

                {/* "Ingredientes" y "Preparación", como cualquier receta de
                    verdad. El tono gourmet va en cómo está escrita la receta, no
                    en rótulos que haya que descifrar. */}
                <h3 className="wine-recipe__label">Ingredientes</h3>
                <ul className="wine-recipe__ingredients">
                  {receta.ingredients.map((ing, i) => (
                    <li key={i}>{ing}</li>
                  ))}
                </ul>

                <h3 className="wine-recipe__label">Preparación</h3>
                <ol className="wine-recipe__steps">
                  {receta.steps.map((paso, i) => (
                    <li key={i}>{paso}</li>
                  ))}
                </ol>

                <a
                  className="wine-recipe__web"
                  href={recetasWeb(receta.dish)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ver otras versiones de este plato <Icon name="arrow-right" size={15} />
                </a>

                <p className="wine-recipe__note">
                  Pensada para esta botella. Ajustá las cantidades a tu gusto y los
                  tiempos a tu horno.
                </p>

                {/* La salida abajo, además de la × de arriba. Una receta se lee
                    scrolleando hasta el final, y ahí el cierre queda tres
                    pantallas atrás: pedirle a alguien que suba para poder salir
                    es hacerle deshacer todo el camino que acaba de recorrer. */}
                <button
                  type="button"
                  className="wine-recipe__done"
                  onClick={() => setSheetOpen(false)}
                >
                  Listo, cerrar
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </section>
  );
}
