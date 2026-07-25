import { useLocation, useNavigate } from "react-router-dom";
import Icon from "./Icon";
import { tapHaptic } from "../utils/haptics";
import "../styles/BottomTabNavigation.css";

export default function BottomTabNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  // Orden: Descubrí (home) · Guardados · [+ Agregar centrado] · Sommelier · Bodega.
  // El perfil se accede tocando el nombre en el header, no hay tab acá.
  // Guardados = vinos que querés probar / favoritos (no los tenés todavía).
  // Bodega = tu stock real (solo entra por escaneo).
  const tabs = [
    { id: "descubri", label: "Descubrí", path: "/", icon: "sparkle", filled: true },
    { id: "guardados", label: "Guardados", path: "/guardados", icon: "heart", filled: true },
    { id: "agregar", label: "Agregar", path: "/agregar", icon: "plus-solid", filled: true, primary: true },
    { id: "sommelier", label: "Sommelier", path: "/sommelier", icon: "wine-glass", filled: true },
    { id: "bodega", label: "Bodega", path: "/bodega", icon: "bottle", filled: true },
  ];

  const pathToTab = {
    "/": "descubri",
    "/guardados": "guardados",
    "/agregar": "agregar",
    "/sommelier": "sommelier",
    "/bodega": "bodega",
    "/vino": "bodega",
  };

  const activeTab =
    pathToTab[location.pathname] ||
    (location.pathname.startsWith("/vino") ? "bodega" : null);

  const handleTabClick = (path) => {
    if (path === location.pathname) return;
    tapHaptic();
    navigate(path);
  };

  return (
    <nav className="bottom-tabs-container" aria-label="Navegación principal">
      <div className="bottom-tabs">
        <div className="sidebar-brand" aria-hidden="true">
          <img className="sidebar-brand__mark" src="/favicon.svg" alt="" width={26} height={26} />
          <span className="sidebar-brand__name">Rincones</span>
        </div>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-button ${activeTab === tab.id ? "active" : ""} ${tab.primary ? "tab-button--add" : ""}`}
            onClick={() => handleTabClick(tab.path)}
            aria-label={tab.label}
            aria-current={activeTab === tab.id ? "page" : undefined}
            type="button"
          >
            <span className="tab-icon"><Icon name={tab.icon} filled={tab.filled} size={tab.primary ? 24 : 22} /></span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
