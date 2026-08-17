const crypto = require("crypto");
const labelsService = require("../services/labels.service");
const visionService = require("../services/vision.service");
const catalogService = require("../services/catalog.service");
const { composeDisplayName } = require("../data/wineIdentity");
const { checkCoherence } = require("../data/wineValidation");
const LabelScanCache = require("../models/labelScanCache.model");

const EMPTY_CONFIDENCE = {
  winery: 0, line: 0, name: 0, varietal: 0, vintage: 0, region: 0, type: 0,
};

// Caché por hash exacto del archivo. Ver labelScanCache.model.js: cubre el
// mismo archivo subido más de una vez (reintento tras timeout, la misma foto
// compartida entre dos personas), no fotos distintas de la misma botella.
const HASH_CACHE_DAYS = 30;

const hashBuffer = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

// Nunca lanza: el caché es una optimización, no un requisito. Ver el mismo
// criterio en catalog.service.js (searchWithAiCached).
const getCachedAnalysis = async (hash) => {
  try {
    const cached = await LabelScanCache.findOne({ hash }).lean();
    return cached?.data || null;
  } catch {
    return null;
  }
};

const saveCachedAnalysis = async (hash, data) => {
  try {
    const expiresAt = new Date(Date.now() + HASH_CACHE_DAYS * 24 * 60 * 60 * 1000);
    await LabelScanCache.updateOne(
      { hash },
      { $set: { hash, data, expiresAt } },
      { upsert: true }
    );
  } catch {
    // Idem: si Mongo falla acá, la respuesta ya salió; sólo perdemos el ahorro.
  }
};

/**
 * ── LO QUE DICE LA ETIQUETA VS. CÓMO SE LLAMA EL VINO ───────────────────────
 *
 * Cuánta confianza queda un nombre según quién lo respalde. Son los mismos
 * umbrales de data/wineValidation.js leídos al revés: por encima de 80 un nombre
 * se da por bueno (chip, y puede publicarse al catálogo público), por debajo la
 * revisión lo abre para que la persona lo mire.
 *
 *   95 → el catálogo curado o dos personas distintas: es el nombre exacto.
 *   85 → el modelo consultado por texto. Es una segunda opinión de verdad —la
 *        pregunta es otra y no mira la foto— pero sigue siendo un modelo.
 *   75 → NADIE lo respalda. Alcanza para guardarlo en tu bodega de un toque,
 *        no para darlo por cierto: la revisión muestra el nombre editable y el
 *        vino no entra al catálogo público hasta que otra persona coincida.
 *
 * Ese 75 es el corazón del cambio. Antes un nombre que el modelo declaraba
 * haber leído nítido salía con 95 sin que nada lo hubiera contrastado contra
 * una lista de vinos que existen, y de ahí pasaba al catálogo compartido.
 */
const CONFIANZA_VERIFICADA = { "catalogo-ar": 95, "comunidad-verificada": 95, gemini: 85 };
const CONFIANZA_SIN_VERIFICAR = 75;
// Lo que aporta el match para RELLENAR huecos (región, uva, tipo): bueno, pero
// no leído de ESTA botella. Mismo valor que usaba el enriquecimiento del cliente.
const CONFIANZA_DE_CONTEXTO = 75;

/**
 * Cruza la lectura contra una fuente real y devuelve la versión verificada.
 *
 * Corre SIEMPRE, también sobre una lectura servida desde el caché de imágenes y
 * también sobre el OCR: el caché guarda lo que se leyó de la foto, no lo que el
 * catálogo sabe hoy: un vino que se agrega al catálogo mañana tiene que poder
 * verificar la foto que ya está cacheada.
 */
/** Cómo se le muestra un candidato a la persona que está mirando la etiqueta. */
const aCandidato = (puntuado) => {
  if (!puntuado) return null;
  const w = puntuado.wine || {};
  return {
    name: String(w.line || w.properName || w.name || "").trim(),
    winery: String(w.winery || "").trim(),
    varietal: String(w.varietal || "").trim(),
    region: String(w.region || "").trim(),
    type: String(w.type || "unknown").trim(),
    source: String(w.source || "").trim(),
  };
};

