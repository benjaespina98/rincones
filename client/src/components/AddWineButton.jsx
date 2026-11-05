import { useLocation, useNavigate } from "react-router-dom";
import Icon from "./Icon";
import { tapHaptic } from "../utils/haptics";
import { ADD_PATH } from "../data/navigation";
import "./AddWineButton.css";

/**
 * ── ESCANEAR: UN LUGAR DE LA BARRA, CON NOMBRE ─────────────────────────────
 *
 * Era un botón flotante con sólo una cámara. Una cámara sola no dice si saca una foto, si
 * escanea una etiqueta o si busca un vino; y al flotar sobre el contenido tapaba texto y botones
 * (la mitad de "Eliminar" en el modo selección, lo último de cada ficha). Ahora es un lugar más
 * de la barra, entre Sommelier y Mi Bodega, con su palabra debajo: "Escanear". El ícono lleva
 * el relleno de acento para que se lea como la acción principal sin salirse de la fila.
 *
 * Toca y la cámara se abre: si tenés la botella en la mano querés la cámara, no un menú.
 * Importar una foto que ya tenías está adentro del escáner, al lado del disparador.
 */
export default function AddWineButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const enEscaner = location.pathname === ADD_PATH;

  return (
    <button
      type="button"
      className={`add-fab ${enEscaner ? "active" : ""}`}
      aria-current={enEscaner ? "page" : undefined}
      onClick={() => {
        tapHaptic();
        // `modo: "camara"` salta la pantalla de las dos puertas y abre el escáner directo. Viaja
        // por el estado de la navegación y no por la URL: es cómo se entró esta vez, no un lugar
        // al que volver. `replace` estando ya en la carga: si no, cada toque apila una entrada.
        navigate(ADD_PATH, {
          state: { modo: "camara", intento: Date.now() },
          replace: enEscaner,
        });
      }}
      title="Escanear la etiqueta de un vino para agregarlo o ver su información"
    >
      <span className="add-fab__icono" aria-hidden="true">
        <Icon name="scan" size={18} />
      </span>
      <span className="add-fab__texto">Escanear</span>
    </button>
  );
}
