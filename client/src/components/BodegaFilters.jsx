import Icon from "./Icon";
import Portal from "./Portal";
import Dropdown from "./Dropdown";
import { useSheet } from "../hooks/useSheet";
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

const NOMBRE_FACETA = { uva: "Uva", region: "región", cosecha: "cosecha" };

/**
 * El rótulo de la sección, armado con las facetas que se están mostrando:
 * "Uva", "Uva y cosecha", "Uva, región y cosecha". Prometer un filtro que no
 * está abajo es peor que no tener la sección.
 */
const rotuloFacetas = (facetas) => {
  const nombres = facetas.map((f) => NOMBRE_FACETA[f]);
  if (nombres.length === 1) return nombres[0];
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
};

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
  vista,
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
  vintageFilter,
  setVintageFilter,
  vintageOptions,
  hayFiltros,
  onLimpiar,
}) {
  // Escape, bloqueo del scroll de atrás y foco: ver hooks/useSheet. Acá vivía
  // sólo el Escape, escrito a mano — igual que en las otras cuatro hojas.
  const panelRef = useSheet(onClose, { enabled: abierto });

  if (!abierto) return null;

  // Qué facetas tienen algo para elegir en ESTA bodega.
  const facetas = [
    varietalOptions.length > 1 && "uva",
    regionOptions.length > 1 && "region",
    vintageOptions.length > 1 && "cosecha",
  ].filter(Boolean);

  return (
    <Portal>
      {/* Tocar afuera cierra: es lo que espera cualquiera que abrió una hoja. */}
      <div className="settings-sheet" onClick={onClose} role="presentation">
        <div
          ref={panelRef}
          tabIndex={-1}
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
                    hace con la bodega en la mano es cuál falta abrir, y "probados"
                    ya es una de las tres vistas de arriba. Justamente por eso, en
                    esa vista este chip no aparece: "los probados sin probar" no es
                    una consulta, es una contradicción que devuelve cero. */}
                {vista !== "probados" && (
                  <button
                    type="button"
                    className={`bfilters__chip ${probado === false ? "is-active" : ""}`}
                    aria-pressed={probado === false}
                    onClick={() => setProbado(probado === false ? null : false)}
                  >
                    Sin probar
                  </button>
                )}
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

            {/* Uva, región y cosecha aparecen sólo si tenés más de una: con tres
                vinos, un combo de "todas las regiones" es un control que no filtra
                nada y hay que leer igual.

                El rótulo se arma con lo que de verdad se está mostrando. Decía
                siempre "Uva y región" y, si todos tus vinos eran Malbec, quedaba
                anunciando un filtro por uva que no estaba abajo: el usuario lo
                buscaba y no existía. */}
            {facetas.length > 0 && (
              <section className="bfilters__group">
                <span className="bfilters__label">{rotuloFacetas(facetas)}</span>
                <div className="bfilters__combos">
                  {facetas.includes("uva") && (
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
                  {facetas.includes("region") && (
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
                  {facetas.includes("cosecha") && (
                    <Dropdown
                      ariaLabel="Filtrar por cosecha"
                      value={vintageFilter}
                      onChange={setVintageFilter}
                      options={[
                        { value: "all", label: "Todas las cosechas" },
                        ...vintageOptions.map((v) => ({ value: v, label: v })),
                      ]}
                    />
                  )}
                </div>
              </section>
            )}

            {/* ── LISTA / GRILLA SE FUE DE ACÁ ───────────────────────────────
                Estaba al fondo de este panel, después de siete filtros. Pero no
                es un filtro: no recorta nada, no cambia qué vinos ves, y se toca
                mucho más seguido que cualquier faceta —es "quiero ver las
                etiquetas" contra "quiero leer los nombres"—. Enterrado acá
                costaba tres toques (abrir, bajar, elegir) y otro para cerrar.

                Ahora vive en la barra de arriba, al lado del buscador, donde se
                ve el estado actual sin abrir nada. Ver `.bodega-modo` en
                BodyPage.jsx. */}
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
