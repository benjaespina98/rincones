import { NavLink } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const links = [
  { to: "/", label: "Descubrir" },
  { to: "/mapa", label: "Mapa" },
  { to: "/comunidad", label: "Comunidad" },
];

const Navbar = () => {
  const { isAdmin } = useAuth();

  const allLinks = isAdmin ? [...links, { to: "/agregar", label: "Agregar" }] : links;

  return (
    <header className="navbar">
      <div className="navbar__brand" aria-label="Rincones">
        <span className="navbar__brand-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 21C12 21 18 14.8 18 10.2C18 6.78 15.31 4 12 4C8.69 4 6 6.78 6 10.2C6 14.8 12 21 12 21Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="12" cy="10" r="2.2" fill="currentColor"/>
          </svg>
        </span>
        <span className="navbar__brand-text">Rincones</span>
      </div>

      <nav className="navbar__nav">
        {allLinks.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              isActive ? "navbar__link navbar__link--active" : "navbar__link"
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>

      <div className="navbar__actions">
        <button className="button button--ghost navbar__icon-btn" aria-label="Buscar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="11" cy="11" r="5" stroke="currentColor" strokeWidth="1.6"/>
          </svg>
        </button>

        <NavLink to="/admin" className="navbar__profile" aria-label="Admin">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="8" r="3" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M4 20c1.6-3.6 6.4-6 8-6s6.4 2.4 8 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </NavLink>
      </div>
    </header>
  );
};

export default Navbar;
