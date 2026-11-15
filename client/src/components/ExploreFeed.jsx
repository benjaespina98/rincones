import { useState } from "react";
import TrackedCard from "./TrackedCard";
import DailyLesson from "./DailyLesson";
import "../styles/shared/DiscoverSections.css";

/**
 * "Aprendé y explorá": un feed mixto, no una lista de enlaces.
 *
 * ── QUÉ CAMBIÓ ──────────────────────────────────────────────────────────────
 * Eran seis enlaces externos fijos en tres grupos cerrados, cada grupo con su
 * propio tipo de contenido y ninguno hablándose con el resto de la pantalla.
 * Sumar una nota o una bodega significaba inventar un cuarto grupo.
 *
 * Ahora todos los ítems tienen la misma forma (`type` + campos comunes, ver
 * data/contentTypes.js) y los dibuja la misma tarjeta. Las fuentes son dos y el
 * feed no distingue:
 *   · curaduría en código  — videos, cursos, playlists
 *   · el panel admin       — notas, bodegas, y los eventos que no se llevaron
 *                            la tarjeta grande de arriba
 *
 * Agregar un tipo nuevo es agregarlo a CONTENT_TYPES y mandarlo acá. No hay
 * componente nuevo, ni CSS nuevo, ni una cuarta forma de dibujar una fila.
 *
 * ── POR QUÉ SIGUE AGRUPADO Y NO ES UNA LISTA CORRIDA ────────────────────────
 * Porque los rótulos por color y sección son lo que deja escanear el bloque sin
 * leerlo. Una lista corrida de doce filas heterogéneas —un video, una playlist,
 * una bodega, un curso— obliga a leer cada una para saber qué es. El grupo lo
 * dice antes.
 */
export default function ExploreFeed({ groups = [], stats, seed = 0 }) {
  // Los grupos vacíos no se renderizan, así que la sección puede quedarse sólo
  // con la lección y sigue teniendo sentido.
  const conContenido = groups.filter((g) => g.items.length > 0);
  // Qué grupo se ve. Si el elegido desaparece (cambió el contenido), cae al primero.
  const [activoId, setActivoId] = useState(null);
  const grupo = conContenido.find((g) => g.id === activoId) || conContenido[0];
  // Si todo el grupo es del mismo tipo, el rótulo por fila sobra: el chip ya lo dijo. En un grupo
  // mixto ("Para ir", con bodegas y eventos) sí hace falta.
  const mixto = grupo ? new Set(grupo.items.map((i) => i.type)).size > 1 : false;

  return (
    <section className="explore">
      {/* "Aprendé y explorá" son dos imperativos pegados: la fórmula con la que
          cualquier app titula su cajón de contenido. Además prometía sólo
          aprender, y acá abajo también hay música y lugares para ir. */}
      <header className="explore__head">
        <h2 className="explore__title">Aprender</h2>
      </header>

      {/* Lo propio primero: es lo único de esta sección que no te saca de la
          app y lo único elegido por lo que tenés en la bodega. */}
      <DailyLesson stats={stats} seed={seed} />

      {/* Un grupo a la vez: cinco listas apiladas eran una pared de enlaces, una lista de compras.
          Una fila de chips elige qué ver y debajo hay UNA lista corta. */}
      {grupo && (
        <div className="explore__group">
          {conContenido.length > 1 && (
            <div className="explore__tabs" role="group" aria-label="Qué explorar">
              {conContenido.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={g.id === grupo.id}
                  className={`explore__tab ${g.id === grupo.id ? "is-active" : ""}`}
                  onClick={() => setActivoId(g.id)}
                >
                  {g.label}
                </button>
              ))}
            </div>
          )}

          <div className="explore__items">
            {grupo.hint && <p className="explore__group-hint">{grupo.hint}</p>}
            {grupo.items.map((item) => (
              <TrackedCard key={item.id} item={item} variant="row" showType={mixto} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/* `mergeIntoGroups` vive en data/discoverContent.js, con DISCOVER_GROUPS: es una
   función pura sobre datos y este archivo sólo puede exportar componentes (regla
   de Fast Refresh, y además es donde alguien la va a buscar). */
