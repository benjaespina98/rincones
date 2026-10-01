import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import Portal from "./Portal";
import EmptyState from "./EmptyState";
import ErrorState from "./ErrorState";
import LoadingSkeleton from "./LoadingSkeleton";
import ConfirmModal from "./ConfirmModal";
import { useSheet } from "../hooks/useSheet";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useToast } from "../context/ToastContext";
import { agruparPorFecha } from "../utils/chatsAgrupados";
import { listarConversaciones, borrarConversacion } from "../services/sommelierApi";
import "./SommelierChats.css";

/**
 * Las conversaciones con la guía de vino, apiladas a la izquierda como en
 * cualquier chat de IA.
 *
 * ── DOS FORMAS, UN COMPONENTE ───────────────────────────────────────────────
 * En un teléfono es un cajón que entra desde la izquierda: tapa la pantalla,
 * atrapa el foco y se cierra con Escape o tocando afuera (lo resuelve
 * `useSheet`, igual que las hojas). En escritorio es una columna fija al lado de
 * la conversación, donde atrapar el foco sería un error. Cuál de los dos es no
 * es un estilo sino comportamiento, por eso se decide con `useMediaQuery` y no
 * sólo con CSS.
 *
 * ── POR QUÉ EL CAJÓN VA EN UN PORTAL ────────────────────────────────────────
 * Dibujado adentro de la pantalla quedaba por DEBAJO de la barra superior y de
 * la navegación inferior (viven en otro contexto de apilamiento), y esas dos le
 * tapaban justo el botón de arriba y el borde de abajo. Un cajón modal tiene
 * que estar encima de todo, así que cuelga de `document.body`, igual que las
 * hojas y los diálogos. La columna de escritorio, en cambio, se queda en su
 * lugar: ahí tiene que ir por DEBAJO del título.
 *
 * ── LAS CONVERSACIONES SE BORRAN DE A UNA, CON "⋯" ──────────────────────────
 * Cada fila tiene su menú de tres puntos con "Borrar", y borrar pregunta antes:
 * no se deshace. Los dos controles de la fila —abrir y "⋯"— son botones
 * hermanos, no uno adentro del otro (un botón dentro de un botón no es HTML
 * válido). Si se borra la que está abierta, la pantalla vuelve a empezar de
 * cero: `onBorrada` avisa.
 *
 * ── SE LEE AL MOSTRARSE, Y SE REFRESCA SIN PARPADEAR ────────────────────────
 * La lista se pide cuando el panel se ve, no al montar la pantalla, y se vuelve
 * a pedir cuando cambia `version` (cada respuesta nueva). Ese segundo pedido es
 * silencioso: no vuelve a poner el esqueleto de carga ni rompe la lista que ya
 * hay si falla.
 */
const ESCRITORIO = "(min-width: 1024px)";

