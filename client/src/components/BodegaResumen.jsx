import { useMemo } from "react";
import { distribucionPorUva } from "../utils/distribucionPorUva";
import { resumenDeBodega, frasesDelResumen } from "../utils/bodegaResumen";
import "./BodegaResumen.css";

/**
 * Una línea sobre lo que se está viendo en Mi Bodega: "9 botellas en 5 vinos · 3 uvas".
 *
 * ── POR QUÉ ES UNA LÍNEA Y NO UNA TARJETA ───────────────────────────────────
 * Era una tarjeta con números de 24px (3 botellas, 1 probados, 2 uvas, la región más
 * tomada) que ocupaba media pantalla ANTES del primer vino. Y las pestañas de arriba
 * ya dicen cuántos hay en cada vista. En Mi Bodega el protagonista son las botellas,
 * no el tablero: lo que sobra de números tiene que ser un dato sutil, no un bloque.
 *
 * ── POR QUÉ DESCRIBE LO FILTRADO Y NO LA COLECCIÓN ENTERA ───────────────────
 * Porque si no, miente en el único momento en que alguien la mira: con un filtro de Malbec
 * puesto, "62 vinos" hablaría de otra cosa que la lista de abajo. Los números salen de los
 * mismos vinos que se están dibujando.
 *
 * ── LO QUE NO SE PUEDE CONTESTAR NO SE MUESTRA ──────────────────────────────
 * Sin uvas cargadas no se dice "0 uvas": un hueco es más honesto que un cero inventado.
 *
 * Con botellas dice cuántas (y en cuántos vinos, si no es una por vino); sin ninguna
 * —la vista de los ya tomados— dice cuántos vinos son. Nunca las dos cosas: serían dos
 * números para la misma pregunta.
 */
export default function BodegaResumen({ wines = [], vista = "instock", className = "" }) {
  const resumen = useMemo(() => resumenDeBodega(wines), [wines]);
  const partes = useMemo(() => frasesDelResumen(resumen, vista), [resumen, vista]);

  // Sin nada que contar no se dibuja nada: el estado vacío de la pantalla ya dice lo que
  // hay que decir, y dos vacíos seguidos es uno de más.
  if (partes.length === 0) return null;

  // Un segmento por uva (coloreado por su tipo), del tamaño de las botellas en «En stock» y de los vinos en el resto.
  // Sólo en «En stock»: ahí sirve para elegir qué abrir. En «Ya tomados» el desglose por uva está en el perfil.
  const tipos = vista === "instock" ? distribucionPorUva(wines, { porBotellas: true }) : [];

  return (
    <div className="bres-wrap">
      <p className={`bres ${className}`.trim()} aria-label="Resumen de lo que estás viendo">
        {partes.join(" · ")}
      </p>
      {tipos.length > 1 && (
        <>
          <div className="bres__barra" aria-hidden="true">
            {tipos.map((g) => (
              <span key={g.uva} className="bres__seg" data-wine-type={g.tipo} style={{ flexGrow: g.n }} />
            ))}
          </div>
          {/* La barra sola no dice qué es cada color: la leyenda nombra cada uva con su cantidad. */}
          <ul className="bres__leyenda" aria-label="Por uva">
            {tipos.map((g) => (
              <li key={g.uva} className="bres__item" data-wine-type={g.tipo}>
                <span className="bres__punto" aria-hidden="true" />
                {g.uva} {g.n}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
