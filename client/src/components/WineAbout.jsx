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
  if (!loading && !failed && !info) return null;

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
        <ErrorState title="No pudimos generar la descripción" onRetry={onRetry} compact />
      )}

      {info && !loading && (
        <>
          {info.summary && <p className="wine-about__summary">{info.summary}</p>}
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

          {/* Sin ícono por chip: el rótulo ya dijo que se come. Cuatro cubiertos
              repetidos son cuatro manchas de color. */}
          {info.foodPairing?.length > 0 && (
            <div className="wine-about__block">
              <span className="wine-about__label">Marida con</span>
              <div className="wine-about__chips">
                {info.foodPairing.slice(0, MAX_CHIPS).map((f) => (
                  <span key={f} className="wine-about__chip">{f}</span>
                ))}
              </div>
            </div>
          )}

          {(info.alcohol || info.serve) && (
            <div className="wine-about__facts">
              {info.alcohol && (
                <span className="wine-about__fact">
                  <strong>{info.alcohol}%</strong> alcohol
                </span>
              )}
              {info.serve && (
                <span className="wine-about__fact">
                  <strong>{info.serve}</strong> servir
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
