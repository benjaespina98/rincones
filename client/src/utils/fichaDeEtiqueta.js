/**
 * Lo que la etiqueta cuenta de la elaboración, en un texto corto para las notas del vino.
 *
 * Corte con proporciones, crianza/barrica y graduación no son identidad del vino (no entran en su clave), pero son
 * lo que más se busca en una contraetiqueta y antes se perdía al escanear. Va a las notas, que son editables.
 */
export function textoDeEtiqueta({ composition, aging, alcohol } = {}) {
  const partes = [];
  const corte = String(composition || "").trim();
  const crianza = String(aging || "").trim();
  const grados = Number(alcohol);
  if (corte) partes.push(`Corte: ${corte}`);
  if (crianza) partes.push(`Crianza: ${crianza}`);
  if (Number.isFinite(grados) && grados >= 5 && grados <= 20) {
    partes.push(`${String(grados).replace(".", ",")}% alc.`);
  }
  return partes.length ? `De la etiqueta: ${partes.join(" · ")}` : "";
}
