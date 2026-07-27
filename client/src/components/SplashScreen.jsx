import Logo from "./Logo";
import "./SplashScreen.css";

/**
 * Pantalla de apertura mientras se resuelve la sesión.
 *
 * Reemplaza al "Cargando sesión…" en texto plano: es lo primero que ve el
 * usuario cada vez que abre la app, así que vale que sea la marca y no un
 * mensaje de sistema. La copa se llena de vino mientras carga — la animación
 * comunica progreso sin fingir un porcentaje que no conocemos.
 */
export default function SplashScreen({ label = "Cargando tu bodega" }) {
  return (
    <div className="splash" role="status" aria-live="polite">
      <div className="splash__mark">
        <Logo size={92} animated />
      </div>
      <p className="splash__word">Rincones</p>
      <p className="splash__label">{label}</p>
      <span className="sr-only">{label}…</span>
    </div>
  );
}
