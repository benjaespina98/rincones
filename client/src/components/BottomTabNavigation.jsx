import { useLocation, useNavigate } from "react-router-dom";
import "../styles/BottomTabNavigation.css";

export default function BottomTabNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  const tabs = [
    { id: "bodega", label: "Bodega", icon: "🍷", path: "/" },
    { id: "explorar", label: "Explorar", icon: "🔍", path: "/explorar" },
    { id: "descubrir", label: "Descubrir", icon: "✨", path: "/descubrir" },
    { id: "perfil", label: "Perfil", icon: "👤", path: "/perfil" },
  ];

  const getActiveTab = () => {
    const pathToTab = {
      "/": "bodega",
      "/explorar": "explorar",
      "/descubrir": "descubrir",
      "/perfil": "perfil",
      "/profile": "perfil",
    };
    return pathToTab[location.pathname] || "bodega";
  };

  const activeTab = getActiveTab();

  const handleTabClick = (path) => {
    navigate(path);
  };

  return (
    <nav className="bottom-tabs-container">
      <div className="bottom-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-button ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => handleTabClick(tab.path)}
            aria-label={tab.label}
            type="button"
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
