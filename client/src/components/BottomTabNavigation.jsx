import { useLocation, useNavigate } from "react-router-dom";
import Icon from "./Icon";
import { tapHaptic } from "../utils/haptics";
import "../styles/BottomTabNavigation.css";

export default function BottomTabNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  const tabs = [
    { id: "bodega", label: "Bodega", path: "/", icon: "wine-glass" },
    { id: "favoritos", label: "Favoritos", path: "/favoritos", icon: "heart" },
    { id: "descubrir", label: "Agregar", path: "/descubrir", icon: "plus-solid", primary: true },
    { id: "explorar", label: "Explorar", path: "/explorar", icon: "sparkle" },
    { id: "perfil", label: "Perfil", path: "/perfil", icon: "user-solid" },
  ];

  const getActiveTab = () => {
    const pathToTab = {
      "/": "bodega",
      "/favoritos": "favoritos",
      "/explorar": "explorar",
      "/descubrir": "descubrir",
      "/perfil": "perfil",
      "/profile": "perfil",
    };
    return pathToTab[location.pathname] || "bodega";
  };

  const activeTab = getActiveTab();

  const handleTabClick = (path) => {
    // No revibramos ni renavegamos si ya estás en esa sección.
    if (path === location.pathname) return;
    tapHaptic();
    navigate(path);
  };

  return (
    <nav className="bottom-tabs-container" aria-label="Navegación principal">
      <div className="bottom-tabs">
        <div className="sidebar-brand" aria-hidden="true">
          <span className="sidebar-brand__mark"><Icon name="wine-glass" filled size={20} /></span>
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
            <span className="tab-icon"><Icon name={tab.icon} filled size={22} /></span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
