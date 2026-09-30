import { ICON_PATHS, ICON_PATHS_FILLED } from "./iconPaths";

/**
 * El ícono de la app.
 *
 * ── QUÉ CAMBIÓ Y POR QUÉ ────────────────────────────────────────────────────
 * Acá vivían 52 SVG dibujados a mano, en una grilla de 24 y trazados con
 * `stroke-width: 2`. Funcionaban, pero eran dibujos caseros: cada uno con su
 * criterio de curvatura, de peso óptico y de encaje en la caja, y eso se nota
 * cuando hay veinte juntos en una pantalla — sobre todo al lado de los íconos
 * del sistema en un teléfono.
 *
 * Ahora la geometría es la de **Phosphor Icons** (MIT), que es la familia que
 * más se acerca a los SF Symbols de iOS: misma lógica de peso óptico, mismas
 * terminaciones redondeadas, mismo encaje en la caja.
 *
 * ── POR QUÉ NO SON SF SYMBOLS ───────────────────────────────────────────────
 * Eran la primera opción pedida. No se puede: `sf-symbols-react` no existe
 * (npm devuelve 404), y la licencia de SF Symbols permite usarlos para diseñar
 * apps de plataformas Apple pero prohíbe copiarlos y redistribuirlos — que es
 * exactamente lo que sería meterlos en un bundle web servido a cualquier
 * navegador.
 *
 * ── POR QUÉ NO SE IMPORTA EL PAQUETE DE PHOSPHOR ────────────────────────────
 * Porque cada ícono suyo trae los seis pesos y no hay entrada por peso: los 52
 * que usamos cuestan **35,2 kB gzip**, contra los 23,4 kB que quedaban libres
 * en el presupuesto de carga inicial. Sacando sólo los pesos que se usan son
 * **7,4 kB**. Todo medido, no estimado. El detalle está en
 * `scripts/generar-iconos.cjs`.
 *
 * ── LOS NOMBRES SE QUEDAN ───────────────────────────────────────────────────
 * `name="chevron-right"` sigue siendo `chevron-right` aunque en Phosphor se
 * llame `CaretRight`. Son 251 usos en 59 archivos: renombrarlos sería un diff
 * de miles de líneas que no mejora nada. La traducción vive en un solo lugar,
 * el mapa del generador.
 *
 * ── RELLENO ─────────────────────────────────────────────────────────────────
 * `filled` cambia el peso del ícono, no lo pinta con otra regla: Phosphor trae
 * una versión sólida dibujada aparte. Lo usan el corazón de favorito, la
 * estrella del puntaje, el destello de "recomendado" y las tres pestañas de la
 * barra inferior cuando están activas — que es lo que hace iOS y una de las
 * cosas que más hacen que una tab bar se sienta nativa.
 */
export default function Icon({ name, filled = false, size = 20, className = "", ...rest }) {
  const paths = (filled && ICON_PATHS_FILLED[name]) || ICON_PATHS[name];
  if (!paths) return null;

  return (
    <svg
      className={`icon ${className}`.trim()}
      width={size}
      height={size}
      /* La grilla de Phosphor es de 256, no de 24. Va en el viewBox y no en un
         `transform`: el navegador escala el vector sin perder nitidez y el
         tamaño en pantalla lo sigue mandando `size`. */
      viewBox="0 0 256 256"
      /* Rellenos, no trazados. Es la diferencia de fondo con el set anterior y
         con Lucide: en Phosphor —igual que en los SF Symbols, que son glifos de
         una tipografía— el grosor es parte de la forma, no un `stroke-width`
         que se cambia en runtime. Por eso el peso se elige al generar. */
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
