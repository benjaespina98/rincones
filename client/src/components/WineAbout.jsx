import { useState } from "react";
import Icon from "./Icon";
import WineStructure from "./WineStructure";
import LoadingSkeleton from "./LoadingSkeleton";
import ErrorState from "./ErrorState";

/**
 * "Sobre este vino": lo que la app sabe del vino, generado con IA.
 *
 * Estaba escrito dos veces —en la ficha de un vino propio y en la del catálogo—
 * y ya había empezado a separarse: un lado tenía un descargo al pie que el otro
 * no. Es la misma información y se ve igual en los dos lados.
 *
 * ── POR QUÉ MUESTRA MENOS DE LO QUE RECIBE ──────────────────────────────────
 * El modelo devuelve más de lo que conviene leer. Dos recortes:
 *
 * 1. El perfil en pastillas ("Cuerpo medio", "Taninos suaves", "Seco") son los
 *    mismos cuatro ejes que las barras, dichos otra vez sin el número —y a veces
 *    en desacuerdo con ellas—. Sólo salen si no hubo barras.
 * 2. Aromas y maridajes se cortan en cuatro. Los primeros son los que definen el
 *    vino; del quinto en adelante son variaciones que ya no lo distinguen de
 *    ningún otro, y la ficha se vuelve una pared de pastillas.
 */

const MAX_CHIPS = 4;

export default function WineAbout({ loading, failed, info, onRetry }) {
  // Plegado por defecto. El resumen es lo que se lee siempre; las barras, los
  // aromas y la graduación son material de consulta que se mira una vez y
  // sumaba media pantalla de scroll en TODAS las visitas siguientes.
  const [abierto, setAbierto] = useState(false);

  if (!loading && !failed && !info) return null;

  // Si no hay nada detrás del resumen, no se ofrece abrir nada.
  const hayDetalle = Boolean(
    info && (info.body || info.structure || info.profile?.length || info.aromas?.length || info.alcohol)
  );

  return (
    <div className="wine-about">
      {/* El ícono y el rótulo ya dicen que es generado; abajo había además un
          renglón de descargo repitiéndolo. Va en el title. */}
      <div className="wine-about__head">
        <h3 title="Descripción orientativa generada con IA">
          <Icon name="sparkles" size={16} /> Sobre este vino
        </h3>
        {info && !info.known && (
          <span className="wine-about__tag" title="Del estilo, no de esta botella">
            aproximado
          </span>
        )}
      </div>

      {loading && <LoadingSkeleton type="inline" count={3} />}

      {failed && !loading && (
        <ErrorState title="No se pudo generar la descripción" onRetry={onRetry} compact />
      )}

      {info && !loading && (
        <>
          {info.summary && <p className="wine-about__summary">{info.summary}</p>}

          {hayDetalle && (
            <button
              type="button"
              className="wine-about__toggle"
              onClick={() => setAbierto((v) => !v)}
              aria-expanded={abierto}
            >
              {abierto ? "Ocultar el detalle" : "Cómo es en boca"}
              <Icon name={abierto ? "minus" : "plus"} size={14} />
            </button>
          )}

          {abierto && (
            <>
              {info.body && <p className="wine-about__body">{info.body}</p>}

              <WineStructure structure={info.structure} />

              {!info.structure && info.profile?.length > 0 && (
                <div className="wine-about__profile">
                  {info.profile.map((p) => (
                    <span key={p} className="wine-about__pill">{p}</span>
                  ))}
                </div>
              )}

              {info.aromas?.length > 0 && (
                <div className="wine-about__block">
                  <span className="wine-about__label">Aromas</span>
                  <div className="wine-about__chips">
                    {info.aromas.slice(0, MAX_CHIPS).map((a) => (
                      <span key={a} className="wine-about__chip">{a}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Los chips de maridaje no están más. Desde que dicen platos
                  concretos ("ojo de bife a la parrilla") se pisan con el plato
                  que propone el Plan de la noche, en la misma pantalla y con
                  receta: cuatro sugerencias sin desarrollar al lado de una
                  desarrollada. Para elegir vino desde la comida está el
                  Sommelier.

                  La temperatura tampoco: la dice el Plan, y la dice mejor.
                  "Servila a 16-18 °C" es una instrucción; "16-18 °C servir" era
                  una ficha técnica diciendo lo mismo dos renglones más abajo. */}
              {info.alcohol && (
                <div className="wine-about__facts">
                  <span className="wine-about__fact">
                    <strong>{info.alcohol}%</strong> alcohol
                  </span>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
