import { NavLink } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const links = [
  { to: "/", label: "Descubrir" },
  { to: "/comunidad", label: "Comunidad" },
];

const Navbar = () => {
  const { isAdmin } = useAuth();

  const allLinks = isAdmin ? [...links, { to: "/agregar", label: "Agregar lugar" }] : links;

  return (
    <header className="navbar">
      <div className="navbar__brand" aria-label="Rincones">
        <span className="navbar__brand-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 21C12 21 18 14.8 18 10.2C18 6.78 15.31 4 12 4C8.69 4 6 6.78 6 10.2C6 14.8 12 21 12 21Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="12" cy="10" r="2.2" fill="currentColor"/>
          </svg>
        </span>
        <span>Rincones</span>
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
    </header>
  );
};

export default Navbar;
