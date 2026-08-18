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

import { grapeTrait } from "../data/wineConcepts";

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
 * ── POR QUÉ SE REESCRIBIÓ ───────────────────────────────────────────────────
 * Decía "Otro palo: Torrontés en vez de Malbec", y de tanto salir así se leía
 * como una plantilla: dos nombres de uva metidos en un molde. El problema no era
 * el molde, era que la frase hablaba de ETIQUETAS y no de vino. Nadie cambia de
 * botella porque cambie el nombre de la uva; cambia porque en la copa va a
 * encontrar otra cosa, y eso es exactamente lo que un sommelier te dice cuando
 * te ofrece algo distinto: qué vas a dejar y qué vas a encontrar.
 *
 * Ahora la frase nombra el CARÁCTER de cada uva (ver `grapeTrait` en
 * data/wineConcepts.js, la misma fuente que las tarjetas de uva), así que dos
 * saltos distintos nunca dan el mismo texto: del Malbec al Cabernet Franc dice
 * algo distinto que del Malbec al Torrontés, porque de verdad es otra cosa.
 *
 * Y cada situación tiene varias redacciones, elegidas con una semilla estable:
 * mismo criterio que en momentCopy.js —la razón nunca es al azar, el azar sólo
 * decide con qué palabras se cuenta una razón que ya es cierta—.
 *
 * Sigue sin inventar nada: si el set no daba para saltar, no hay frase.
 */
const elegir = (opciones, semilla) => opciones[Math.abs(semilla) % opciones.length];

// Una semilla estable para ESTE par de vinos: mientras la tarjeta esté en
// pantalla el texto no cambia, y dos saltos distintos no comparten redacción.
const semillaDelPar = (a, b) => {
  const texto = `${a?.id || a?.name || ""}>${b?.id || b?.name || ""}`;
  let h = 0;
  for (let i = 0; i < texto.length; i += 1) h = (h * 31 + texto.charCodeAt(i)) | 0;
  return h;
};

const NOMBRE_DEL_TIPO = {
  red: "un tinto",
  white: "un blanco",
  "rosé": "un rosado",
  sparkling: "un espumante",
  fortified: "un fortificado",
};

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

  const semilla = semillaDelPar(anterior, siguiente);
  const rasgo = grapeTrait(siguiente.varietal);
  const rasgoViejo = grapeTrait(anterior.varietal);

  if (otraUva) {
    // Lo mejor que podemos decir: qué dejás y qué encontrás, las dos en la
    // misma frase. Sólo cuando conocemos las dos uvas.
    if (rasgo && rasgoViejo) {
      return elegir(
        [
          `Dejás ${rasgoViejo} y te encontrás con ${rasgo}`,
          `Del ${anterior.varietal} al ${siguiente.varietal}: cambiás ${rasgoViejo} por ${rasgo}`,
          `Misma copa, otra conversación: acá manda ${rasgo}`,
        ],
        semilla
      );
    }
    if (rasgo) {
      return elegir(
        [
          `Un ${siguiente.varietal}: ${rasgo}`,
          `Si te gustó el ${anterior.varietal}, fijate qué hace un ${siguiente.varietal}: ${rasgo}`,
        ],
        semilla
      );
    }
    return `Si te gustó el ${anterior.varietal}, probá qué hace un ${siguiente.varietal}`;
  }

  if (otroTipo) {
    const tipo = NOMBRE_DEL_TIPO[tipoSiguiente] || "otro estilo";
    return rasgo
      ? `Cambiamos de copa: ${tipo}, con ${rasgo}`
      : `Cambiamos de copa: ${tipo} después de ${NOMBRE_DEL_TIPO[tipoAnterior] || "lo anterior"}`;
  }

  // Misma uva y mismo color: lo que cambió es el lugar, y ahí el que habla es el
  // terroir. Decir otra cosa sería inventar un salto que no hubo.
  if (siguiente.region && norm(siguiente.region) !== norm(anterior.region)) {
    return elegir(
      [
        `La misma uva, criada en ${siguiente.region}: mismo nombre, otro acento`,
        `${siguiente.varietal || "La misma uva"} de ${siguiente.region} — el lugar cambia más de lo que parece`,
      ],
      semilla
    );
  }
  return null;
};