const conVerificacion = async (data, { userId } = {}) => {
  const lectura = {
    winery: data.winery,
    line: data.line,
    name: data.properName,
    varietal: data.varietal,
    region: data.region,
    type: data.type,
    vintage: data.vintage,
  };

  /**
   * Identificar primero, verificar después, con UNA sola búsqueda.
   *
   * Son dos preguntas distintas sobre la misma lista: qué botella es (mirando
   * todo: catálogo, comunidad y tus propios vinos ya confirmados) y quién
   * respalda ese nombre (sólo fuentes que valen como respaldo). Antes cada una
   * buscaba por su cuenta; ahora el universo de candidatos se arma una vez y se
   * comparte, que es lo que permite mirar más fuentes sin agregar espera.
   */
  const identificacion = await catalogService
    .identifyReading(lectura, { userId })
    .catch(() => null);

  const v = await catalogService
    .verifyReading(lectura, { candidatos: identificacion?.candidatos })
    .catch(() => null);

  const confidence = { ...(data.confidence || {}) };
  const tope = (campo, max) => Math.min(confidence[campo] || 0, max);

  /**
   * Rellena SÓLO los huecos, nunca pisa lo que se leyó de la etiqueta.
   *
   * Es lo que antes hacía el cliente con `/catalog/match`. Se mantiene tal cual
   * —incluso desde una fila comunitaria de una sola persona, que no alcanza para
   * verificar un nombre— porque son dos cosas de distinto peso: completar una
   * región vacía es una ayuda que se puede corregir de un toque; afirmar cómo se
   * llama el vino es lo que después ve todo el mundo.
   */
  const completarHuecos = (valores, fuente) => {
    if (!fuente) return;
    for (const campo of ["varietal", "region"]) {
      if (!valores[campo] && fuente[campo]) {
        valores[campo] = fuente[campo];
        confidence[campo] = Math.max(confidence[campo] || 0, CONFIANZA_DE_CONTEXTO);
      }
    }
    if ((!valores.type || valores.type === "unknown") && fuente.type && fuente.type !== "unknown") {
      valores.type = fuente.type;
      confidence.type = Math.max(confidence.type || 0, CONFIANZA_DE_CONTEXTO);
    }
  };

  /**
   * ── NI CONFIRMADO NI DESCARTADO: HAY UN CANDIDATO Y SE PREGUNTA ────────────
   *
   * El tramo del medio, que antes no existía. Cuando la identificación es buena
   * pero no para darla por hecha —dos líneas parecidas de la misma bodega, un
   * nombre que coincide a medias— no se toca NINGÚN dato de la lectura: el
   * candidato viaja aparte y la revisión lo ofrece en un toque.
   *
   * Es la diferencia entre "te cambio el vino y avisá si me equivoqué" y "creo
   * que es éste, ¿confirmás?". La primera versión es la que genera la
   * frustración que estamos sacando: una identificación equivocada cuesta mucho
   * más que una pregunta.
   */
  const sugerido = v?.status === "sugerido" || (!v && identificacion?.level === "media");
  const candidato = v?.status === "sugerido" ? { wine: v.wine } : identificacion?.best;

  if (!v || v.status === "sin-verificar" || sugerido) {
    // Que nadie respalde el NOMBRE no impide completar lo que falte, siempre que
    // la identificación sea FIRME. Se reusa la que ya se hizo arriba en vez de
    // volver a buscar: es la misma pregunta con la misma respuesta.
    const valores = { ...data };
    if (identificacion?.level === "alta") completarHuecos(valores, identificacion.best.wine);

    return {
      ...valores,
      confidence: {
        ...confidence,
        name: tope("name", CONFIANZA_SIN_VERIFICAR),
        line: tope("line", CONFIANZA_SIN_VERIFICAR),
      },
      verification: {
        status: sugerido ? "sugerido" : "sin-verificar",
        source: sugerido ? String(candidato?.wine?.source || "") : "",
        name: "",
        mismatches: [],
        // El candidato y —si estaban parejos— el que salió segundo. Los dos
        // completos, para que aceptar uno sea aplicar sus datos y no volver a
        // buscar nada.
        candidate: sugerido ? aCandidato(candidato) : null,
        alternative: sugerido ? aCandidato(identificacion?.alternative) : null,
      },
    };
  }

  const fuente = v.wine || {};
  const valores = { ...data };

  // El nombre exacto, como lo escribe quien lo hace. La línea es donde vive el
  // nombre en el catálogo curado (y donde `identityKey` lo busca primero), así
  // que una corrección va ahí y deja el nombre propio vacío en vez de dejar los
  // dos campos diciendo cosas distintas.
  if (v.status === "corregido") {
    valores.line = v.name;
    valores.properName = "";
  }
  // La bodega también viene de la fuente: "Mosquita Muerta" y "Mosquita Muerta
  // Wines" son la misma, y la que corresponde guardar es la que figura completa.
  if (fuente.winery) valores.winery = fuente.winery;

  completarHuecos(valores, fuente);

  /**
   * ── LO QUE LA FUENTE CONTRADICE NO SE PISA: SE ABRE ────────────────────────
   *
   * Si el modelo dice que la uva de este vino no es la que leímos, hay dos datos
   * enfrentados y ninguno gana solo: la etiqueta la tiene la persona en la mano
   * (y las bodegas cambian cortes entre añadas), pero el lector se equivoca
   * seguido. Sobrescribir sería reemplazar un error posible por otro, en
   * silencio.
   *
   * Bajar la confianza al tramo de "verificá" es lo que hace que la revisión
   * muestre ese campo como input en vez de esconderlo en un chip: el dato leído
   * queda, y la decisión la toma quien puede mirar la botella. La cosecha nunca
   * entra acá — el modelo conoce el vino, no TU botella.
   */
  const respaldo = CONFIANZA_VERIFICADA[v.source] || CONFIANZA_SIN_VERIFICAR;
  confidence.line = valores.line ? Math.max(confidence.line || 0, respaldo) : 0;
  confidence.name = valores.properName ? Math.max(confidence.name || 0, respaldo) : 0;
  confidence.winery = valores.winery ? Math.max(confidence.winery || 0, respaldo) : 0;

  // La bodega no entra: la que quedó es la de la fuente, así que ya no hay
  // contradicción que mostrar. Y el orden importa — esto va DESPUÉS del respaldo
  // de arriba, o el mismo campo que acabamos de marcar dudoso volvería a subir.
  const CAMPOS_CONTRASTABLES = new Set(["varietal", "region", "type"]);
  const dudosos = (v.mismatches || []).filter((c) => CAMPOS_CONTRASTABLES.has(c));
  for (const campo of dudosos) {
    if (valores[campo]) confidence[campo] = Math.min(confidence[campo] || 0, 60);
  }

  return {
    ...valores,
    confidence,
    // El nombre visible y los problemas se recalculan sobre lo CORREGIDO: si no,
    // la revisión mostraría el nombre viejo y avisaría de algo que ya se arregló.
    displayName: composeDisplayName({ name: valores.properName, line: valores.line }),
    estimatedName: composeDisplayName({ name: valores.properName, line: valores.line }),
    issues: checkCoherence({
      name: valores.properName,
      line: valores.line,
      winery: valores.winery,
      varietal: valores.varietal,
      vintage: valores.vintage,
      region: valores.region,
      type: valores.type,
    }),
    verification: {
      status: v.status,
      source: v.source,
      name: v.name,
      mismatches: dudosos,
      candidate: null,
      // Aun con el nombre confirmado puede haber quedado una segunda opción
      // pisándole los talones. Viaja igual: si la app se equivocó de línea, la
      // respuesta correcta suele ser la que descartó.
      alternative: aCandidato(identificacion?.alternative),
    },
  };
};

