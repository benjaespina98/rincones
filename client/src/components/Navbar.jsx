import { NavLink } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const links = [
  { to: "/", label: "Inicio" },
  { to: "/explorar", label: "Explorar" },
];

const Navbar = () => {
  const { isAdmin } = useAuth();

  const allLinks = isAdmin ? [...links, { to: "/agregar", label: "Agregar lugar" }] : links;

  return (
    <header className="navbar">
      <div className="navbar__brand">Rincones</div>
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
