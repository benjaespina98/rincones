import { useMemo } from "react";
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
export default function BodegaResumen({ wines = [], className = "" }) {
  const resumen = useMemo(() => resumenDeBodega(wines), [wines]);
  const partes = useMemo(() => frasesDelResumen(resumen), [resumen]);

  // Sin nada que contar no se dibuja nada: el estado vacío de la pantalla ya dice lo que
  // hay que decir, y dos vacíos seguidos es uno de más.
  if (partes.length === 0) return null;

  // Un segmento por tipo, del tamaño de las botellas que hay (o de los vinos, si no queda ninguna).
  const porTipo = new Map();
  for (const w of wines) {
    const peso = Number(w.quantity) > 0 ? Number(w.quantity) : 1;
    porTipo.set(w.type || "unknown", (porTipo.get(w.type || "unknown") || 0) + peso);
  }
  const tipos = [...porTipo.entries()].sort((x, y) => y[1] - x[1]);

  return (
    <div className="bres-wrap">
      <p className={`bres ${className}`.trim()} aria-label="Resumen de lo que estás viendo">
        {partes.join(" · ")}
      </p>
      {tipos.length > 1 && (
        <div className="bres__barra" aria-hidden="true">
          {tipos.map(([tipo, n]) => (
            <span key={tipo} className="bres__seg" data-wine-type={tipo} style={{ flexGrow: n }} />
          ))}
        </div>
      )}
    </div>
  );
}
