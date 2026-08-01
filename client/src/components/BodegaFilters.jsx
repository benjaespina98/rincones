import { useEffect } from "react";
import Icon from "./Icon";
import Portal from "./Portal";
import Dropdown from "./Dropdown";
import "../styles/components/SettingsSheet.css";
import "./BodegaFilters.css";

/**
 * Filtros y orden de Mi Bodega, en una hoja que se abre encima.
 *
 * ── POR QUÉ UNA HOJA Y NO UN PANEL ABIERTO EN LA PANTALLA ───────────────────
 * El panel desplegable empujaba la lista media pantalla hacia abajo cada vez que
 * se abría: para elegir un filtro había que dejar de ver los vinos, que son lo
 * que uno vino a mirar. Es el patrón que usan Vivino, Airbnb o Mercado Libre para
 * lo mismo, y por la misma razón: filtrar es un momento aparte, no algo que
 * convive con el resultado.
 *
 * Reusa la hoja que ya existía para preferencias y contraseña (SettingsSheet):
 * misma forma, mismo cierre, mismo lugar del botón de guardar. Una app con dos
 * clases de modal se siente hecha por dos personas distintas.
 *
 * ── POR QUÉ EL BOTÓN DICE CUÁNTOS VINOS ─────────────────────────────────────
 * "Ver 12 vinos" contesta antes de cerrar la pregunta que uno se hace al filtrar
 * —¿me va a quedar algo?— y evita el viaje de cerrar, mirar y volver a abrir. Es
 * lo que hace Airbnb con su "Mostrar 234 alojamientos", y es de las cosas más
 * baratas que más cambian la sensación de control.
 */

const ORDENES = [
  { value: "recent", label: "Recientes" },
  { value: "name", label: "A → Z" },
  { value: "rating", label: "Mejor puntuados" },
  { value: "year", label: "Cosecha nueva" },
];

const TIPOS = [
  { value: "all", label: "Todos" },
  { value: "red", label: "Tintos" },
  { value: "white", label: "Blancos" },
  { value: "rosé", label: "Rosados" },
  { value: "sparkling", label: "Espumantes" },
  { value: "fortified", label: "Fortificados" },
];

