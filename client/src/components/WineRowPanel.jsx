import Icon from "./Icon";


/**
 * El panel que se abre debajo de una fila de Mi Bodega: la antigüedad, la ficha
 * técnica y la botonera.
 *
 * Está separado de `WineRow` por dos razones. La primera es de tamaño: juntos
 * pasaban las 600 líneas y ninguna de las dos mitades se podía leer entera. La
 * segunda es de trabajo: sólo se monta cuando la fila está abierta, así que
 * treinta filas cerradas no construyen treinta panels.
 *
 * `nuncaFueTuyo` y `enCava` llegan calculados desde la fila en vez de
 * recalcularse acá: son los mismos datos que la cabecera ya usa.
 */
export default function WineRowPanel({
  wine,
  vista,
  isPending,
  nuncaFueTuyo,
  enCava,
  onAbrirBotella,
  onSumarStock,
  onToggleTasted,
  onToggleFavorite,
  onEliminar,
}) {
  return (
    <div className="wine-row__expand">
      {/* ── EL RENGLÓN DE ESTADO, SIN EL STOCK ──────────────────
          Decía "4 botellas · en tu cava hace 8 meses". La primera
          mitad ya está escrita tres centímetros más arriba, en el
          "×4" de la cabecera, y encima con MENOS palabras: repetir
          el mismo número en dos formatos distintos dentro de la
          misma tarjeta obliga a leer dos veces para confirmar que
          dicen lo mismo.

          Queda la antigüedad, que no está en ninguna otra parte, y
          el caso del vino que nunca fue tuyo — ahí "Lo tomaste
          afuera" no es redundante: es la única línea que explica
          por qué esta fila no ofrece abrir una botella. */}
      {(nuncaFueTuyo || enCava) && (
        <p className="wine-row__state-line">
          {nuncaFueTuyo && "Lo tomaste afuera"}
          {nuncaFueTuyo && enCava && " · "}
          {enCava && `En tu cava hace ${enCava}`}
        </p>
      )}

      {/* ── LA FICHA TÉCNICA, EN UNA GRILLA ─────────────────────
          Uva, cosecha, región, tipo y lo tuyo (dónde la guardás,
          qué pagaste), en pares rótulo/valor de dos columnas.

          Antes esto era una fila que envolvía, con sólo los datos
          que la cabecera no hubiera dicho ya. La intención era
          buena —no repetir— pero el resultado era una lista
          distinta en cada vino: uno mostraba tres datos, el de al
          lado uno solo y el tercero ninguno, así que el panel no
          tenía forma propia y los valores parecían texto suelto
          flotando entre el renglón gris y los botones. Sin una
          estructura fija, "abrir una fila" no significaba nada
          predecible.

          La grilla lo arregla al revés: la ficha es SIEMPRE la
          misma y por eso se puede aprender de memoria dónde mirar.
          El precio a pagar es que uva y tipo pueden repetirse con
          el subtítulo — y por eso el subtítulo de la vitrina
          adelgazó (ver `uvaYAño`): arriba queda lo que sirve para
          reconocer la botella, acá la ficha completa.

          Los vacíos no se dibujan: un "REGIÓN —" es una fila que
          hay que leer para descubrir que no dice nada. */}
      {(() => {
        const datos = [
          ["Uva", wine.varietal],
          ["Cosecha", wine.vintage],
          ["Región", wine.region],
          ["Guardado en", wine.cellar?.location],
          [
            "Pagaste",
            wine.purchase?.price > 0
              ? `$${Number(wine.purchase.price).toLocaleString("es-AR")}`
              : "",
          ],
        ].filter(([, valor]) => valor);

        if (datos.length === 0) return null;
        return (
          <dl className="wine-row__facts">
            {datos.map(([rotulo, valor]) => (
              <div key={rotulo} className="wine-row__fact">
                <dt>{rotulo}</dt>
                <dd>{valor}</dd>
              </div>
            ))}
          </dl>
        );
      })()}

      {/* ── UNA SOLA BOTONERA AL PIE ────────────────────────────
          Eran DOS contenedores hermanos: uno con el botón
          principal estirado a todo el ancho y otro, debajo, con el
          corazón y el tacho empujados contra el borde derecho.
          Dos filas para tres botones, sin ninguna línea de base
          compartida — el principal terminaba a una altura y los
          íconos flotaban a otra, cada uno de un tamaño distinto.

          Ahora es una fila: el principal se lleva el espacio que
          sobra (`flex: 1`) y los dos secundarios son cuadrados de
          44px, que es el mínimo con el que un pulgar acierta.
          Misma altura, mismo eje, un solo bloque de acciones. */}
      <div className="wine-row__acciones">
        {/* ── EL STOCK SE AJUSTA EN LA FICHA, Y SÓLO AHÍ ────────
            Acá vivía un stepper igual al de la ficha del vino. Era
            la misma acción dibujada dos veces, y la duplicación no
            salía gratis: cada lugar necesitaba su propio rótulo y
            su propia aclaración de que restar no es tomarse una,
            así que la fila desplegada dedicaba tres renglones a
            explicar un control que se usa de vez en cuando.

            De los dos lugares se fue ÉSTE y no el de la ficha, que
            es lo contrario de lo que uno diría. La razón es que en
            vista GRILLA la tarjeta no se despliega: tocarla abre la
            ficha (decisión deliberada — expandir una celda
            descoloca a toda la cuadrícula). O sea que la fila
            desplegada no existe en grilla, y dejar el stock sólo
            acá habría dejado media app sin poder ajustarlo. La
            ficha, en cambio, se alcanza desde las dos vistas.

            Lo que se hace seguido —abrir una botella— se queda:
            ésa es la acción de la lista. Corregir el inventario es
            otra cosa y tiene su pantalla. */}

        {/* Mientras haya botellas, la acción es abrir una: es lo
            que se hace con un vino que tenés en casa, y de paso lo
            deja marcado como probado. Abre la hoja en vez de
            descontar de una: es donde se elige cuántas y donde se
            leen las tres consecuencias.

            Sin stock, y en cualquier vista MENOS "Probados", ACÁ
            NO vuelve un botón de "Marcar probado": ése ya está,
            siempre visible, en el chip de la cabecera
            (`wine-row__tasted`) — es el mismo caso que la
            valoración doble de la ficha del vino (ver el
            comentario en WineDetailPage sobre "Tu opinión"): dos
            controles para la misma pregunta, uno al lado del
            otro apenas se despliega la fila. */}
        {Number(wine.quantity) > 0 && (
          <button
            className="wine-action-btn wine-action-btn--open"
            onClick={() => onAbrirBotella(wine)}
            type="button"
            disabled={isPending}
          >
            <Icon name="bottle" size={16} />
            Abrí una botella
          </button>
        )}

        {/* Volver a tener stock: sobre todo para un vino que ya tomaste y volviste a comprar. Sin stock
            es la acción principal de la fila (no hay nada que abrir); con stock queda al lado de abrir. */}
        {onSumarStock && (
          <button
            className={`wine-action-btn ${Number(wine.quantity) <= 0 ? "wine-action-btn--open" : ""}`}
            onClick={() => onSumarStock(wine)}
            type="button"
            disabled={isPending}
          >
            <Icon name="plus" size={16} />
            {Number(wine.quantity) <= 0 ? "Tengo stock de nuevo" : "Sumar botellas"}
          </button>
        )}

        {/* En "Probados" el chip de la cabecera SÍ se esconde
            (ver más abajo: una columna entera repitiendo
            "Probado" no informa), así que acá — y sólo acá —
            hace falta este botón, o desmarcar un vino que
            probaste por error dejaría de tener forma de
            deshacerse. */}
        {/* ── UN BOTÓN DICE QUÉ HACE, NO QUÉ PASA ──────────────
            Este decía "Sin probar" con un tilde al lado, parado
            adentro de la pestaña "Probados". O sea: rotulaba un
            ESTADO, y encima el contrario del que el vino tiene —
            porque si está en esa lista, está probado. Quien lo
            leía tenía que adivinar si describía la fila o si era
            lo que iba a pasar al tocarlo.

            Ahora nombra la acción. El tilde también se va: un
            check refuerza "esto ya está hecho", que es justo lo
            contrario de deshacerlo. */}
        {vista === "probados" && (
          <button
            className="wine-action-btn"
            onClick={() => onToggleTasted(wine)}
            type="button"
            disabled={isPending}
          >
            <Icon name="refresh" size={16} />
            Marcar como sin tomar
          </button>
        )}

        {/* Sin "Ver ficha completa": tocar la cabecera de la fila
            ya lleva ahí en un solo gesto, así que el link repetía,
            un renglón más abajo, la acción que se acaba de usar
            para llegar a este mismo panel. */}
        <button
          type="button"
          className={`wine-row__icon-btn ${wine.favorite ? "is-fav" : ""}`}
          onClick={() => onToggleFavorite(wine)}
          disabled={isPending}
          aria-pressed={!!wine.favorite}
        >
          <Icon name="heart" filled={wine.favorite} size={17} />
          Favorito
        </button>
        <button
          type="button"
          className="wine-row__icon-btn wine-row__icon-btn--danger"
          onClick={() => onEliminar(wine._id)}
          disabled={isPending}
        >
          <Icon name="trash" size={17} />
          Eliminar
        </button>
      </div>
    </div>
  );
}
