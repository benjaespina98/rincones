import { useLocation, useNavigate } from "react-router-dom";
import Icon from "./Icon";
import "./LegalPage.css";

/**
 * El marco de las páginas legales.
 *
 * ── POR QUÉ SE LEEN DISTINTO AL RESTO DE LA APP ─────────────────────────────
 * Todo lo demás está pensado para mirarse de un vistazo: tarjetas, números
 * grandes, listas que se recorren con el pulgar. Esto es lo contrario — texto
 * corrido que alguien lee cuando quiere entender algo puntual, casi siempre
 * enojado o preocupado.
 *
 * Así que acá manda la legibilidad: una columna angosta, interlineado alto, y
 * los títulos lo bastante marcados como para saltar de uno a otro buscando el
 * párrafo que importa. Es la única parte de la app donde el texto largo es el
 * contenido y no un accesorio.
 *
 * ── SIN LA BARRA DE ABAJO ───────────────────────────────────────────────────
 * Estas páginas se alcanzan desde el perfil, desde el pie del login y desde un
 * enlace que alguien puede mandar por mensaje — o sea, también sin sesión. Por
 * eso tienen su propia salida arriba y no dependen de la navegación de la app:
 * sin cuenta, esa barra no existe.
 */
export default function LegalPage({ title, actualizado, children }) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="legal">
      <header className="legal__barra">
        <button
          type="button"
          className="legal__volver"
          onClick={() => (location.key !== "default" ? navigate(-1) : navigate("/", { replace: true }))}
          aria-label="Volver"
        >
          <Icon name="chevron-left" size={20} />
        </button>
        <h1 className="legal__titulo">{title}</h1>
      </header>

      <article className="legal__cuerpo">
        {/* La fecha arriba y no al pie: lo primero que quiere saber alguien que
            abre una política es si está mirando la versión vigente. */}
        {actualizado && <p className="legal__fecha">Última actualización: {actualizado}</p>}
        {children}
      </article>
    </div>
  );
}
