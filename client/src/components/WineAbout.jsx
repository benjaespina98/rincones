import { useState } from "react";
import Icon from "./Icon";
import ConceptTerm from "./ConceptTerm";
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
 *
 * ── QUÉ SE VE SIN ABRIR NADA ────────────────────────────────────────────────
 * Todo estaba plegado menos el resumen, y eso enterró justo lo que la ficha
 * tiene de mejor: las barras de perfil. Un párrafo de prosa se lee una vez; las
 * barras y los aromas se miran de un vistazo, se comparan entre botellas y son
 * la razón por la que alguien abre la ficha de un vino que ya conoce. Escondido
 * detrás de un botón, ese vistazo no existe.
 *
 * Arriba, siempre visible: el resumen, el perfil en barras, los aromas y la
 * graduación. Detrás del botón: el contexto y el "¿sabías que?" — los dos
 * párrafos, que se leen una vez y después sólo cuestan scroll.
 *
 * ── LO QUE NO SE DICE DOS VECES ─────────────────────────────────────────────
 * La temperatura y el aireado son del Plan, no de acá: ver `sinRepetirElPlan`.
 */

const MAX_CHIPS = 4;

/**
 * Lo que el Plan ya dice, dicho otra vez acá.
 *
 * El modelo escribe `body` como "cómo tomarlo", y ahí adentro entraban la
 * temperatura y el aireado — que son exactamente las dos frases que el Plan
 * pone arriba, en la misma pantalla y como instrucción. El resultado: "abrila
 * media hora antes" a la vista, y cuatro dedos más abajo, detrás de un botón,
 * "conviene decantarlo unos treinta minutos".
 *
 * El prompt ya no las pide (ver `wineAi.service.js`), pero las fichas generadas
 * antes siguen guardadas y se muestran tal cual vinieron: sin este filtro, la
 * repetición se arreglaba sólo para los vinos que se cargaran de acá en
 * adelante. Se corta por oración, así que de un párrafo de tres frases se
 * pierde la que repite y se conservan las otras dos.
 */
const LO_DICE_EL_PLAN =
  /(\d\s*°|grados|temperatura|decant|airea|aire|abrila|abrirla|media hora antes|heladera)/i;

const sinRepetirElPlan = (texto) => {
  const frases = String(texto || "").match(/[^.!?]+[.!?]*/g) || [];
  return frases
    .filter((f) => f.trim() && !LO_DICE_EL_PLAN.test(f))
    .join(" ")
    .trim();
};

export default function WineAbout({ loading, failed, info, onRetry, wine }) {
  // Plegado por defecto, pero ahora esconde bastante menos: sólo lo que se
  // consulta una vez (cómo tomarlo, la graduación, la curiosidad).
  const [abierto, setAbierto] = useState(false);

  if (!loading && !failed && !info) return null;

  // Lo que queda del "cómo tomarlo" una vez sacado lo que el Plan ya dijo.
  const detalle = sinRepetirElPlan(info?.body);

  // Si no hay nada detrás de lo que ya se ve, no se ofrece abrir nada. La
  // graduación salió de esta cuenta al subir a la parte visible: si no, un vino
  // con alcohol y nada más ofrecía un botón que abría en blanco.
  const hayDetalle = Boolean(info && (detalle || info.funFact));

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

          {/* El perfil en barras, sin nada que tocar: es lo que se mira de un
              vistazo y lo único de la ficha que se puede comparar entre dos
              botellas. `wine` sólo viaja para que los conceptos puedan decir
              "el tuyo es un tinto": la estructura se dibuja igual sin él. */}
          <WineStructure structure={info.structure} wine={wine} />

          {/* Sin barras, las pastillas dicen lo mismo en palabras. Nunca las dos
              cosas: son los mismos cuatro ejes y a veces no coinciden. */}
          {!info.structure && info.profile?.length > 0 && (
            <div className="wine-about__profile">
              {info.profile.map((p) => (
                <span key={p} className="wine-about__pill">{p}</span>
              ))}
            </div>
          )}

          {info.aromas?.length > 0 && (
            <div className="wine-about__block">
              {/* Los aromas a vainilla, coco o tostado no vienen de la uva
                  sino de la madera: el rótulo es el lugar exacto donde esa
                  pregunta aparece. */}
              <span className="wine-about__label">
                <ConceptTerm id="crianza" ctx={{ wine, info }}>Aromas</ConceptTerm>
              </span>
              <div className="wine-about__chips">
                {info.aromas.slice(0, MAX_CHIPS).map((a) => (
                  <span key={a} className="wine-about__chip">{a}</span>
                ))}
              </div>
            </div>
          )}

          {/* La graduación, a la vista: es un dato de una línea que mucha gente
              mira antes de decidir si abre la botella un martes, y estaba
              costando un toque. Al lado de los aromas no agrega scroll —
              comparte renglón con ellos— así que esconderlo no ahorraba nada.

              La temperatura NO se suma acá, aunque sea la otra mitad de la
              pregunta: la dice el Plan, más abajo en esta misma pantalla.
              Repetirla sería exactamente la clase de duplicación que se está
              sacando del resto de la app, y allá se dice mejor: "Servila a
              16-18 °C" es una instrucción, y viene con el aireado cuando el
              vino lo pide. */}
          {info.alcohol && (
            <div className="wine-about__facts">
              <span className="wine-about__fact">
                <strong>{info.alcohol}%</strong> alcohol
              </span>
            </div>
          )}

          {hayDetalle && (
            <button
              type="button"
              className="wine-about__toggle"
              onClick={() => setAbierto((v) => !v)}
              aria-expanded={abierto}
            >
              {/* Se llamaba "Cómo tomarlo" y prometía justo lo que el Plan ya
                  había contestado dos bloques más arriba. Lo que queda adentro
                  es contexto: en qué copa, cuánto aguanta abierta, para qué
                  momento va, y la curiosidad. */}
              {abierto ? "Ocultar" : "Más sobre este vino"}
              <Icon name={abierto ? "minus" : "plus"} size={14} />
            </button>
          )}

          {abierto && (
            <>
              {detalle && <p className="wine-about__body">{detalle}</p>}

              {/* Los chips de maridaje no están más. Desde que dicen platos
                  concretos ("ojo de bife a la parrilla") se pisan con el plato
                  que propone el Plan, en la misma pantalla y con receta: cuatro
                  sugerencias sin desarrollar al lado de una desarrollada. Para
                  elegir vino desde la comida está el Sommelier. */}

              {/* El "¿sabías que?", último y dentro de lo plegado: es lo más
                  lindo de leer y lo menos urgente. A quien no le interesa no le
                  cuesta un píxel de scroll, porque esta sección arranca cerrada;
                  quien la abrió es porque vino a leer sobre el vino. */}
              {info.funFact && (
                <p className="wine-about__fact-fun">
                  <Icon name="sparkle" size={14} />
                  <span>{info.funFact}</span>
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
