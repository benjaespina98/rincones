import { useNavigate } from "react-router-dom";
import Icon from "./Icon";
import WinePhoto from "./WinePhoto";
import WineMeta from "./WineMeta";
import LoadingSkeleton from "./LoadingSkeleton";
import EmptyState from "./EmptyState";
import ErrorState from "./ErrorState";
import { useToast } from "../context/ToastContext";
import "./WishlistPanel.css";

/**
 * La mitad de "Favoritos" que sale de la wishlist: los vinos que te gustan y
 * todavía NO tenés.
 *
 * ── DE PESTAÑA A VISTA ─────────────────────────────────────────────────────
 * Esto era una pantalla entera (`/guardados`) con su pestaña en la barra, su
 * propio encabezado y su propio segmentado de "Todos / Favoritos" — un
 * SEGUNDO significado de "favorito", adentro de una lista que ya era de
 * favoritos por estar en ella. Nada de eso queda: es una sección más de la
 * vista "Favoritos" en Mi Bodega (que unificó ese corazón con el de un vino
 * que sí tenés — ver VISTA_DESEOS en utils/cellarViews.js), el encabezado, el
 * buscador y el segmentado los pone la pantalla que la contiene, y estar en
 * esta lista ya ES el favorito: no hace falta un segundo corazón adentro de
 * cada fila. Lo único que sobrevive —y lo único que era propio de acá— es la
 * fila en sí: un vino que no tenés no ofrece abrir una botella, ofrece decir
 * "ya lo tengo".
 *
 * La bodega es stock real y entra por escaneo, así que acá no se crea stock:
 * se guarda el deseo, y "Ya lo tengo" lleva a cargar la botella con los datos
 * que la app ya sabe.
 */
export default function WishlistPanel({
  wishes,
  loading,
  error,
  reload,
  addWish,
  removeWish,
  /** Términos ya normalizados del buscador de Mi Bodega. */
  terms = [],
  /** Se llama cuando el vacío ofrece irse a otra vista de la bodega. */
  onVerBodega,
  /** Qué texto buscar, para poder ofrecer limpiarlo desde el vacío. */
  onLimpiarBusqueda,
}) {
  const navigate = useNavigate();
  const { addToast, removeToast, showSuccess, showError } = useToast();

  const buscando = terms.length > 0;
  const visible = buscando
    ? wishes.filter((w) => {
        const heno = [w.name, w.winery, w.region, w.varietal, w.vintage]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return terms.every((t) => heno.includes(t));
      })
    : wishes;

  const openDetail = (wish) =>
    navigate("/descubrir/vino", {
      state: {
        wine: {
          name: wish.name,
          winery: wish.winery,
          region: wish.region,
          varietal: wish.varietal,
          type: wish.type,
          image: wish.image,
          vintage: wish.vintage,
        },
      },
    });

  /**
   * Quitar de la lista, con vuelta atrás.
   *
   * Borrar un vino de la bodega ofrece "Deshacer" desde siempre; quitarlo de
   * esta lista —la misma clase de acción, igual de destructiva— no ofrecía
   * nada. Un toque equivocado te hacía volver a buscar el vino y guardarlo de
   * nuevo a mano.
   */
  const handleRemove = async (wish) => {
    try {
      await removeWish(wish._id);
    } catch {
      showError("No se pudo quitar el vino");
      return;
    }

    const toastId = addToast(`"${wish.name}" quitado de tu lista`, "warning", 8000, {
      label: "Deshacer",
      onClick: async () => {
        removeToast(toastId);
        try {
          await addWish({
            name: wish.name,
            winery: wish.winery || "",
            region: wish.region || "",
            varietal: wish.varietal || "",
            vintage: wish.vintage || undefined,
            type: wish.type || "unknown",
            image: wish.image || "",
            source: wish.source || "",
          });
          showSuccess(`"${wish.name}" vuelve a tu lista`);
        } catch {
          showError("No se pudo deshacer");
        }
      },
    });
  };

  if (loading) return <LoadingSkeleton type="list" count={4} />;

  if (error) {
    return (
      <ErrorState
        title="No se pudo cargar tu lista"
        hint="Tus vinos siguen ahí. Revisá tu conexión y probá de nuevo."
        onRetry={reload}
      />
    );
  }

  if (visible.length === 0) {
    // El vacío dice por qué está vacío: no es lo mismo no haber guardado nada
    // que haber buscado algo que no está en la lista.
    return buscando ? (
      <EmptyState
        icon="search"
        title="Ninguno de tus guardados coincide"
        actionLabel="Limpiar búsqueda"
        onAction={onLimpiarBusqueda}
      />
    ) : (
      <EmptyState
        icon="heart"
        title="Todavía no guardaste ningún vino"
        hint="Guardá los que quieras probar y quedan acá."
        actionLabel="Descubrir vinos"
        onAction={() => navigate("/")}
        // La otra puerta: quien ya tiene la botella en la mano no viene a
        // anotarla, viene a cargarla.
        secondaryLabel="Ver lo que ya tengo"
        onSecondary={onVerBodega}
      />
    );
  }

  return (
    <ul className="wishlist">
      {visible.map((wish) => (
        <li key={wish._id} className="wishlist-card">
          {/* ── LA FILA ES EL VINO; LAS ACCIONES VAN ABAJO ─────────────────
              Acá había cuatro controles apilados en una columna a la derecha
              —corazón, "Ya lo tengo", una × y una flecha suelta en el medio—
              que se comían la mitad del ancho, así que "Alma Negra M Blend"
              se partía en dos renglones al lado de una torre de botones. El
              corazón se fue entero (ver el comentario grande de arriba: estar
              en esta lista ya ES el favorito), así que ahora es sólo la fila
              —abre el vino— y lo que ES una tarea, abajo, con el ancho para
              decirse con todas las letras. */}
          <div className="wishlist-card__row">
            <button
              type="button"
              className="wishlist-card__main"
              onClick={() => openDetail(wish)}
            >
              <span className="wishlist-card__thumb">
                <WinePhoto src={wish.image} type={wish.type} alt="" artSize={52} fit="contain" />
              </span>
              <span className="wishlist-card__body">
                <span className="wishlist-card__name">{wish.name}</span>
                {wish.winery && <span className="wishlist-card__winery">{wish.winery}</span>}
                <WineMeta
                  type={wish.type}
                  varietal={wish.varietal}
                  vintage={wish.vintage}
                  className="wishlist-card__meta"
                />
              </span>
              <Icon name="chevron-right" size={16} className="wishlist-card__caret" />
            </button>
          </div>

          <div className="wishlist-card__actions">
            {/* El vino viaja: "Ya lo tengo" abre la carga con la bodega, la uva
                y la región ya puestas, en vez de mandarte a escribir de nuevo
                lo que la app ya sabe. `desdeGuardado` es el id, para poder
                sacarlo de esta lista cuando el alta termine. */}
            <button
              type="button"
              className="wishlist-have"
              onClick={() => navigate("/agregar", { state: { desdeGuardado: wish._id, wish } })}
            >
              <Icon name="camera" size={15} /> Ya lo tengo
            </button>
            {/* Con todas las letras y no una ×: una cruz al lado de una tarjeta
                se lee como "cerrar esto", y lo que hace es borrarlo de tu lista. */}
            <button
              type="button"
              className="wishlist-remove"
              onClick={() => handleRemove(wish)}
            >
              Quitar
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
