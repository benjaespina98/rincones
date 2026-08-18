import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import MyRatings from "../components/MyRatings";
import "../styles/pages/RatingsPage.css";

/**
 * Tus valoraciones, en su propia pantalla.
 *
 * Vivían abiertas adentro del perfil, que ya tenía seis secciones y crecía sin
 * techo. Acá la lista tiene la pantalla entera y el perfil recupera su tamaño:
 * el mismo reparto que hacen las apps donde esto ya está resuelto —una fila en
 * el perfil, la lista aparte—.
 *
 * No repite el promedio ni el conteo: los dice el perfil, en la fila desde la
 * que se llega. Acá se viene a LEER lo que escribiste, no a medirlo.
 */
export default function RatingsPage() {
  const navigate = useNavigate();

  return (
    <div className="ratings-page">
      <button type="button" className="ratings-page__back" onClick={() => navigate("/perfil")}>
        <Icon name="arrow-left" size={16} /> Perfil
      </button>

      <header className="ratings-page__head">
        <h1>Tus valoraciones</h1>
        {/* El par del "Sólo vos" del diario. Las dos listas viven en el mismo
            perfil y hace falta decir cuál es cuál: ésta la ve cualquiera que
            busque ese vino. */}
        <p>
          <Icon name="eye" size={13} /> Son públicas: quien busque ese vino las ve con
          tu nombre.
        </p>
      </header>

      <MyRatings />
    </div>
  );
}
