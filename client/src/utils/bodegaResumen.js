/**
 * Las métricas de la cabecera de Mi Bodega.
 *
 * ── POR QUÉ SE CALCULAN Y NO SE PIDEN ───────────────────────────────────────
 * El servidor ya tiene `/wines/stats/summary` y `/users/:id/wine-stats`, pero
 * la cabecera no puede usarlos: tiene que describir LO QUE SE ESTÁ VIENDO, que
 * cambia con la pestaña y con los filtros. Un número traído del servidor diría
 * "23 probados" mientras la lista de abajo muestra tres — y el usuario tendría
 * razón en no creerle a ninguno de los dos.
 *
 * Son cuentas sobre un array que ya está en memoria: no hay ahorro posible en
 * pedirlas, y sí una forma segura de que se contradigan.
 *
 * ── CADA MÉTRICA CONTESTA UNA PREGUNTA ──────────────────────────────────────
 * No son los números que había a mano, son los que alguien se pregunta mirando
 * su colección: cuánto tengo, cuánto probé, qué tomo, de dónde, y qué tan
 * bueno me parece. Lo que no se puede contestar honestamente devuelve null y la
 * cabecera no lo muestra — un cero inventado es peor que un hueco.
 */

/** De 4 para arriba es "esto me gustó de verdad", igual que en el ranking. */
const PUNTUACION_ALTA = 4;

const norm = (v) => String(v || "").trim();

/** El valor que más se repite, y cuántas veces. `null` si no hay ninguno. */
const masFrecuente = (valores) => {
  const cuenta = new Map();
  for (const v of valores) {
    const k = norm(v);
    if (!k) continue;
    cuenta.set(k, (cuenta.get(k) || 0) + 1);
  }
  if (cuenta.size === 0) return null;
  let mejor = null;
  for (const [valor, veces] of cuenta) {
    // Empate: gana el primero. Alfabetizar sería inventar un criterio que nadie
    // pidió, y con dos regiones a la par cualquiera de las dos es una respuesta
    // honesta a "de dónde tomás".
    if (!mejor || veces > mejor.veces) mejor = { valor, veces };
  }
  return mejor;
};

/**
 * @param {Array} wines los vinos YA filtrados: la cabecera describe lo que se ve.
 */
export const resumenDeBodega = (wines = []) => {
  const total = wines.length;

  let botellas = 0;
  let vinosConStock = 0;
  let probados = 0;
  let sumaPuntajes = 0;
  let puntuados = 0;
  let destacados = 0;

  for (const w of wines) {
    const cantidad = Number(w.quantity) || 0;
    botellas += cantidad;
    if (cantidad > 0) vinosConStock += 1;
    // Por el campo `tasted` y no por `status`, que está deprecado: al terminar
    // la última botella el status pasa a "archived", así que contar por ahí
    // dejaba de contar como probado justo el vino que más se probó.
    if (w.tasted) probados += 1;
    const puntaje = Number(w.rating) || 0;
    if (puntaje > 0) {
      sumaPuntajes += puntaje;
      puntuados += 1;
      if (puntaje >= PUNTUACION_ALTA) destacados += 1;
    }
  }

  const uvas = new Set(wines.map((w) => norm(w.varietal)).filter(Boolean));
  const region = masFrecuente(wines.map((w) => w.region));

  return {
    total,
    botellas,
    vinosConStock,
    probados,
    uvasDistintas: uvas.size,
    destacados,
    regionFrecuente: region ? region.valor : null,
    regionFrecuenteVeces: region ? region.veces : 0,
    /**
     * El promedio sale SOLO de los puntuados.
     *
     * Promediando todos, cada vino sin puntuar entraba como un cero: con 62
     * vinos y 20 puntuados el promedio daba 1.0, un número que no describe a
     * nadie. Es el mismo error que ya se había corregido en la agregación del
     * servidor, y se repite acá porque son dos cuentas distintas sobre los
     * mismos datos.
     */
    promedio: puntuados > 0 ? Math.round((sumaPuntajes / puntuados) * 10) / 10 : null,
    puntuados,
  };
};