const analyzeLabel = async (req, res, next) => {
  // Instrumentación de latencia: nada de esto se muestra al usuario ni lleva
  // datos de la imagen/persona, sólo cuánto tardó cada etapa. Es lo que
  // permite responder "el escaneo tarda X segundos y esto es lo que los
  // consume" en vez de optimizar a ciegas.
  const t0 = process.hrtime.bigint();
  const ms = (from) => Number(process.hrtime.bigint() - from) / 1e6;
  // Tu propia bodega es una señal más para identificar la botella: los vinos que
  // ya confirmaste una vez cuentan como candidatos. Ver `misVinosParecidos`.
  const userId = req.user?.id;

  try {
    if (!req.file) {
      return res.status(400).json({ message: "Falta archivo de imagen" });
    }

    const tHash = process.hrtime.bigint();
    const hash = hashBuffer(req.file.buffer);
    const cached = await getCachedAnalysis(hash);
    const cacheMs = ms(tHash);
    if (cached) {
      const verificado = await conVerificacion(cached, { userId });
      console.info(
        `[scan] analyze cache=hit verif=${verificado.verification.status} hash=${cacheMs.toFixed(1)}ms total=${ms(t0).toFixed(1)}ms`
      );
      return res.status(200).json({ data: { ...verificado, cached: true } });
    }

    // 1) Preferimos visión (Gemini): más rápido y preciso que el OCR.
    if (visionService.isVisionConfigured()) {
      const tVision = process.hrtime.bigint();
      try {
        const v = await visionService.analyzeWineLabel(req.file.buffer, req.file.mimetype);
        const visionMs = ms(tVision);
        const data = {
          winery: v.winery || "",
          line: v.line || "",
          properName: v.name || "",
          varietal: v.varietal || "",
          region: v.region || "",
          type: v.type || "unknown",
          vintage: v.vintage || "",
          // Nombre visible ya compuesto con la convención del catálogo.
          displayName: v.displayName || "",
          isWineLabel: v.isWineLabel,
          confidence: v.confidence,
          // Lo que no cierra entre los campos leídos (uva desconocida, tipo que
          // contradice a la uva, nombre igual a la bodega). La revisión lo usa
          // para decidir qué abrir; ver data/wineValidation.js.
          issues: v.issues || [],
          source: "gemini",
          rawText: "",
          // Compat: el cliente viejo leía estas dos claves.
          estimatedName: v.displayName || "",
          estimatedVintage: v.vintage || "",
        };
        // Sólo cacheamos lecturas de Gemini (lo caro) y que sí parecen una
        // etiqueta de vino: cachear un "no es una etiqueta" o un error servido
        // como dato le devolvería lo mismo a cualquiera que suba ese archivo.
        //
        // Se guarda la lectura CRUDA, antes de verificarla: lo que la foto dice
        // no cambia nunca, pero lo que el catálogo sabe sí. Guardar el veredicto
        // dejaría un "no lo encontramos" congelado treinta días sobre un vino que
        // mañana está en el catálogo.
        if (v.isWineLabel !== false) saveCachedAnalysis(hash, data);
        const verificado = await conVerificacion(data, { userId });
        console.info(
          `[scan] analyze cache=miss source=gemini verif=${verificado.verification.status} hash=${cacheMs.toFixed(1)}ms vision=${visionMs.toFixed(1)}ms total=${ms(t0).toFixed(1)}ms`
        );
        return res.status(200).json({ data: verificado });
      } catch (visionError) {
        // Si la visión falla (sin key, timeout, error de API), caemos al OCR.
        console.error(
          `[scan] analyze source=gemini falló tras ${ms(tVision).toFixed(1)}ms, usando OCR:`,
          visionError.message
        );
      }
    }

    // 2) Fallback: OCR local (Tesseract). Devuelve el MISMO sobre que la visión
    // para que el cliente no tenga que saber de qué camino vino: el OCR sólo
    // logra sacar nombre y año, así que el resto va vacío con confianza 0.
    const tOcr = process.hrtime.bigint();
    const result = await labelsService.analyzeImageBuffer(req.file.buffer);
    const ocrMs = ms(tOcr);
    const ocrName = result.estimatedName || "";
    const ocrConf = Math.max(0, Math.min(100, Math.round(Number(result.confidence) || 0)));

    // La verificación corre también acá, aunque de un texto suelto sin bodega
    // rara vez alcance para confirmar algo (el match pide coincidir en más de un
    // campo antes de afirmar que es esta botella). Lo que sí hace siempre es lo
    // que corresponde: dejar el nombre del OCR como lo que es, un texto que
    // nadie respaldó todavía.
    const verificado = await conVerificacion({
      winery: "",
      line: "",
      properName: ocrName,
      varietal: "",
      region: "",
      type: "unknown",
      vintage: result.estimatedVintage || "",
      displayName: composeDisplayName({ name: ocrName }),
      // El OCR no sabe si es una etiqueta de vino; lo damos por bueno y que
      // el usuario confirme en la pantalla de revisión.
      isWineLabel: true,
      confidence: {
        ...EMPTY_CONFIDENCE,
        name: ocrName ? ocrConf : 0,
        vintage: result.estimatedVintage ? ocrConf : 0,
      },
      // El OCR no separa bodega de nombre ni lee la uva: no tiene campos
      // suficientes para que se contradigan entre sí. Los problemas que
      // importan acá los detecta la revisión sobre lo que quede al final.
      issues: [],
      source: "ocr",
      rawText: result.rawText || "",
      estimatedName: ocrName,
      estimatedVintage: result.estimatedVintage || "",
    }, { userId });

    console.info(
      `[scan] analyze cache=miss source=ocr verif=${verificado.verification.status} hash=${cacheMs.toFixed(1)}ms ocr=${ocrMs.toFixed(1)}ms total=${ms(t0).toFixed(1)}ms`
    );
    return res.status(200).json({ data: verificado });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  analyzeLabel,
};
