import { Fragment } from "react";
import { WINE_TYPE_LABELS } from "../data/wineReference";

/**
 * La identidad de un vino en una línea: tipo, uva, cosecha, región.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * El mismo dato se dibujaba de dos maneras distintas según la pantalla. En Mi
 * Bodega el tipo era un punto de color y la uva texto corrido; en Descubrí,
 * Guardados y el Sommelier eran pastillas con borde y fondo, una por dato —
 * hasta cuatro cápsulas por tarjeta ("Tinto" "Malbec" "2019" "📍Mendoza"),
 * seis tarjetas por pantalla, treinta pastillas a la vista. Dos vocabularios
 * para lo mismo obligan a aprender la app dos veces y son la marca más clara
 * de una interfaz armada por acumulación.
 *
 * Acá hay UNO solo, y vive en un componente y no en una clase suelta para que
 * la próxima pantalla no tenga que volver a decidir cómo se escribe un vino.
 *
 * ── POR QUÉ NO SON PASTILLAS ────────────────────────────────────────────────
 * Una cápsula es la forma de algo que se toca (un filtro, un toggle). Estos
 * cuatro datos no se tocan: se leen. Dicen lo mismo con color y tipografía, y
 * de paso el tipo se reconoce ANTES de leer la palabra, por el punto.
 */
export default function WineMeta({
  type,
  varietal,
  vintage,
  region,
  className = "",
}) {
  const tipo = type && type !== "unknown" ? WINE_TYPE_LABELS[type] : "";
  const resto = [varietal, vintage, region].filter(Boolean);

  if (!tipo && resto.length === 0) return null;

  return (
    <span className={`wine-meta ${className}`}>
      {tipo && (
        <span className={`wine-meta__type wine-meta__type--${type}`}>{tipo}</span>
      )}
      {resto.map((valor, i) => (
        <Fragment key={`${valor}-${i}`}>
          {/* El separador es decorativo: un lector de pantalla que lea
              "Tinto punto medio Malbec" no gana nada. */}
          {(tipo || i > 0) && (
            <span className="wine-meta__sep" aria-hidden="true">
              ·
            </span>
          )}
          <span className="wine-meta__item">{valor}</span>
        </Fragment>
      ))}
    </span>
  );
}
