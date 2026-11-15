import { memo } from "react";
import Icon from "./Icon";
import WinePhoto from "./WinePhoto";
import StarRating from "./StarRating";
import WineRowPanel from "./WineRowPanel";
import { useLongPress } from "../hooks/useLongPress";
import { WINE_TYPE_LABELS } from "../data/wineReference";
import { getCellarStatus } from "../utils/cellarStatus";
import { normalizeSearchText } from "../utils/text";
import { tiempoEnCava, enCavaDesde, stockLabel, nuncaEstuvoEnTuCava } from "../utils/cellarTime";
import { wineDisplayName } from "../utils/wineIdentity";
import { nombreDeFila } from "../utils/viewTransition";
import { useSwipeAcciones } from "../hooks/useSwipeAcciones";
import { resumenTomado, pistaDeStock } from "../utils/tomados";

/**
 * Una fila de Mi Bodega.
 *
 * ── POR QUÉ SALIÓ DE BodyPage ───────────────────────────────────────────────
 * Vivía adentro del `.map()` de una página de 1910 líneas, así que cada vez que
 * cambiaba cualquier cosa de la pantalla —una letra del buscador, abrir el sheet
 * de filtros, marcar UN vino como probado— React volvía a construir el JSX de
 * las treinta filas visibles. Con la fila afuera y memoizada, escribir en el
 * buscador re-renderiza las filas que cambian y nada más.
 *
 * Eso obliga a una regla en quien la usa: **los handlers tienen que ser
 * estables**. Un `onClick={() => hacer(wine)}` armado en el render del padre es
 * una prop nueva en cada vuelta y `memo` deja de servir. Por eso las acciones
 * llegan como funciones que reciben el vino (`onToggleTasted(wine)`), envueltas
 * en `useCallback` allá arriba.
 *
 * ── DÓNDE ESTÁ SU CSS ───────────────────────────────────────────────────────
 * En `pages/BodyPage.css`, y no al lado de este archivo como manda la
 * convención. La razón es que la mitad de las reglas de la fila están escritas
 * desde el contenedor —`.wines-list--grid .wine-row__thumb`,
 * `.wines-list--protagonista .wine-row`, `.wines-list.is-selecting
 * .wine-row__go`—: la lista no decora a la fila, la reconfigura. Separarlas
 * dejaría dos hojas que sólo se entienden juntas y un cascarón que se rompe al
 * editar cualquiera de las dos. Se revisa en la fase 7.
 */
