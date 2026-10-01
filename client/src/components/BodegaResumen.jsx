import { useMemo } from "react";
import { resumenDeBodega } from "../utils/bodegaResumen";
import "./BodegaResumen.css";

/**
 * La cabecera de Mi Bodega: cinco números sobre lo que se está viendo.
 *
 * ── POR QUÉ DESCRIBE LO FILTRADO Y NO LA COLECCIÓN ENTERA ───────────────────
 * Porque si no, miente en el único momento en que alguien la mira. Con la
 * pestaña "Probados" abierta y un filtro de Malbec puesto, una cabecera que
 * diga "62 vinos" está hablando de otra cosa que la lista de abajo. Los números
 * salen de los mismos vinos que se están dibujando.
 *
 * ── LO QUE NO SE PUEDE CONTESTAR NO SE MUESTRA ──────────────────────────────
 * Sin ningún vino puntuado no hay promedio, y un "0,0" se lee como "mis vinos
 * son malos" en vez de "todavía no puntuaste". `resumenDeBodega` devuelve null
 * y acá la métrica desaparece: un hueco es más honesto que un cero inventado.
 *
 * ── POR QUÉ ES UNA SOLA TARJETA ─────────────────────────────────────────────
 * Son pocos datos de una línea cada uno. Cada uno en su tarjeta ocuparía media
 * pantalla arriba de la lista —y la lista es a lo que se vino—; sueltos, sin
 * superficie, se leían como un renglón perdido al lado de las tarjetas de
 * abajo (así estuvo: una tira con márgenes negativos y un filtro de lado a
 * lado). Los números van en columnas iguales dentro de UNA tarjeta, con los
 * mismos valores de superficie que las filas de vino; la región, que es texto
 * y no cabe en una columna de 67px, va abajo en su propio renglón.
 */

/** Sólo se muestran las que tienen algo que decir. */
const construirMetricas = (r) => {
  const metricas = [];

  if (r.botellas > 0) {
    metricas.push({
      id: "botellas",
      valor: r.botellas,
      // Botellas y vinos son dos cosas distintas, y los textos de la app las
      // venían mezclando ("te queda una botella" con un vino de seis).
      etiqueta: r.botellas === 1 ? "botella" : "botellas",
      detalle: r.vinosConStock > 0 ? `en ${r.vinosConStock} vinos` : null,
    });
  }

  if (r.probados > 0) {
    metricas.push({ id: "probados", valor: r.probados, etiqueta: "probados" });
  }

  if (r.uvasDistintas > 0) {
    metricas.push({
      id: "uvas",
      valor: r.uvasDistintas,
      etiqueta: r.uvasDistintas === 1 ? "uva" : "uvas",
    });
  }

  if (r.promedio !== null) {
    metricas.push({
      id: "promedio",
      // Con coma, que es como se escribe un decimal en castellano.
      valor: String(r.promedio).replace(".", ","),
      etiqueta: "promedio",
      detalle: `de ${r.puntuados}`,
    });
  }

  if (r.regionFrecuente) {
    metricas.push({
      id: "region",
      // La región es texto, no número: se muestra más chica para que no compita
      // con los números de al lado.
      valor: r.regionFrecuente,
      etiqueta: "más tomada",
      texto: true,
    });
  }

  return metricas;
};

export default function BodegaResumen({ wines = [], className = "" }) {
  const resumen = useMemo(() => resumenDeBodega(wines), [wines]);
  const metricas = useMemo(() => construirMetricas(resumen), [resumen]);

  // Sin nada que contar no se dibuja un marco vacío: el estado vacío de la
  // pantalla ya dice lo que hay que decir, y dos vacíos seguidos es uno de más.
  if (metricas.length === 0) return null;

  const numeros = metricas.filter((m) => !m.texto);
  const region = metricas.find((m) => m.texto);

  return (
    <div
      className={`bres ${className}`.trim()}
      role="group"
      aria-label="Resumen de lo que estás viendo"
    >
      {numeros.length > 0 && (
        <div className="bres__fila">
          {numeros.map((m) => (
            <div key={m.id} className="bres__item">
              <span className="bres__valor">{m.valor}</span>
              <span className="bres__etiqueta">{m.etiqueta}</span>
              {m.detalle && <span className="bres__detalle">{m.detalle}</span>}
            </div>
          ))}
        </div>
      )}
      {region && (
        <p className="bres__pie">
          <span className="bres__pie-etiqueta">{region.etiqueta}</span>
          {/* El dato viene como "Salta | Argentina": la barra es del formato de
              origen, no de la lectura. */}
          <span className="bres__pie-valor">{region.valor.replace(/\s*\|\s*/g, ", ")}</span>
        </p>
      )}
    </div>
  );
}
