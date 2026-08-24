import { useLocation, useNavigate } from "react-router-dom";
import Icon from "./Icon";
import Logo from "./Logo";
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
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab-button ${activeTab === tab.id ? "active" : ""} ${tab.primary ? "tab-button--add" : ""}`}
            onClick={() => handleTabClick(tab.path)}
            aria-label={tab.label}
            aria-current={activeTab === tab.id ? "page" : undefined}
            type="button"
          >
            <span className="tab-icon"><Icon name={tab.icon} filled size={tab.primary ? 24 : 22} /></span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