function WineRow({
  wine,
  /** La pestaña abierta. Cambia qué datos muestra la fila y qué puede hacer. */
  vista,
  esGrilla,
  enFavoritos,
  modoSeleccion,
  elegido,
  expanded,
  /** Hay una acción en vuelo sobre ESTE vino: los controles se apagan. */
  isPending,
  onAbrirFicha,
  onSeleccionar,
  onToggleTasted,
  onToggleFavorite,
  onExpandir,
  onSumarStock,
  onSumarUna,
  onAbrirUna,
  onMantener,
  onEliminar,
}) {
  // La vitrina muestra más de cada vino porque son pocos y son los que
  // podés abrir hoy: el tipo, la uva, el puntaje y una foto que se ve.
  //
  // Se agrega `quantity > 0` y no sólo la pestaña: cuando la búsqueda
  // se amplía a toda la bodega (ver `resultados.ampliada` más arriba),
  // la lista que se dibuja bajo "En stock" puede traer vinos SIN
  // stock —es justo lo que la ampliación existe para mostrar—, y sin
  // este chequeo esas filas se dibujaban en modo vitrina: foto grande
  // y una cantidad "×0" que no tiene sentido ahí. En la pestaña
  // "En stock" normal esto no cambia nada, porque ahí todo lo que
  // llega ya tiene stock por construcción (`pasaVista`).
  const esVitrina = vista === "instock" && Number(wine.quantity) > 0;
  // El stepper (− ×1 +) junto a la cantidad: sumar o abrir una botella sin desplegar la fila. No en
  // grilla (no hay lugar) ni mientras se elige. Un vino que tomaste afuera SÍ lo muestra, sólo con el "+":
  // sumarle una botella es exactamente lo que pasa cuando después lo comprás.
  // En todas las vistas de lista: es el único lugar donde se toca el stock de la fila.
  const conStepper = Boolean(onSumarUna) && !esGrilla && !modoSeleccion;
  // El chip "Ya lo probé" sólo va en la vitrina (En stock). En las filas de una línea (Ya tomados, Favoritos)
  // compartiría el lugar con el stepper, y marcar/desmarcar probado se hace desde el panel.
  const chipEnFila = vista !== "probados" && (esVitrina || esGrilla || !conStepper);
  // Mantener apretado: entra en el modo selección con este vino elegido (igual que "Seleccionar").
  const mantener = useLongPress(() => onMantener?.(wine._id), { habilitado: Boolean(onMantener) && !modoSeleccion });
  /**
   * ¿Esta fila se puede desplegar? La vitrina siempre puede (es su
   * modo natural). El archivo de "Probados" y "Favoritos" también,
   * aunque sea compacto — es la única forma de llegar al favorito,
   * al tacho o a la ficha técnica sin salir a la ficha completa, y
   * en las dos vistas puede haber un vino que no aparece en
   * ninguna otra: un probado sin stock y sin favorito, o un
   * favorito sin stock, no tienen otra puerta. "Todos" tenía el
   * mismo argumento y por eso también se plegaba — se sacó de la
   * pantalla entera (ver cellarViews.js), no de esta regla.
   */
  const puedeExpandir = esVitrina || vista === "probados" || vista === "sin-stock" || enFavoritos;
  // Uva y año en una línea, bodega en otra.
  //
  // Las tres cosas en un solo renglón daban textos de 45 caracteres que
  // no entran en el ancho de un teléfono ni en dos líneas —"Cabernet
  // Sauvignon · 2017 · Bodegas Sale…"— y volvía el corte que había que
  // sacar. Partido así, cada línea entra sola y no depende del largo de
  // la otra: son dos datos distintos y se leen mejor separados.
  //
  // Y no se repite lo que el nombre ya dice. Mucha gente carga el vino
  // como "Trapiche Chardonnay 2018", y la fila terminaba mostrando
  // "Trapiche Chardonnay 2018 / Chardonnay · 2018 / Trapiche": tres
  // renglones para dos datos. Cada uno se muestra sólo si agrega algo.
  const nombre = normalizeSearchText(wineDisplayName(wine));
  const yaLoDice = (valor) =>
    Boolean(valor) && nombre.includes(normalizeSearchText(String(valor)));
  const uvaYAño = [
    yaLoDice(wine.varietal) ? "" : wine.varietal,
    /* La cosecha se va del subtítulo SÓLO en la vitrina, porque ahí
       abajo está la grilla de datos y la dice con su rótulo. En el
       archivo se queda: esa fila no se despliega, así que si la
       sacáramos el año no estaría en ninguna parte.

       Es la mitad de "unificar la información": el encabezado se
       queda con lo que sirve para RECONOCER la botella de un vistazo
       (tipo y uva) y la ficha técnica completa vive en un solo lugar,
       en vez de repartida entre un subtítulo y unos bloques sueltos. */
    yaLoDice(wine.vintage) ? "" : wine.vintage,
  ]
    .filter(Boolean)
    .join(" · ");
  const bodega = yaLoDice(wine.winery) ? "" : wine.winery;
  // Un vino que tomaste afuera nunca estuvo en tu cava: el "hace X"
  // saldría de la fecha en que lo anotaste y hablaría de una botella
  // que no existió. Ver `nuncaEstuvoEnTuCava`.
  const nuncaFueTuyo = nuncaEstuvoEnTuCava(wine);
  const enCava = nuncaFueTuyo ? "" : tiempoEnCava(enCavaDesde(wine), { corto: true });
  /**
   * ¿Este está en su punto?
   *
   * El dato ya se calculaba en esta pantalla —lo usa el filtro "Listos
   * para abrir"— pero no se veía en ninguna fila: había que activar el
   * filtro para enterarte de cuáles eran, o sea preguntar antes de
   * saber que había algo para preguntar. En la vitrina es la respuesta
   * a "¿cuál abro hoy?", que es para lo que uno mira esa vista.
   *
   * Sólo en "En stock" y sólo cuando es que sí: un "todavía no" en cada
   * fila sería una columna de advertencias sobre botellas que están
   * perfectamente bien guardadas.
   */
  const guarda = esVitrina ? getCellarStatus(wine) : null;
  const enSuPunto = guarda?.status === "peak";

  /**
   * Deslizar para llegar al corazón y al tacho sin desplegar la fila.
   *
   * Sólo en lista: en grilla la celda mide media pantalla de ancho y correrla
   * descoloca a las vecinas. Y no durante la selección múltiple, donde el gesto
   * horizontal ya significa otra cosa.
   */
  const swipe = useSwipeAcciones({ habilitado: !esGrilla && !modoSeleccion && !isPending });

  return (
    <article
      /* `wine-row--vitrina` marca la fila que SE DESPLIEGA: lista (no
         grilla) y con botellas. Es la única que tiene chevron, panel
         y por lo tanto la única que reacomoda su cabecera en dos
         renglones. Sin esta clase, el layout nuevo caería también
         sobre las filas del archivo, que son una sola línea de 38px y
         costaron dos tandas de trabajo dejar así. */
      className={`wine-row ${esVitrina && !esGrilla ? "wine-row--vitrina" : ""} ${
        expanded ? "is-expanded" : ""
      } ${isPending ? "is-pending" : ""} ${
        Number(wine.quantity) <= 0 ? "is-history" : ""
      } ${elegido ? "is-selected" : ""}`}
      /* El nombre que hace que pasar de lista a grilla sea un movimiento y no
         un parpadeo: el navegador reconoce la misma fila en las dos formas y la
         lleva de una a la otra. Ver utils/viewTransition.js.

         Va inline y no en la hoja porque el valor es distinto en cada fila: un
         `view-transition-name` repetido hace que el navegador descarte la
         transición entera, sin decir nada. */
      style={{ viewTransitionName: nombreDeFila(wine._id) }}
    >
      {/* La cabecera tiene DOS controles hermanos: el cuerpo, que
          expande, y el chip de probado, que cambia el dato ahí mismo.
          Antes era un solo botón que envolvía todo, así que la marca de
          "probado" sólo se podía MIRAR: para cambiarla había que
          expandir la fila o entrar a la ficha, tres toques para un dato
          que es de una palabra. Un botón adentro de otro botón no es
          HTML válido, y por eso son hermanos y no anidados. */}
      {/* ── LO QUE APARECE DETRÁS AL DESLIZAR ──────────────────────────────
          Va debajo de la cabecera en el marcado y detrás en pantalla: la
          cabecera se corre y esto queda a la vista. `inert` cuando está
          cerrada — no alcanza con que no se vea: sin eso, el Tab del teclado
          y el lector de pantalla siguen encontrando dos botones escondidos
          abajo de cada fila de la lista.

          Son los mismos dos del panel desplegable, a propósito: el gesto es un
          atajo para quien lo conoce, no la única puerta. Quien no lo descubra
          llega igual por el chevron. */}
      {!esGrilla && (
        <div
          className="wine-row__swipe"
          /* Se descubre exactamente lo que el dedo corrió: la capa está
             recortada y sólo se ve la franja que la cabecera dejó libre. Así
             no hace falta pintar la cabecera de un color opaco para tapar los
             botones —las superficies de la app son translúcidas a propósito, y
             taparla habría sido romper eso para esconder un problema de capas. */
          style={{ "--revelado": `${-swipe.desplazamiento}px` }}
          inert={!swipe.abierta}
        >
          <button
            type="button"
            className={`wine-row__swipe-btn ${wine.favorite ? "is-fav" : ""}`}
            onClick={() => {
              onToggleFavorite(wine);
              swipe.cerrar();
            }}
            aria-label={
              wine.favorite
                ? `Quitar ${wineDisplayName(wine)} de favoritos`
                : `Marcar ${wineDisplayName(wine)} como favorito`
            }
          >
            <Icon name="heart" filled={wine.favorite} size={19} />
          </button>
          <button
            type="button"
            className="wine-row__swipe-btn wine-row__swipe-btn--danger"
            onClick={() => {
              onEliminar(wine._id);
              swipe.cerrar();
            }}
            aria-label={`Eliminar ${wineDisplayName(wine)}`}
          >
            <Icon name="trash" size={19} />
          </button>
        </div>
      )}

      <div
        className="wine-row__head"
        style={swipe.desplazamiento ? { transform: `translateX(${swipe.desplazamiento}px)` } : undefined}
        data-arrastrando={swipe.arrastrando ? "" : undefined}
        {...swipe.manejadores}
      >
        {/* Tocar la fila SIEMPRE abre la ficha, en lista y en grilla
            por igual — es lo que espera cualquiera que use una app
            hoy, y obligar a un segundo toque en "Ver ficha
            completa" (adentro del desplegable) no lo era. Las
            acciones rápidas de la lista (abrir botella, favorito,
            eliminar, los datos que no entran en la cabecera) siguen
            ahí, pero detrás de su propio control — el chevron de
            abajo — y no escondidas atrás del gesto más obvio de
            todos. */}
        <button
          type="button"
          className="wine-row__main"
          {...mantener.handlers}
          onClick={() => {
            // Mantener apretado entra en la selección: el toque que viene al soltar no abre la ficha.
            if (mantener.fueLarga()) return;
            // Con las acciones a la vista, el primer toque las guarda. Si no,
            // el gesto para asomarlas te deja a un toque de irte de la
            // pantalla sin querer, que es el error más caro de esta lista.
            if (swipe.abierta) return swipe.cerrar();
            if (modoSeleccion) return onSeleccionar(wine._id);
            // El vino viaja con la navegación: la ficha lo tiene
            // entero en memoria y puede pintar en el primer frame en
            // vez de tapar la pantalla con un esqueleto para volver a
            // pedir lo que esta lista ya bajó (ver WineDetailPage).
            return onAbrirFicha(wine);
          }}
          aria-pressed={modoSeleccion ? elegido : undefined}
        >
          {/* La tilde ocupa el lugar de la foto en vez de sumar una
              columna: la fila no se reacomoda al entrar y salir del
              modo, y el vino elegido se distingue del que no sin tener
              que comparar dos casillas chiquitas. */}
          <span className={`wine-row__thumb ${modoSeleccion ? "is-picking" : ""}`}>
            {modoSeleccion ? (
              <span className={`wine-row__tick ${elegido ? "is-on" : ""}`} aria-hidden="true">
                {elegido && <Icon name="check" size={17} />}
              </span>
            ) : (
              <WinePhoto
                src={wine.image}
                type={wine.type}
                alt=""
                marca={wine.winery || wine.name}
                /* El dibujo de respaldo (WineArtwork) se pide en un
                   alto FIJO en píxeles, y el marco que lo contiene
                   mide distinto según el modo: 130px en grilla,
                   90px en la vitrina de lista, 38px en el archivo.
                   Antes era un solo valor (104) para los tres, así
                   que en dos de ellos no coincidía con su marco: en
                   lista sobraba de más (el marco es más chico que el
                   dibujo) y la botella se recortaba contra el borde
                   — el mismo recorte, más grave, en grilla antes de
                   que el fix de arriba le devolviera sus 130px de
                   alto real. Ahora cada modo pide el tamaño que su
                   propio marco puede mostrar entero, con aire. */
                artSize={esGrilla ? 112 : esVitrina ? 76 : 30}
                /* La vitrina y la grilla presentan la botella entera
                   (contain); el archivo en lista es una miniatura de
                   38px, donde lo que importa es el color y la
                   textura de la etiqueta, no la forma completa. */
                fit={esVitrina || esGrilla ? "auto" : "cover"}
              />
            )}
          </span>

          <span className="wine-row__info">
            <span className="wine-row__title">
              {/* Sin la uva: ya la dice el chip de abajo. Se limpia al
                  dibujar para que los vinos cargados antes del cambio se
                  vean bien sin esperar la migración. */}
              <span className="wine-row__name">{wineDisplayName(wine)}</span>
              {wine.favorite && (
                <Icon name="heart" filled size={13} className="wine-row__fav" aria-label="Favorito" />
              )}
            </span>
            {/* Uva, cosecha y bodega como TEXTO y no como pastillas.
                Eran tres chips con borde y padding cada uno, y en un
                teléfono se comían el ancho que necesita el nombre: con
                64 vinos, media lista mostraba títulos cortados como
                "Rutini Single Vin…". Dicen lo mismo y ocupan un tercio.
                El tipo de vino lo dice el dibujo de la botella —y el
                encabezado del grupo cuando se agrupa por tipo—, así que
                no se repite acá. */}
            {/* En la vitrina, el tipo se dice con todas las letras: el
                dibujo de la botella lo insinúa por el color, pero un
                rosado y un tinto claro se parecen demasiado como para
                dejarlo en manos de un ícono de 40px. */}
            {(esVitrina || uvaYAño) && (
              <span className="wine-row__sub">
                {esVitrina && (
                  <span
                    className={`wine-row__type wine-row__type--${wine.type || "unknown"}`}
                    data-wine-type={wine.type || "unknown"}
                  >
                    {WINE_TYPE_LABELS[wine.type] || WINE_TYPE_LABELS.unknown}
                  </span>
                )}
                {/* La etiqueta es el TIPO; la uva va aparte, como texto simple: son dos
                    datos distintos y metidos en una sola cápsula se leían como uno. */}
                {uvaYAño && <span className="wine-row__varietal">{uvaYAño}</span>}
              </span>
            )}
            {/* El puntaje va con la bodega, en la línea de abajo, y no en la columna de la derecha:
                ahí se apilaba contra la cantidad y se superponían. Con la vitrina se ve en estrellas. */}
            {(bodega || (!esVitrina && wine.rating > 0)) && (
              <span className="wine-row__winery">
                {bodega}
                {!esVitrina && wine.rating > 0 && (
                  <span className="wine-row__rating-inline" aria-label={`${wine.rating} de 5`}>
                    {bodega ? " · " : ""}
                    <Icon name="star" filled size={11} /> {wine.rating.toFixed(1).replace(".", ",")}
                  </span>
                )}
              </span>
            )}

            {/* Dónde está la botella en tu casa. Debajo de la uva y no
                al lado: "Rosado · Malbec · 2024 📍 Cava 1, Estante 3"
                en un solo renglón se corta en un teléfono, y es un dato
                que se mira sólo cuando ya decidiste el vino y vas a
                buscarlo — no compite por la primera mirada. Sólo
                aparece si lo cargaste: la mayoría de las filas no
                tienen nada que mostrar acá. */}
            {(wine.cellar?.location || wine.cellar?.shelf) && (
              <span className="wine-row__location">
                <Icon name="map-pin" size={11} />{" "}
                {[wine.cellar?.location, wine.cellar?.shelf].filter(Boolean).join(" · ")}
              </span>
            )}

            {/* ── DÓNDE VA "EN SU PUNTO" (probado en pantalla) ───────
                Su propio renglón, debajo de la bodega. Las otras dos
                posiciones se descartaron mirándolas en un teléfono:
                adentro del renglón de la uva partía "Rosado · Rosé ·
                2024" en dos líneas, y en la columna del stock le
                robaba noventa píxeles de ancho al nombre, que pasaba a
                cortarse. Acá tiene la fila entera para él y no empuja
                nada. */}
            {enSuPunto && (
              <span className="wine-row__peak" title={`Ventana de consumo estimada: ${guarda.detail}`}>
                <Icon name="sparkle" size={11} /> {guarda.label}{guarda.yearsLeft > 0 ? ` · hasta ${guarda.until}` : ""}
              </span>
            )}

            {/* ── LO QUE PASÓ CON ESTE VINO, EN PALABRAS ────────────────────
                «Tomado 2 veces · hoy» y, en "Ya tomados", qué hace cada botón
                con el stock que hay. Sin esto, tomar un vino, sumar una botella
                y abrirla dejaba la fila igual que antes: el historial avanzaba
                y la pantalla no lo decía. Son dos datos independientes (cuántas
                veces lo tomaste, cuántas botellas quedan) y se dicen aparte. */}
            {!esGrilla && wine.tasted && (
              <span className="wine-row__tomado">{resumenTomado(wine)}</span>
            )}
            {!esGrilla && conStepper && (vista === "probados" || vista === "sin-stock") && (
              <span className="wine-row__pista">{pistaDeStock(wine)}</span>
            )}

            {/* El puntaje con estrellas y no como número: en la vitrina
                hay lugar, y cinco estrellas se comparan de un vistazo
                entre vinos vecinos, que es justo lo que uno hace acá.
                En el archivo sigue siendo el número, que ocupa un
                cuarto del ancho. */}
            {esVitrina && wine.rating > 0 && (
              <StarRating value={wine.rating} size="sm" />
            )}
          </span>

          <span className="wine-row__right">
            <span
              className={`wine-row__qty ${Number(wine.quantity) <= 0 ? "is-empty" : ""} ${
                Number(wine.quantity) === 1 ? "is-last" : ""
              } ${conStepper ? "tiene-stepper" : ""}`}
              title={nuncaFueTuyo ? "Lo tomaste afuera" : stockLabel(wine.quantity)}
            >
              {Number(wine.quantity) <= 0 ? "0" : `×${wine.quantity}`}
            </span>
            {/* Numérico en vez de cinco estrellas: dice lo mismo en un
                cuarto del ancho. */}
            {/* Un solo chevrón por card: tocar la card abre la ficha, así que no hace falta
                un ">" al lado de la cantidad. El "⌄" de abajo es el único, y sólo despliega
                las acciones rápidas. */}
          </span>
        </button>

        {conStepper && (
          <span className={`wine-row__stepper ${Number(wine.quantity) > 0 ? "" : "wine-row__stepper--solo"}`} role="group" aria-label={`Botellas de ${wineDisplayName(wine)}`}>
            {Number(wine.quantity) > 0 && (
              <button
                type="button"
                className="wine-row__stepper-btn"
                onClick={() => onAbrirUna?.(wine)}
                disabled={isPending}
                aria-label="Abrir una botella"
                title="Abrir una botella: baja el stock y cuenta como tomada"
              >
                <Icon name="minus" size={16} />
              </button>
            )}
            {Number(wine.quantity) > 0 && (
              <button
                type="button"
                className="wine-row__stepper-n"
                onClick={() => onSumarStock?.(wine)}
                disabled={isPending || !onSumarStock}
                aria-live="polite"
                aria-label={`${wine.quantity} ${Number(wine.quantity) === 1 ? "botella" : "botellas"}: tocá para sumar varias`}
                title="Sumar varias botellas"
              >
                {wine.quantity}
              </button>
            )}
            <button
              type="button"
              className="wine-row__stepper-btn"
              onClick={() => onSumarUna(wine)}
              disabled={isPending}
              aria-label="Sumar una botella"
              title="Sumar al stock: sigue entre los tomados"
            >
              <Icon name="plus" size={16} />
            </button>
          </span>
        )}

        {/* Probado o por probar, siempre explícito y siempre editable:
            la ausencia de marca no se lee como "pendiente", se lee como
            nada.

            Menos en la vista "Probados", donde todos lo están: una
            columna entera repitiendo la misma palabra en verde no
            informa, sólo ocupa el ancho del nombre. Ahí el chip se va
            y desmarcar se hace desplegando la fila —ver el botón
            "Sin probar" en `wine-row__acciones`, que existe
            específicamente para esta vista—. */}
        {chipEnFila && (
        <button
          type="button"
          className={`toggle-chip wine-row__tasted ${wine.tasted ? "is-on" : ""}`}
          onClick={() => onToggleTasted(wine)}
          // Durante la selección la fila entera significa "elegir":
          // dejar un control que hace otra cosa en el medio es pedir un
          // toque equivocado.
          disabled={isPending || modoSeleccion}
          aria-pressed={wine.tasted}
          // El tooltip dice el ESTADO; que se pueda tocar lo dice que
          // sea un botón. "Tocá para desmarcarlo" es la app narrando
          // una interacción que el control ya ofrece.
          title={wine.tasted ? "Ya tomado" : "Todavía sin tomar: marcalo cuando lo hayas tomado, sea tuyo o no"}
          aria-label={
            wine.tasted
              ? `Marcar ${wineDisplayName(wine)} como sin tomar`
              : `Marcar ${wineDisplayName(wine)} como tomado`
          }
        >
          <Icon name={wine.tasted ? "check" : "circle"} size={13} />
          <span className="wine-row__tasted-text">
            {wine.tasted ? "Ya tomado" : "Marcar como tomado"}
          </span>
        </button>
        )}

        {/* ── EL CORAZÓN, TOCABLE, PERO SÓLO EN GRILLA ────────────────
            En lista el favorito se toca desde el panel desplegable
            (ver `puedeExpandir` más arriba); acá, al lado de la foto
            —igual que el chip de probado—, sólo queda de sólo
            lectura, chiquito, adentro del nombre.

            En grilla no hay panel desplegable (no hay dónde
            desplegar sin descolocar a las tarjetas vecinas), así que
            sin este botón el corazón era una marca que nunca se
            podía tocar ahí — ni para ponerlo ni para sacarlo, en
            NINGUNA vista, porque la ficha ya no lo ofrece tampoco
            (ver WineDetailPage.jsx). Hermano de `wine-row__main` y
            no anidado, mismo motivo que el resto de los botones de
            esta cabecera. */}
        {esGrilla && (
          <button
            type="button"
            className={`wine-row__gridfav ${wine.favorite ? "is-on" : ""}`}
            onClick={() => onToggleFavorite(wine)}
            disabled={isPending || modoSeleccion}
            aria-pressed={wine.favorite}
            title={wine.favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
            aria-label={
              wine.favorite
                ? `Quitar ${wineDisplayName(wine)} de favoritos`
                : `Marcar ${wineDisplayName(wine)} como favorito`
            }
          >
            <Icon name="heart" filled={wine.favorite} size={15} />
          </button>
        )}

        {/* ── EL CHEVRON, ABAJO Y CENTRADO ──────────────────────────
            Abre las acciones rápidas sin salir de la lista (abrir
            botella, favorito, eliminar, la ficha técnica).

            Estaba en el medio de la cabecera, entre el nombre y el
            chip de probado, y ahí no se anclaba a nada: con un título
            corto quedaba pegado al texto y con uno largo aparecía
            flotando en cualquier lado del renglón. Abajo, ocupando el
            ancho completo, siempre está en el mismo lugar y encima
            apunta a donde va a aparecer el panel — que es lo que un
            chevron hacia abajo significa.

            No reemplaza a la flecha de la derecha: ésa lleva a la
            ficha del vino y esto despliega la fila. Son dos destinos
            distintos y necesitan dos controles distintos; un solo
            ícono para las dos cosas es la manera de que ninguna se
            entienda.

            En la vitrina en modo lista, o en "Probados"/"Favoritos"
            (ver `puedeExpandir`, un poco más arriba) — ahí vive el
            único corazón que se puede TOCAR (el de la cabecera es
            sólo un indicador) y el único "Sin probar" que puede
            DESHACER un probado, y sin esto un vino sin stock
            quedaba sin ninguna forma de tocar ninguno de los dos:
            no está en "En stock" (no tiene botellas) y la ficha ya
            no los ofrece (se sacó de ahí, ver WineDetailPage.jsx).
            En el resto del archivo (que hoy es sólo grilla, con
            cualquier vista) la fila sigue siendo una sola línea de
            38px y sumar una franja más la partiría en dos; en
            grilla no hay dónde desplegar sin descolocar a las
            tarjetas vecinas, así que ahí estas acciones viven en la
            ficha. Botón hermano del de arriba y no anidado: un
            botón adentro de otro no es HTML válido. */}
        {!esGrilla && puedeExpandir && (
          <button
            type="button"
            className="wine-row__disclosure"
            onClick={() => onExpandir(expanded ? null : wine._id)}
            disabled={modoSeleccion}
            aria-expanded={expanded}
            aria-label={
              expanded
                ? `Ocultar acciones rápidas de ${wineDisplayName(wine)}`
                : `Más acciones de ${wineDisplayName(wine)}`
            }
            title={expanded ? "Ocultar acciones rápidas" : "Más acciones"}
          >
            <Icon name="chevron-down" size={18} className="wine-row__disclosure-icon" />
          </button>
        )}
      </div>

      {expanded && !esGrilla && puedeExpandir && (
        <WineRowPanel
          wine={wine}
          vista={vista}
          conToggleProbado={!chipEnFila}
          isPending={isPending}
          nuncaFueTuyo={nuncaFueTuyo}
          enCava={enCava}
          onToggleTasted={onToggleTasted}
          onToggleFavorite={onToggleFavorite}
          onEliminar={onEliminar}
        />
      )}
    </article>
  );
}

export default memo(WineRow);
