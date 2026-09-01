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

/* Acá vivía también `razonDelSalto`, que narraba el cambio de botella:
   "Dejás la fruta negra madura y te encontrás con el grafito y las hierbas",
   con tres redacciones por caso elegidas con una semilla. Se fue entero.
   La etiqueta corta de `whyThisWine` (utils/momentCopy.js) ya dice lo único
   accionable —por qué te toca ESTE vino— y los datos del salto (uva, tipo,
   región) están en las pastillas de la propia tarjeta. Contarlos además en
   prosa era decir dos veces lo mismo, la segunda con voz de sommelier. */

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

  /**
   * Con foto primero, adentro del nivel de "qué tan distinto es".
   *
   * Mismo criterio que ya usa el server para armar el set y para la búsqueda
   * (ver el comentario "Con foto primero" en catalog.controller.js): la
   * tarjeta grande de Descubrí es casi toda imagen, y sin este desempate "Ver
   * otro" podía saltar de una botella con foto a una con el placeholder
   * genérico aunque hubiera, en el MISMO nivel de distinción, otra con foto
   * de sobra. Es un orden y no un filtro: si nadie en el nivel tiene foto, se
   * elige igual entre los que hay.
   */
  const conFoto = mejor.filter((i) => Boolean(lista[i]?.image));
  const candidatos = conFoto.length > 0 ? conFoto : mejor;

  return candidatos[Math.floor(azar() * candidatos.length)];
};
