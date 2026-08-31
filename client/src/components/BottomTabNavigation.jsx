import { useLocation, useNavigate } from "react-router-dom";
import Icon from "./Icon";
import Logo from "./Logo";
import AddWineButton from "./AddWineButton";
import { tapHaptic } from "../utils/haptics";
import { TABS, tabForPath } from "../data/navigation";
import "../styles/BottomTabNavigation.css";

export default function BottomTabNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  // La lista de pestañas y la regla de "qué pestaña corresponde a esta URL"
  // viven en data/navigation.js, compartidas con AppLayout.
  const activeTab = tabForPath(location.pathname);

  const handleTabClick = (path) => {
    if (path === location.pathname) return;
    tapHaptic();
    navigate(path);
  };

  return (
    <nav className="bottom-tabs-container" aria-label="Navegación principal">
      <div className="bottom-tabs">
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
        <AddWineButton />

        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab-button ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => handleTabClick(tab.path)}
            aria-label={tab.label}
            aria-current={activeTab === tab.id ? "page" : undefined}
            type="button"
          >
            <span className="tab-icon"><Icon name={tab.icon} filled size={22} /></span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
