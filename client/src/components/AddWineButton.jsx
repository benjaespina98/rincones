import { useLocation, useNavigate } from "react-router-dom";
import Icon from "./Icon";
import { tapHaptic } from "../utils/haptics";
import { ADD_PATH, SIN_BOTON_ESCANEAR } from "../data/navigation";
import "../styles/components/AddWineButton.css";

/**
 * ── ESCANEAR: SOBRE LA BARRA, PERO NO UNA PESTAÑA ───────────────────────────
 *
 * Cargar una botella es lo que hace que Rincones sea Rincones: sin eso no hay
 * bodega, no hay recomendaciones y no hay diario. Vivía como una pestaña más
 * —un círculo violeta apretado entre "Guardados" y "Sommelier"—, y ahí le
 * pasaban dos cosas malas a la vez: competía por ancho con secciones que se
 * visitan mucho menos, y se leía como un lugar al que se va en vez de como una
 * cosa que se hace.
 *
 * Ahora está centrado y apoyado sobre el borde de arriba de la barra. Fuera de
 * la fila, porque adentro no puede quedar centrado: con tres pestañas más un
 * cuarto lugar para el botón, la fila se reparte en cuatro partes iguales y el
 * botón cae en el 63% del ancho — medido, sesenta píxeles a la derecha del
 * centro, encima de "Mi Bodega".
 *
 * No lleva etiqueta debajo como las pestañas —no es un lugar— y no se enciende
 * cuando estás "adentro", porque no hay un adentro.
 *
 * ── POR QUÉ NO PREGUNTA NADA ANTES ──────────────────────────────────────────
 * Toca y la cámara se abre. Tuvo una hoja intermedia con "Escanear foto" e
 * "Importar foto", y era un paso de más para casi todas las veces: si tenés la
 * botella en la mano, querés la cámara, no un menú. Importar una foto que ya
 * tenías sigue estando a un toque, pero adentro del escáner —el ícono de
 * galería al lado del disparador—, que es donde importa poder cambiar de idea
 * sin volver atrás.
 */
export default function AddWineButton() {
  const navigate = useNavigate();
  const location = useLocation();

  if (SIN_BOTON_ESCANEAR.has(location.pathname)) return null;

  return (
    <button
      type="button"
      className="add-fab"
      onClick={() => {
        tapHaptic();
        // `modo: "camara"` salta la pantalla de las dos puertas y abre el
        // escáner directo. Viaja por el estado de la navegación y no por la
        // URL: es cómo se entró esta vez, no un lugar al que volver.
        //
        // `replace` estando ya en la carga: si no, cada toque apila una entrada
        // más en el historial y salir de ahí con el botón de atrás obliga a
        // tocarlo tantas veces como se haya reabierto la cámara.
        navigate(ADD_PATH, {
          state: { modo: "camara", intento: Date.now() },
          replace: location.pathname === ADD_PATH,
        });
      }}
      aria-label="Escanear la etiqueta de un vino"
      title="Escanear una etiqueta"
    >
      <Icon name="camera" size={23} />
    </button>
  );
}
