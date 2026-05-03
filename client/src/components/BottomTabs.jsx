import { NavLink } from "react-router-dom";

const tabs = [
  {
    to: "/",
    label: "Descubrir",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 21C12 21 18 14.8 18 10.2C18 6.78 15.31 4 12 4C8.69 4 6 6.78 6 10.2C6 14.8 12 21 12 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="12" cy="10" r="3" fill="currentColor" opacity="0.3"/>
      </svg>
    ),
  },
  {
    to: "/mapa",
    label: "Cerca",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 10C4 5.58172 7.58172 2 12 2C16.4183 2 20 5.58172 20 10C20 15 12 22 12 22C12 22 4 15 4 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="2"/>
      </svg>
    ),
  },
  {
    to: "/comunidad",
    label: "Comunidad",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
        <path d="M23 21v-2a4 4 0 00-3-3.87" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

const BottomTabs = () => {
  return (
    <nav className="bottom-tabs" aria-label="Navegación inferior">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) => `bottom-tab ${isActive ? "bottom-tab--active" : ""}`}
        >
          <span className="bottom-tab__icon" aria-hidden="true">
            {tab.icon}
          </span>
          <span className="bottom-tab__label">{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
};

export default BottomTabs;