export default function SommelierChats({
  abierto,
  onClose,
  activoId,
  version,
  onAbrir,
  onNueva,
  onBorrada,
}) {
  const escritorio = useMediaQuery(ESCRITORIO);
  const modal = !escritorio && abierto;
  const visible = escritorio || abierto;
  const panelRef = useSheet(onClose, { enabled: modal });
  const { showError } = useToast();

  const [conversaciones, setConversaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState(false);
  const [menuId, setMenuId] = useState(null);
  const [aBorrar, setABorrar] = useState(null);
  const yaCargo = useRef(false);
  const botonesMas = useRef(new Map());
  const primerItemDelMenu = useRef(null);

  const cargar = useCallback(async () => {
    // El primer pedido muestra el esqueleto; los siguientes, no.
    if (!yaCargo.current) setCargando(true);
    setFallo(false);
    try {
      setConversaciones(await listarConversaciones());
      yaCargo.current = true;
    } catch {
      // Un refresco que falla no tira abajo una lista que ya se está viendo.
      if (!yaCargo.current) setFallo(true);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (visible) cargar();
  }, [visible, version, cargar]);

  /* ── El menú "⋯" ───────────────────────────────────────────────────────────
     Se cierra tocando afuera y con Escape. El Escape se atrapa en la fase de
     captura y se frena ahí: si no, llegaría también al cajón (useSheet escucha
     el mismo evento) y un solo Escape cerraría el menú Y el panel entero. */
  useEffect(() => {
    if (!menuId) return undefined;
    primerItemDelMenu.current?.focus();

    const afuera = (e) => {
      if (!e.target.closest?.(".schats__menu, .schats__mas")) setMenuId(null);
    };
    const tecla = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setMenuId(null);
      botonesMas.current.get(menuId)?.focus();
    };

    document.addEventListener("mousedown", afuera);
    document.addEventListener("touchstart", afuera);
    document.addEventListener("keydown", tecla, true);
    return () => {
      document.removeEventListener("mousedown", afuera);
      document.removeEventListener("touchstart", afuera);
      document.removeEventListener("keydown", tecla, true);
    };
  }, [menuId]);

  const confirmarBorrado = async () => {
    const charla = aBorrar;
    setABorrar(null);
    if (!charla) return;
    /* Se saca de la lista antes de que el servidor conteste: borrar algo propio
       casi nunca falla y esperar con la fila todavía ahí se siente como que el
       toque no anduvo. Si falla, se avisa y se vuelve a traer la verdad. */
    setConversaciones((prev) => prev.filter((c) => c.id !== charla.id));
    try {
      await borrarConversacion(charla.id);
      onBorrada?.(charla.id);
    } catch {
      showError("No pudimos borrar la conversación. Probá de nuevo.");
      cargar();
    }
  };

  const grupos = agruparPorFecha(conversaciones);

  const panel = (
      <aside
        ref={panelRef}
        className="schats"
        aria-label="Tus conversaciones"
        role={modal ? "dialog" : undefined}
        aria-modal={modal ? "true" : undefined}
        tabIndex={-1}
      >
        <div className="schats__cabecera">
          <button
            type="button"
            className="schats__nueva"
            onClick={() => {
              onNueva?.();
              if (modal) onClose?.();
            }}
          >
            <Icon name="plus" size={16} />
            Nueva conversación
          </button>
          {modal && (
            <button type="button" className="schats__cerrar" aria-label="Cerrar" onClick={onClose}>
              <Icon name="x" size={18} />
            </button>
          )}
        </div>

        <div className="schats__lista">
          {cargando ? (
            <LoadingSkeleton type="inline" count={4} />
          ) : fallo ? (
            <ErrorState
              title="No pudimos traer tus conversaciones"
              hint="Revisá tu conexión y probá de nuevo."
              onRetry={cargar}
              compact
            />
          ) : conversaciones.length === 0 ? (
            <EmptyState
              illustration="diario"
              title="Todavía no hay conversaciones"
              hint="Lo que le preguntes al Sommelier queda acá."
              compact
            />
          ) : (
            grupos.map((grupo) => (
              <section key={grupo.titulo} className="schats__grupo">
                <h3 className="schats__grupo-titulo">{grupo.titulo}</h3>
                <ul className="schats__items">
                  {grupo.items.map((c) => {
                    const activo = c.id === activoId;
                    return (
                      <li
                        key={c.id}
                        className={`schats__item${activo ? " schats__item--activo" : ""}${
                          menuId === c.id ? " schats__item--menu" : ""
                        }`}
                      >
                        <button
                          type="button"
                          className="schats__abrir"
                          aria-current={activo ? "true" : undefined}
                          onClick={() => onAbrir?.(c.id)}
                        >
                          <span className="schats__titulo">{c.title}</span>
                        </button>
                        <button
                          type="button"
                          className="schats__mas"
                          ref={(el) => {
                            if (el) botonesMas.current.set(c.id, el);
                            else botonesMas.current.delete(c.id);
                          }}
                          aria-label={`Opciones de la conversación "${c.title}"`}
                          aria-haspopup="menu"
                          aria-expanded={menuId === c.id}
                          onClick={() => setMenuId(menuId === c.id ? null : c.id)}
                        >
                          <Icon name="more" size={18} />
                        </button>
                        {menuId === c.id && (
                          <div className="schats__menu" role="menu" aria-label={`Opciones de "${c.title}"`}>
                            <button
                              type="button"
                              role="menuitem"
                              ref={primerItemDelMenu}
                              className="schats__menu-item schats__menu-item--peligro"
                              onClick={() => {
                                setMenuId(null);
                                setABorrar(c);
                              }}
                            >
                              <Icon name="trash" size={16} />
                              Borrar
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>

        <p className="schats__nota">Se borran solas a los 45 días sin usarse.</p>
      </aside>
  );

  return (
    <>
      {modal ? (
        <Portal>
          <div className="schats__velo" onMouseDown={onClose} aria-hidden="true" />
          {panel}
        </Portal>
      ) : (
        escritorio && panel
      )}

      {/* Borrar una charla no se deshace, así que se pregunta. */}
      <ConfirmModal
        isOpen={Boolean(aBorrar)}
        title="¿Borrar esta conversación?"
        message={aBorrar ? `"${aBorrar.title}" se va de tu historial y no se puede recuperar.` : ""}
        confirmText="Borrar"
        cancelText="Cancelar"
        isDangerous
        onConfirm={confirmarBorrado}
        onCancel={() => setABorrar(null)}
      />
    </>
  );
}
