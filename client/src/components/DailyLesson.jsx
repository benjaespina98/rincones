import { useState } from "react";
import Icon from "./Icon";
import ConceptSheet from "./ConceptSheet";
import { CONCEPTS, pickLesson } from "../data/wineConcepts";
import { tapHaptic } from "../utils/haptics";
import "../styles/components/DailyLesson.css";

/**
 * "Para aprender hoy": una cosa, elegida según tu bodega.
 *
 * ── QUÉ REEMPLAZA ───────────────────────────────────────────────────────────
 * "Aprendé y explorá" eran seis enlaces externos fijos en tres grupos, todos
 * con el mismo peso visual y siempre los mismos. La sección que tenía que
 * enseñarte algo era la única que te echaba de la aplicación.
 *
 * Esto es contenido PROPIO —los conceptos que ya viven colgados de los rótulos
 * de la ficha—, en castellano, en el tono de la app, y elegido por lo que
 * tenés: "Tenés 4 tintos: esto es lo que les da el esqueleto" sólo aparece si
 * de verdad tenés cuatro tintos (ver `pickLesson`).
 *
 * ── POR QUÉ MUESTRA UN EXTRACTO ─────────────────────────────────────────────
 * La primera versión tenía sólo rótulo, título y gancho: tres renglones cortos
 * dentro de una tarjeta grande, y se veía hueca — mucho marco para muy poco
 * adentro. Las dos líneas de texto real son lo que la convierte en algo que se
 * empieza a leer ahí mismo, en vez de una promesa de que hay algo detrás.
 *
 * ── POR QUÉ NO ENVUELVE UN ConceptTerm ──────────────────────────────────────
 * Lo hacía, para reusar la hoja. Pero `ConceptTerm` es una PALABRA subrayada:
 * la tarjeta heredaba su `text-decoration: underline dotted` y le salían
 * punteados a los tres renglones. Ahora la hoja es `ConceptSheet`, un
 * componente aparte que los dos abren sin compartir estilos.
 */

export default function DailyLesson({ stats, seed = 0 }) {
  const [abierta, setAbierta] = useState(false);

  const leccion = pickLesson({ stats, seed });
  const concepto = CONCEPTS[leccion?.id];

  // Si un id dejara de existir, la sección desaparece en vez de romper la home.
  if (!concepto) return null;

  return (
    <>
      <button
        type="button"
        className="lesson-card"
        onClick={() => { tapHaptic(); setAbierta(true); }}
        aria-label={`Leer sobre ${concepto.title}`}
      >
        <span className="lesson-card__top">
          <span className="lesson-card__icon" aria-hidden="true">
            <Icon name="graduation" size={18} />
          </span>
          <span className="lesson-card__heads">
            {/* "Para aprender hoy" sonaba a tarea escolar. Lo que la tarjeta
                hace de verdad es explicar una palabra que ya viste en la app y
                no sabías bien qué era. */}
            <span className="lesson-card__eyebrow">Para entender mejor</span>
            <span className="lesson-card__title">{concepto.title}</span>
          </span>
        </span>

        {/* Las dos primeras líneas del concepto, recortadas por CSS. El texto
            completo está en la hoja; esto es para que se vea que hay algo. */}
        <span className="lesson-card__excerpt">{concepto.body}</span>

        <span className="lesson-card__foot">
          {/* El gancho dice POR QUÉ te toca esta lección, igual que el motivo
              del vino del día. Es la diferencia entre una tarjeta de contenido
              y una tarjeta que te habla a vos. */}
          <span className="lesson-card__hook">{leccion.hook}</span>
          <Icon name="arrow-right" size={15} />
        </span>
      </button>

      {/* Sin `ctx`: acá no hay una botella adelante, así que la hoja se lee en
          general y sin el renglón "en tu bodega" —que es exactamente lo que
          hace `conceptAnchor` cuando no tiene datos, sin que haya que
          pedírselo—. */}
      {abierta && <ConceptSheet id={leccion.id} onClose={() => setAbierta(false)} />}
    </>
  );
}
