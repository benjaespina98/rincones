import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Icon from "./Icon";
import Logo from "./Logo";
import AddWineButton from "./AddWineButton";
import { tapHaptic } from "../utils/haptics";
import { TABS, tabForPath } from "../data/navigation";
import "./BottomTabNavigation.css";

export default function BottomTabNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  // La lista de pestañas y la regla de "qué pestaña corresponde a esta URL"
  // viven en data/navigation.js, compartidas con AppLayout.
  const activeTab = tabForPath(location.pathname);

  const filaRef = useRef(null);
  const activoRef = useRef(null);
  const [indicador, setIndicador] = useState(null);

  /**
   * ── EL INDICADOR SE MUEVE, NO SE PRENDE ───────────────────────────────────
   *
   * Antes cada pestaña dibujaba su propia barrita con un `::before` que
   * aparecía y desaparecía. Eso son dos eventos sueltos —uno se apaga, otro se
   * prende— y no cuentan nada: no dicen de dónde venís ni hacia dónde fuiste.
   * Un indicador que se desliza convierte el cambio de pestaña en un
   * movimiento, que es lo que hace que una barra se lea como UN control en vez
   * de tres botones pegados.
   *
   * Se mide del DOM en vez de calcularse: las pestañas no miden lo mismo
   * ("Sommelier" es más ancha que "Descubrí") y el ancho depende del tamaño de
   * fuente del sistema, que el usuario puede cambiar. Cualquier cuenta a mano
   * se rompe ahí.
   */
  const medir = useCallback(() => {
    const btn = activoRef.current;
    const fila = filaRef.current;
    // Se sale sin tocar el estado: una pantalla de detalle no marca ninguna
    // pestaña, y poner el estado en null en cada render de esas dispara una
    // cascada de renders por una medición que no existe.
    if (!btn || !fila) return;
    setIndicador({ left: btn.offsetLeft + btn.offsetWidth / 2 });
  }, []);

  // Layout effect: medido después del pintado, el indicador aparecería un frame
  // en la posición vieja y saltaría. Se ve.
  useLayoutEffect(medir, [medir, activeTab]);

  useEffect(() => {
    const fila = filaRef.current;
    if (!fila || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(medir);
    ro.observe(fila);
    return () => ro.disconnect();
  }, [medir]);

  const handleTabClick = (path) => {
    if (path === location.pathname) return;
    tapHaptic();
    navigate(path);
  };

  return (
    <nav className="bottom-tabs-container" aria-label="Navegación principal">
      <div className="bottom-tabs" ref={filaRef}>
        <div className="sidebar-brand" aria-hidden="true">
          <Logo size={26} className="sidebar-brand__mark" />
          <span className="sidebar-brand__name">Rincones</span>
        </div>

        {/* La cámara está escrita adentro de la barra pero NO ocupa un lugar en
            la fila: en teléfono se sale con `position: fixed` y se centra
            sola, porque con tres pestañas ningún reparto de la fila cae en el
            medio (ver su hoja de estilos). Vive en este marcado porque en
            escritorio, donde la barra se convierte en sidebar, vuelve al flujo
            y se acomoda como primer elemento de la columna — sin espaciadores
            inventados ni números mágicos que mantener sincronizados. */}
        {/* Decorativo: quien anuncia cuál es la pestaña actual es
            `aria-current` en su botón, no esta barrita. */}
        {indicador && (
          <span
            className="bottom-tabs__indicador"
            aria-hidden="true"
            style={{ transform: `translateX(${indicador.left}px) translateX(-50%)` }}
          />
        )}

        {TABS.map((tab, i) => {
          const activo = activeTab === tab.id;
          return (
            <Fragment key={tab.id}>
            {/* Escanear va entre Sommelier y Mi Bodega: la acción principal en medio de la fila. */}
            {i === 2 && <AddWineButton />}
            <button
              ref={activo ? activoRef : null}
              className={`tab-button ${activo ? "active" : ""}`}
              onClick={() => handleTabClick(tab.path)}
              aria-label={tab.label}
              aria-current={activo ? "page" : undefined}
              type="button"
            >
              <span className="tab-icon">
                <Icon name={tab.icon} filled size={22} />
              </span>
              <span className="tab-label">{tab.label}</span>
            </button>
            </Fragment>
          );
        })}
      </div>
    </nav>
  );
}
