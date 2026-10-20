import BottomSheet from "./BottomSheet";
import Button from "./Button";
import Chip from "./Chip";
import Dropdown from "./Dropdown";
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
 * ── DE HOJA PROPIA A LA HOJA DE TODOS ───────────────────────────────────────
 * Esto armaba su Portal, su velo y su cabecera a mano sobre `SettingsSheet.css`.
 * Andaba, pero era la quinta copia del mismo marcado, y ninguna de las cinco
 * tenía las dos cosas que la gente prueba primero en un teléfono: bajarla con
 * el pulgar y que el Tab no se escape al fondo de la página. Ahora las pone
 * `BottomSheet`, y acá queda sólo lo que es de los filtros.
 *
 * Los chips también salieron: eran `bfilters__chip`, un botón con estilo propio
 * que hacía exactamente lo que hace `Chip`. Trece controles menos que mantener.
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
  { value: "price", label: "Precio" },
];

const NOMBRE_FACETA = { uva: "Uva", region: "región", cosecha: "cosecha", bodega: "bodega", puntaje: "puntaje" };

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
  wineryFilter = "all",
  setWineryFilter,
  wineryOptions = [],
  puntajeMin = "all",
  setPuntajeMin,
  hayFiltros,
  onLimpiar,
}) {
  // Qué facetas tienen algo para elegir en ESTA bodega.
  const facetas = [
    varietalOptions.length > 1 && "uva",
    regionOptions.length > 1 && "region",
    vintageOptions.length > 1 && "cosecha",
    wineryOptions.length > 1 && "bodega",
    "puntaje",
  ].filter(Boolean);

  return (
    <BottomSheet
      isOpen={abierto}
      onClose={onClose}
      title="Filtros y orden"
      className="bfilters"
      footer={
        <>
          <Button variant="ghost" onClick={onLimpiar} disabled={!hayFiltros}>
            Limpiar
          </Button>
          {/* El número contesta "¿me va a quedar algo?" antes de cerrar. */}
          <Button variant="primary" onClick={onClose}>
            Ver {resultados} {resultados === 1 ? "vino" : "vinos"}
          </Button>
        </>
      }
    >
      <section className="bfilters__group">
        <span className="bfilters__label">Ordenar por</span>
        <div className="bfilters__chips">
          {ORDENES.map((o) => (
            <Chip key={o.value} active={sortBy === o.value} onClick={() => setSortBy(o.value)}>
              {o.label}
            </Chip>
          ))}
        </div>
      </section>

      <section className="bfilters__group">
        <span className="bfilters__label">Mostrar sólo</span>
        <div className="bfilters__chips">
          {/* Ni "Favoritos" ni "Probados" están acá, y es la misma razón
              para las dos: cada una ya es su propia vista arriba, en el
              segmentado. Repetirla como filtro sería la misma pregunta
              dos veces con dos nombres — que es justo lo que se vino a
              sacar (ver el comentario grande sobre VISTA_DESEOS en
              cellarViews.js). Sólo "sin probar" queda: no tiene vista
              propia, y por eso tampoco aparece adentro de "Probados" —
              "los probados sin probar" no es una consulta, es una
              contradicción que devuelve cero. */}
          {vista !== "probados" && (
            <Chip
              active={probado === false}
              onClick={() => setProbado(probado === false ? null : false)}
            >
              Sin tomar
            </Chip>
          )}
          <Chip active={soloListos} onClick={() => setSoloListos((v) => !v)}>
            Listos para abrir
          </Chip>
        </div>
      </section>

      <section className="bfilters__group">
        <span className="bfilters__label">Tipo</span>
        <div className="bfilters__chips">
          {TIPOS.map((t) => (
            <Chip
              key={t.value}
              /* El chip del tipo toma el color del tipo cuando está elegido: en
                 una fila de filtros por tipo, el color ES la información. */
              type={t.value === "all" ? undefined : t.value}
              active={tipoFilter === t.value}
              onClick={() => setTipoFilter(t.value)}
            >
              {t.label}
            </Chip>
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
            {facetas.includes("bodega") && (
              <Dropdown
                ariaLabel="Filtrar por bodega"
                value={wineryFilter}
                onChange={setWineryFilter}
                options={[
                  { value: "all", label: "Todas las bodegas" },
                  ...wineryOptions.map((b) => ({ value: b, label: b })),
                ]}
              />
            )}
            {facetas.includes("puntaje") && (
              <Dropdown
                ariaLabel="Filtrar por puntaje mínimo"
                value={puntajeMin}
                onChange={setPuntajeMin}
                options={[
                  { value: "all", label: "Cualquier puntaje" },
                  { value: "5", label: "5 estrellas" },
                  { value: "4", label: "4 o más" },
                  { value: "3", label: "3 o más" },
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
    </BottomSheet>
  );
}
