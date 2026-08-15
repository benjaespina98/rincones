/**
 * "Mostrame otra": elegir la SIGUIENTE botella, no una al azar.
 *
 * ── QUÉ ESTABA MAL ──────────────────────────────────────────────────────────
 * El botón sorteaba un índice del set. Con recomendaciones que se parecen entre
 * sí —y se parecen, porque salen de tus gustos— sortear devuelve casi siempre
 * otro Malbec de Mendoza. El botón prometía salir de la rutina y entregaba la
 * rutina otra vez, así que se leía como lo que era: un random con nombre bonito.
 *
 * ── QUÉ HACE AHORA ──────────────────────────────────────────────────────────
 * Busca lo más distinto que haya en el set, con un orden de preferencia que es
 * el mismo que usaría cualquiera al recomendar algo diferente:
 *
 *   1. otra uva Y otro tipo   → el salto más grande que permite el set
 *   2. otra uva               → un Cabernet después de un Malbec
 *   3. otro tipo              → un blanco después de un tinto
 *   4. cualquier otro         → el set no daba para más, pero nunca se repite
 *
 * Dentro del mejor nivel que exista se elige al azar: si hay cinco candidatos
 * igual de distintos, tocar dos veces no tiene por qué dar lo mismo. El azar
 * decide entre iguales; nunca decide qué es "distinto".
 *
 * Nunca devuelve el índice actual: repetir la misma tarjeta es la única
 * respuesta que hace sentir que el botón no funciona.
 */

const norm = (valor) => String(valor || "").trim().toLowerCase();

/**
 * Devuelve el índice de la próxima recomendación, o `null` si no hay ninguna
 * otra para mostrar (set vacío o de una sola botella). `null` y no el índice
 * actual: quien llama tiene que poder distinguir "no hay nada más" de "acá está
 * la otra", y esconder el botón en vez de ofrecer algo que no va a pasar.
 */
export const elegirOtroDistinto = (wines, actualIdx, azar = Math.random) => {
  const lista = Array.isArray(wines) ? wines : [];
  if (lista.length < 2) return null;

  const actual = lista[actualIdx];
  // Sin vino actual (índice fuera de rango) cualquiera sirve y es mejor que nada.
  if (!actual) return Math.floor(azar() * lista.length);

  const uvaActual = norm(actual.varietal);
  const tipoActual = norm(actual.type);

  // Un tipo o una uva que no sabemos no puede contar como "distinta": diría que
  // hay un salto donde lo único que hay es un dato que falta.
  const niveles = [[], [], [], []];

  lista.forEach((wine, i) => {
    if (i === actualIdx) return;

    const otraUva = Boolean(uvaActual) && Boolean(norm(wine.varietal)) && norm(wine.varietal) !== uvaActual;
    const otroTipo =
      Boolean(tipoActual) &&
      tipoActual !== "unknown" &&
      Boolean(norm(wine.type)) &&
      norm(wine.type) !== "unknown" &&
      norm(wine.type) !== tipoActual;

    if (otraUva && otroTipo) niveles[0].push(i);
    else if (otraUva) niveles[1].push(i);
    else if (otroTipo) niveles[2].push(i);
    else niveles[3].push(i);
  });

  const mejor = niveles.find((nivel) => nivel.length > 0);
  if (!mejor) return null;

  return mejor[Math.floor(azar() * mejor.length)];
};

/**
 * Por qué esta botella es la que sigue: la frase que acompaña al salto.
 *
 * Reemplaza a "Al azar" / "Salgamos un rato de la rutina", que era un texto fijo
 * y —peor— renunciaba a explicar nada. Una recomendación sin razón no es una
 * recomendación, y menos justo en el momento en que la persona pidió que le
 * mostráramos algo distinto.
 *
 * Dice la verdad y sólo la verdad: nombra el salto que de verdad hubo. Si el set
 * no daba para saltar, no inventa uno.
 */
export const razonDelSalto = (anterior, siguiente) => {
  if (!anterior || !siguiente) return null;

  const uvaAnterior = norm(anterior.varietal);
  const uvaSiguiente = norm(siguiente.varietal);
  const tipoAnterior = norm(anterior.type);
  const tipoSiguiente = norm(siguiente.type);

  const otraUva = uvaAnterior && uvaSiguiente && uvaAnterior !== uvaSiguiente;
  const otroTipo =
    tipoAnterior &&
    tipoSiguiente &&
    tipoAnterior !== "unknown" &&
    tipoSiguiente !== "unknown" &&
    tipoAnterior !== tipoSiguiente;

  if (otraUva && otroTipo) return `Otro palo: ${siguiente.varietal} en vez de ${anterior.varietal}`;
  if (otraUva) return `Si te gustó el ${anterior.varietal}, probá qué hace un ${siguiente.varietal}`;
  if (otroTipo) return "Un cambio de color, para salir de lo de siempre";

  // Mismo tipo y misma uva: el salto fue de bodega o de región, y decir otra
  // cosa sería mentir. Si tampoco cambió la región, no se afirma nada.
  if (siguiente.region && norm(siguiente.region) !== norm(anterior.region)) {
    return `La misma uva, pero de ${siguiente.region}`;
  }
  return null;
};
