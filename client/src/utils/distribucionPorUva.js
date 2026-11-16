/**
 * La barra de colores de Mi Bodega, por UVA y no sólo por tipo: «Malbec 5 · Merlot 3 · Chardonnay 2».
 *
 * Cada uva se pinta con el color de su tipo (tinto, blanco…), así que dos tintos distintos comparten color pero la leyenda
 * los nombra. Se muestran las cinco más grandes y el resto se junta en «Otras» (sin color de tipo): más de cinco etiquetas
 * no entran en un renglón de teléfono. En «En stock» el tamaño es de botellas; en el resto, de vinos.
 */
export const distribucionPorUva = (wines = [], { porBotellas = true, maximo = 5 } = {}) => {
  const grupos = new Map();
  let sinUva = 0;
  for (const w of wines) {
    const peso = porBotellas && Number(w.quantity) > 0 ? Number(w.quantity) : 1;
    const uva = String(w.varietal || "").trim();
    if (!uva) {
      sinUva += peso;
      continue;
    }
    const g = grupos.get(uva) || { uva, n: 0, tipos: new Map() };
    g.n += peso;
    const tipo = w.type || "unknown";
    g.tipos.set(tipo, (g.tipos.get(tipo) || 0) + peso);
    grupos.set(uva, g);
  }
  const lista = [...grupos.values()]
    .map((g) => ({ uva: g.uva, n: g.n, tipo: [...g.tipos.entries()].sort((x, y) => y[1] - x[1])[0][0] }))
    .sort((x, y) => y.n - x.n || x.uva.localeCompare(y.uva, "es"));
  const visibles = lista.slice(0, maximo);
  const resto = lista.slice(maximo).reduce((acc, g) => acc + g.n, 0) + sinUva;
  if (resto > 0) visibles.push({ uva: "Otras", n: resto, tipo: "unknown", otras: true });
  return visibles;
};

/**
 * Las filas del reparto del perfil: `countsByVarietal` del server ({ varietal, type, count }) agrupado por uva, con las
 * cinco más grandes y el resto en «Otras». Cada fila lleva el tipo más frecuente de su uva para colorearla.
 */
export const filasDeUvas = (counts, maximo = 5) => {
  const porUva = new Map();
  for (const r of Array.isArray(counts) ? counts : []) {
    const uva = String(r?.varietal || "").trim();
    const n = Number(r?.count) || 0;
    if (!uva || n <= 0) continue;
    const g = porUva.get(uva) || { uva, count: 0, tipos: new Map() };
    g.count += n;
    g.tipos.set(r.type || "unknown", (g.tipos.get(r.type || "unknown") || 0) + n);
    porUva.set(uva, g);
  }
  const lista = [...porUva.values()]
    .map((g) => ({ key: g.uva, label: g.uva, count: g.count, type: [...g.tipos.entries()].sort((a, b) => b[1] - a[1])[0][0] }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"));
  const visibles = lista.slice(0, maximo);
  const resto = lista.slice(maximo).reduce((acc, g) => acc + g.count, 0);
  if (resto > 0) visibles.push({ key: "otras", label: "Otras", count: resto, type: "unknown" });
  return visibles;
};