export default function BodegaFilters({
  abierto,
  onClose,
  resultados,
  sortBy,
  setSortBy,
  soloFavoritos,
  setSoloFavoritos,
  probado,
  setProbado,
  soloListos,
  setSoloListos,
  tipoFilter,
  setTipoFilter,
  varietalFilter,
  setVarietalFilter,
  varietalOptions,
  regionFilter,
  setRegionFilter,
  regionOptions,
  viewMode,
  setViewMode,
  hayFiltros,
  onLimpiar,
}) {
  // Escape cierra, como cualquier diálogo del sistema. Sin esto, en un teclado la
  // única salida es encontrar la X con el mouse.
  useEffect(() => {
    if (!abierto) return undefined;
    const alTeclear = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [abierto, onClose]);

  if (!abierto) return null;

  return (
    <Portal>
      {/* Tocar afuera cierra: es lo que espera cualquiera que abrió una hoja. */}
      <div className="settings-sheet" onClick={onClose} role="presentation">
        <div
          className="settings-sheet__panel bfilters"
          role="dialog"
          aria-modal="true"
          aria-label="Filtros y orden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="settings-sheet__head">
            <h2>Filtros y orden</h2>
            <button type="button" className="settings-sheet__close" onClick={onClose} aria-label="Cerrar">
              <Icon name="x" size={16} />
            </button>
          </div>

          <div className="settings-sheet__body bfilters__body">
            <section className="bfilters__group">
              <span className="bfilters__label">Ordenar por</span>
              <div className="bfilters__chips">
                {ORDENES.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className={`bfilters__chip ${sortBy === o.value ? "is-active" : ""}`}
                    aria-pressed={sortBy === o.value}
                    onClick={() => setSortBy(o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="bfilters__group">
              <span className="bfilters__label">Mostrar sólo</span>
              <div className="bfilters__chips">
                <button
                  type="button"
                  className={`bfilters__chip ${soloFavoritos ? "is-active" : ""}`}
                  aria-pressed={soloFavoritos}
                  onClick={() => setSoloFavoritos((v) => !v)}
                >
                  <Icon name="heart" filled={soloFavoritos} size={13} /> Favoritos
                </button>
                {/* Sólo "sin probar", y no también "probados": la pregunta que se
                    hace con la bodega en la mano es cuál falta abrir. El estado de
                    cada vino ya se ve —y se cambia— en su propia fila. */}
                <button
                  type="button"
                  className={`bfilters__chip ${probado === false ? "is-active" : ""}`}
                  aria-pressed={probado === false}
                  onClick={() => setProbado(probado === false ? null : false)}
                >
                  Sin probar
                </button>
                <button
                  type="button"
                  className={`bfilters__chip ${soloListos ? "is-active" : ""}`}
                  aria-pressed={soloListos}
                  onClick={() => setSoloListos((v) => !v)}
                >
                  Listos para abrir
                </button>
              </div>
            </section>

            <section className="bfilters__group">
              <span className="bfilters__label">Tipo</span>
              <div className="bfilters__chips">
                {TIPOS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    className={`bfilters__chip ${tipoFilter === t.value ? "is-active" : ""}`}
                    aria-pressed={tipoFilter === t.value}
                    onClick={() => setTipoFilter(t.value)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </section>

            {/* Uva y región aparecen sólo si tu bodega tiene más de una: con tres
                vinos, un combo de "todas las regiones" es un control que no filtra
                nada y hay que leer igual. */}
            {(varietalOptions.length > 1 || regionOptions.length > 1) && (
              <section className="bfilters__group">
                <span className="bfilters__label">Uva y región</span>
                <div className="bfilters__combos">
                  {varietalOptions.length > 1 && (
                    <Dropdown
                      ariaLabel="Filtrar por uva"
                      value={varietalFilter}
                      onChange={setVarietalFilter}
                      options={[
                        { value: "all", label: "Todas las uvas" },
                        ...varietalOptions.map((v) => ({ value: v, label: v })),
                      ]}
                    />
                  )}
                  {regionOptions.length > 1 && (
                    <Dropdown
                      ariaLabel="Filtrar por región"
                      value={regionFilter}
                      onChange={setRegionFilter}
                      options={[
                        { value: "all", label: "Todas las regiones" },
                        ...regionOptions.map((r) => ({ value: r, label: r })),
                      ]}
                    />
                  )}
                </div>
              </section>
            )}

            <section className="bfilters__group">
              <span className="bfilters__label">Ver como</span>
              <div className="bfilters__chips">
                <button
                  type="button"
                  className={`bfilters__chip ${viewMode === "list" ? "is-active" : ""}`}
                  aria-pressed={viewMode === "list"}
                  onClick={() => setViewMode("list")}
                >
                  <Icon name="list" size={14} /> Lista
                </button>
                <button
                  type="button"
                  className={`bfilters__chip ${viewMode === "grid" ? "is-active" : ""}`}
                  aria-pressed={viewMode === "grid"}
                  onClick={() => setViewMode("grid")}
                >
                  <Icon name="grid" size={14} /> Grilla
                </button>
              </div>
            </section>
          </div>

          <div className="settings-sheet__footer">
            <button
              type="button"
              className="settings-sheet__cancel"
              onClick={onLimpiar}
              disabled={!hayFiltros}
            >
              Limpiar
            </button>
            {/* El número contesta "¿me va a quedar algo?" antes de cerrar. */}
            <button type="button" className="settings-sheet__save" onClick={onClose}>
              Ver {resultados} {resultados === 1 ? "vino" : "vinos"}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
