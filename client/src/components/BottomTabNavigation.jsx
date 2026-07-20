import { useLocation, useNavigate } from "react-router-dom";
import "../styles/BottomTabNavigation.css";

const TabIcon = ({ name }) => {
  if (name === "bodega") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 2h6v4l-1.6 5.3a5.2 5.2 0 0 0-.1 1.4V19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-6.3a5.2 5.2 0 0 0-.1-1.4L7 6V2Z" fill="currentColor"/>
      </svg>
    );
  }

  if (name === "favoritos") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 21-1.2-1.1C6.2 15.8 3 13 3 9.4A4.4 4.4 0 0 1 7.4 5c1.9 0 3 1 4 2.2C12.5 6 13.7 5 15.6 5A4.4 4.4 0 0 1 20 9.4c0 3.6-3.2 6.4-7.8 10.5L12 21Z" fill="currentColor"/>
      </svg>
    );
  }

  if (name === "explorar") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 3 2.2 5.3L19.5 10l-5.3 2.2L12 17.5l-2.2-5.3L4.5 10l5.3-1.7L12 3Z" fill="currentColor"/>
      </svg>
    );
  }

  if (name === "descubrir") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z" fill="currentColor"/>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4 0-7 2.2-7 5v1h14v-1c0-2.8-3-5-7-5Z" fill="currentColor"/>
    </svg>
  );
};

export default function BottomTabNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  const tabs = [
    { id: "bodega", label: "Bodega", path: "/" },
    { id: "favoritos", label: "Favoritos", path: "/favoritos" },
    { id: "descubrir", label: "Agregar", path: "/descubrir", primary: true },
    { id: "explorar", label: "Explorar", path: "/explorar" },
    { id: "perfil", label: "Perfil", path: "/perfil" },
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
    navigate(path);
  };

  return (
    <nav className="bottom-tabs-container" aria-label="Navegación principal">
      <div className="bottom-tabs">
        <div className="sidebar-brand" aria-hidden="true">
          <span className="sidebar-brand__mark">🍇</span>
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
            <span className="tab-icon"><TabIcon name={tab.id} /></span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
