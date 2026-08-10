// Pone al día el catálogo comunitario con lo que ya está cargado.
//
// ── QUÉ CAMBIÓ ──────────────────────────────────────────────────────────────
// Publicar pedía DOS personas distintas, o una identificación confiable. Era una
// defensa bien pensada en el lugar equivocado: bloqueaba la EXISTENCIA en vez de
// la AUTORIDAD. Con un solo usuario la segunda persona no llega nunca, así que
// en la práctica los vinos cargados quedaban invisibles para siempre — y su foto
// con ellos.
//
// Ahora `published` sólo pide identidad completa: hay nombre, hay bodega, y no
// son la misma palabra (ver `identidadCompleta` en services/communityWines).
// `verified` no se toca: sigue pidiendo dos personas y sigue siendo lo único que
// rankea por encima del modelo.
//
// ── SON TRES PASOS ──────────────────────────────────────────────────────────
// 0. ARREGLAR las claves que quedaron viejas y fusionar lo que duplicaron. La
//    clave incluye el varietal pero los campos se completaban después sin
//    recalcularla, así que una fila creada sin uva quedaba con una clave que no
//    describía sus propios datos — y la carga siguiente del mismo vino creaba
//    una segunda fila. Va primero porque los otros dos pasos comparan claves.
//
// 1. APORTAR lo que está en las bodegas y nunca llegó al catálogo. La versión
//    anterior de este script sólo recalculaba filas existentes, y por eso no
//    servía para nada en la práctica: un vino rechazado por la regla vieja no
//    dejaba fila que recalcular. Simplemente no estaba. Este paso es el que hace
//    que tus vinos —y sus fotos— aparezcan en la búsqueda.
//
// 2. RECALCULAR `published` en las filas que ya existían, en los dos sentidos:
//    las que la regla vieja dejó esperando una confirmación que no iba a llegar
//    se publican, y las que publicó con identidad rota —un "Pispi / Pispi" que
//    llegó con confianza alta— se despublican.
//
// No inventa `sameNameOk`: una fila con nombre = bodega que no esté en el
// catálogo curado queda sin publicar, y vuelve apenas su dueño la corrija o la
// confirme desde la app. Marcarlas acá sería afirmar por ellos justo lo que no
// sabemos.
//
// Es idempotente: el aporte se saltea si esa persona ya figura en la fila, así
// que correrlo dos veces no infla `count` ni duplica contribuciones.
//
//   node scripts/migrateCommunityCatalog.js --dry     ver qué haría, sin escribir
//   node scripts/migrateCommunityCatalog.js           aplicar

const dotenv = require("dotenv");
const connectToDatabase = require("../src/config/db");
const Wine = require("../src/models/wine.model");
const CommunityWine = require("../src/models/communityWine.model");
const WineImage = require("../src/models/wineImage.model");
const WinePrice = require("../src/models/winePrice.model");
const WineReview = require("../src/models/wineReview.model");
const communityWines = require("../src/services/communityWines.service");
const wineImages = require("../src/services/wineImages.service");
const { isCuratedWine } = require("../src/services/catalog.service");
const { canonicalVarietal } = require("../src/data/wineValidation");
const { canonicalWinery } = require("../src/data/wineIdentity");
// La tabla cruda: para reparar una clave YA guardada hay que reconocer el
// sinónimo dentro del string, no normalizar un campo suelto.
const { GRAPE_ALIASES } = require("../src/data/grapes");
const { fold } = require("../src/data/argentineWines");

dotenv.config();

const LOTE = 500; // filas por bulkWrite

/**
 * Paso 0: arreglar las claves que quedaron viejas, y fusionar lo que duplicaron.
 *
 * La clave incluye el varietal, pero los campos se completaban DESPUÉS sin
 * recalcularla (ya está arreglado en el servicio). Las filas que nacieron sin
 * uva quedaron con una clave que no describe sus propios datos, y la carga
 * siguiente del mismo vino —que sí calculaba la clave con la uva— creaba una
 * segunda fila. De ahí salen los duplicados publicados: "Familia Benito" y
 * "Familia Benito Sauvignon Blanc" son la misma botella.
 *
 * De paso pasa el varietal por el vocabulario: hay filas con "Blen", el "Blend"
 * al que el modelo le comió la última letra, guardadas antes de que existiera
 * esa corrección.
 *
 * ── POR QUÉ AGRUPA POR LA CLAVE NUEVA Y NO BUSCA LA HERMANA ─────────────────
 * La versión anterior indexaba las filas por su clave GUARDADA y preguntaba si
 * alguien ya ocupaba el destino. Eso alcanzaba mientras los cambios de clave
 * fueran de a una fila, y se rompe justo en el caso que motivó todo esto: cuando
 * DOS filas se mudan a la misma clave nueva, ninguna de las dos encuentra a la
 * otra —porque ninguna está guardada todavía bajo el destino— y las dos se
 * anotan como renombre. La primera escribe; la segunda choca contra el índice
 * único de `key` y la migración se cae por la mitad.
 *
 * Es exactamente lo que pasa al normalizar bodega y uva ("Mosquita Muerta Wines
 * / Blend" y "Mosquita Muerta / Blend de tintas" van las dos a la misma clave),
 * así que ahora se agrupa por DESTINO: cada grupo elige una sobreviviente y el
 * resto se funde en ella. Sirve para cualquier cambio de clave futuro, no sólo
 * para éste.
 */
const arreglarClaves = async (dry) => {
  const filas = await CommunityWine.find({}).lean();

  // destino → filas que terminan ahí
  const porDestino = new Map();
  for (const fila of filas) {
    const uva = canonicalVarietal(fila.varietal || "");
    const keyCorrecta = communityWines.wineKey(fila.name, fila.winery, uva.value);
    if (!keyCorrecta) continue;

    const cambiaUva = uva.value !== String(fila.varietal || "").trim();
    const grupo = porDestino.get(keyCorrecta) || [];
    grupo.push({ fila, varietal: uva.value, cambiaUva });
    porDestino.set(keyCorrecta, grupo);
  }

  const renombres = [];
  const fusiones = [];

  for (const [keyCorrecta, grupo] of porDestino) {
    // Sobrevive la que ya está bien guardada; si ninguna lo está, la que más
    // contribuciones tiene (es la que más historia arrastra).
    const yaCorrecta = grupo.find((g) => g.fila.key === keyCorrecta);
    const ganadora =
      yaCorrecta || [...grupo].sort((a, b) => (b.fila.count || 0) - (a.fila.count || 0))[0];

    for (const g of grupo) {
      if (g === ganadora) continue;
      fusiones.push({ vieja: g.fila, sobrevive: ganadora.fila, destino: keyCorrecta });
    }

    const { fila, varietal, cambiaUva } = ganadora;
    if (fila.key === keyCorrecta && !cambiaUva) continue;
    renombres.push({ fila, keyCorrecta, varietal, cambiaUva });
  }

  console.log(`  claves a corregir: ${renombres.length}`);
  for (const r of renombres) {
    console.log(
      `  ~ ${r.fila.name} — ${r.fila.winery}\n      "${r.fila.key}" → "${r.keyCorrecta}"` +
        (r.cambiaUva ? `  [uva "${r.fila.varietal}" → "${r.varietal}"]` : "")
    );
  }
  console.log(`  duplicados a fusionar: ${fusiones.length}`);
  for (const f of fusiones) {
    console.log(`  ⇒ "${f.vieja.name}" se funde en "${f.sobrevive.name}" (${f.sobrevive.winery})`);
  }

  if (dry) return;

  // Los pools se mudan con la fila. Guardan la misma clave —nombre + uva |
  // bodega— así que sufrieron exactamente la misma deriva, y una foto que se
  // queda bajo la clave vieja es una foto que ya nadie consulta.
  for (const { fila, keyCorrecta, varietal, cambiaUva } of renombres) {
    await CommunityWine.updateOne(
      { _id: fila._id },
      { $set: cambiaUva ? { key: keyCorrecta, varietal } : { key: keyCorrecta } }
    );

    if (keyCorrecta === fila.key) continue;
    await mudarPools(fila.key, keyCorrecta);
  }

  for (const { vieja, sobrevive, destino } of fusiones) {
    const contribuyentes = new Set(
      [...(sobrevive.contributors || []), ...(vieja.contributors || [])].map(String)
    );
    await CommunityWine.updateOne(
      { _id: sobrevive._id },
      {
        $set: {
          count: (sobrevive.count || 0) + (vieja.count || 0),
          trustedCount: (sobrevive.trustedCount || 0) + (vieja.trustedCount || 0),
          contributors: [...contribuyentes],
          sameNameOk: Boolean(sobrevive.sameNameOk || vieja.sameNameOk),
          // Lo que a la sobreviviente le falte y la otra tenga, no se tira.
          image: sobrevive.image || vieja.image || "",
          region: sobrevive.region || vieja.region || "",
          type:
            sobrevive.type && sobrevive.type !== "unknown"
              ? sobrevive.type
              : vieja.type || "unknown",
        },
      }
    );
    await CommunityWine.deleteOne({ _id: vieja._id });
    // Lo que la fila que se va tenía en los pools se muda al destino, que es
    // donde la sobreviviente va a quedar (no a su clave actual: si además la
    // renombramos, ésa deja de existir en este mismo paso).
    await mudarPools(vieja.key, destino);
  }
};

/**
 * Mueve lo que cuelga de una clave a otra: foto, precio y reseñas.
 *
 * Los tres pools se guardan por la MISMA clave que el catálogo comunitario, así
 * que cualquier corrección de clave los arrastra. Antes sólo se mudaban las
 * fotos; el precio y las reseñas se quedaban colgando de una clave que ya nadie
 * consulta, o sea que el promedio de precio y las estrellas del vino
 * desaparecían de la ficha sin que nada lo dijera.
 *
 * Cuando el destino ya está ocupado hay que elegir, porque `key` es único:
 *  - foto  → gana la que ya está en el destino (llegó por el camino nuevo, que
 *            es el correcto); la vieja se borra.
 *  - precio→ se SUMAN los agregados. Son observaciones independientes del mismo
 *            vino y tirar una empeoraría el promedio en vez de arreglarlo.
 *  - reseñas→ se mudan de a una. La misma persona pudo haber reseñado las dos
 *            filas (creía que eran vinos distintos, porque lo parecían): en ese
 *            caso el índice `key+userId` no admite las dos y se conserva la del
 *            destino.
 */
const mudarPools = async (desde, hacia) => {
  if (!desde || !hacia || desde === hacia) return;

  const fotoDestino = await WineImage.findOne({ key: hacia }).select("_id").lean();
  if (fotoDestino) await WineImage.deleteOne({ key: desde });
  else await WineImage.updateOne({ key: desde }, { $set: { key: hacia } });

  const precioViejo = await WinePrice.findOne({ key: desde }).lean();
  if (precioViejo) {
    const precioDestino = await WinePrice.findOne({ key: hacia }).lean();
    if (!precioDestino) {
      await WinePrice.updateOne({ key: desde }, { $set: { key: hacia } });
    } else {
      const minimos = [precioDestino.min, precioViejo.min].filter((n) => Number.isFinite(n));
      const maximos = [precioDestino.max, precioViejo.max].filter((n) => Number.isFinite(n));
      await WinePrice.updateOne(
        { _id: precioDestino._id },
        {
          $set: {
            sum: (precioDestino.sum || 0) + (precioViejo.sum || 0),
            count: (precioDestino.count || 0) + (precioViejo.count || 0),
            min: minimos.length ? Math.min(...minimos) : null,
            max: maximos.length ? Math.max(...maximos) : null,
          },
        }
      );
      await WinePrice.deleteOne({ _id: precioViejo._id });
    }
  }

  for (const reseña of await WineReview.find({ key: desde }).select("_id userId").lean()) {
    const yaReseño = await WineReview.findOne({ key: hacia, userId: reseña.userId })
      .select("_id")
      .lean();
    if (yaReseño) await WineReview.deleteOne({ _id: reseña._id });
    else await WineReview.updateOne({ _id: reseña._id }, { $set: { key: hacia } });
  }
};

/**
 * Recalcula una clave de pool ya guardada, sin conocer los campos que la
 * generaron.
 *
 * La clave tiene forma `nombre+uva|bodega`, y las dos mitades cambiaron cuando
 * la identidad pasó a normalizarse. Los pools guardan `name` y `winery` pero NO
 * el varietal, así que no se puede volver a llamar a `poolKey` y hay que operar
 * sobre el string. Se puede, y sin adivinar nada:
 *
 *  - la bodega es todo lo que va después del "|" → `canonicalWinery` tal cual;
 *  - la uva va SIEMPRE al final del core y separada por un espacio (así la pega
 *    `composeSearchName`), así que un sufijo que coincida exacto con un sinónimo
 *    conocido es la uva y se reemplaza por su forma canónica.
 *
 * Lo que no coincide se deja intacto: el objetivo es reparar, no reinterpretar.
 */
const canonicalizarClave = (keyVieja = "") => {
  const corte = keyVieja.lastIndexOf("|");
  if (corte < 0) return keyVieja;

  const core = keyVieja.slice(0, corte);
  const bodega = keyVieja.slice(corte + 1);

  let coreNuevo = core;
  for (const [alias, canonico] of GRAPE_ALIASES) {
    const sufijo = ` ${alias}`;
    if (core.endsWith(sufijo)) {
      coreNuevo = `${core.slice(0, -sufijo.length)} ${fold(canonico)}`;
      break;
    }
  }

  return `${coreNuevo}|${canonicalWinery(bodega)}`;
};

/**
 * Paso 0b: los pools de vinos que NO tienen fila comunitaria.
 *
 * El paso anterior arrastra los pools de cada fila que corrige, y eso deja
 * afuera justo al caso más común: un vino que YA está en el catálogo curado
 * nunca crea fila comunitaria (`isCuratedWine` lo frena, y está bien que lo
 * haga), pero sí deja su foto, su precio y sus reseñas en los pools. Esos
 * quedaron con la clave vieja y sin nadie que los mude.
 *
 * Se vio con el Pispi: después de arreglar la fila comunitaria, el pool tenía
 * "pispi blend|mosquita muerta" y "pispi blend|mosquita muerta wines", la
 * segunda ya inalcanzable. Nadie la iba a leer nunca más, y con ella se perdían
 * la foto y el precio que alguien había aportado.
 */
const arreglarPools = async (dry) => {
  const colecciones = [
    ["fotos", WineImage],
    ["precios", WinePrice],
    ["reseñas", WineReview],
  ];

  for (const [nombre, Modelo] of colecciones) {
    const claves = await Modelo.distinct("key");
    const mudanzas = claves
      .map((vieja) => ({ vieja, nueva: canonicalizarClave(vieja) }))
      .filter((m) => m.nueva && m.nueva !== m.vieja);

    console.log(`  ${nombre}: ${mudanzas.length} clave(s) a corregir de ${claves.length}`);
    for (const m of mudanzas) console.log(`    ~ "${m.vieja}" → "${m.nueva}"`);

    if (dry) continue;
    for (const m of mudanzas) await mudarPools(m.vieja, m.nueva);
  }
};

/**
 * Paso 1: cada vino de cada bodega aporta su identidad al catálogo.
 *
 * El veredicto sale de lo que quedó guardado al cargarlo. Los vinos anteriores a
 * que existiera la identificación no tienen ninguno, y entran como "unverified":
 * es lo honesto —no sabemos con qué confianza se leyeron— y ya no cambia si se
 * publican, sólo si pueden llegar a `verified`.
 */
const aportarBodegas = async (dry) => {
  const vinos = await Wine.find({})
    .select("name line winery varietal region type image identification userId")
    .lean();

  let aportados = 0;
  let yaEstaban = 0;
  let salteados = 0;

  for (const vino of vinos) {
    if (isCuratedWine(vino)) {
      // El catálogo curado ya lo tiene: sumarlo crearía un gemelo duplicado.
      salteados += 1;
      continue;
    }

    const key = communityWines.wineKey(vino.name, vino.winery, vino.varietal);
    if (!key) {
      salteados += 1;
      continue;
    }

    // Idempotencia: si esta persona ya figura en la fila, su aporte ya está.
    const fila = await CommunityWine.findOne({ key }).select("contributors").lean();
    const yaAporto = fila?.contributors?.some((c) => String(c) === String(vino.userId));
    if (yaAporto) {
      yaEstaban += 1;
      continue;
    }

    const ident = vino.identification || {};
    console.log(
      `  + ${vino.name} — ${vino.winery || "(sin bodega)"}` +
        `${vino.image ? " (con foto)" : ""}${fila ? " [suma a una fila que ya existía]" : ""}`
    );
    aportados += 1;

    if (dry) continue;

    await communityWines.contribute(
      {
        name: vino.name,
        winery: vino.winery,
        region: vino.region,
        varietal: vino.varietal,
        type: vino.type,
        image: vino.image,
      },
      {
        userId: vino.userId,
        verdict: ident.verdict || "unverified",
        origin: ident.source === "manual" ? "manual" : "scan",
        sameNameConfirmed: ident.sameNameConfirmed === true,
      }
    );

    // La foto también, por si el vino la tiene y el pool compartido no: es lo
    // que hace que el resultado de búsqueda se pueda reconocer de un vistazo.
    if (vino.image) {
      await wineImages.contribute({
        name: vino.name,
        winery: vino.winery,
        varietal: vino.varietal,
        image: vino.image,
        userId: vino.userId,
      });
    }
  }

  console.log(`\nVinos en bodegas: ${vinos.length}`);
  console.log(`  aportados al catálogo: ${aportados}`);
  console.log(`  ya estaban:            ${yaEstaban}`);
  console.log(`  salteados (curados o sin identidad): ${salteados}`);
};

/** Paso 2: las filas que ya existían, con la regla nueva. */
const recalcularPublicadas = async (dry) => {
  const filas = await CommunityWine.find({})
    .select("key name winery published sameNameOk image")
    .lean();

  const publican = [];
  const despublican = [];

  for (const fila of filas) {
    const deberia = communityWines.identidadCompleta(fila);
    if (deberia === Boolean(fila.published)) continue;
    (deberia ? publican : despublican).push(fila);
  }

  console.log(`\nFilas en el catálogo comunitario: ${filas.length}`);
  console.log(`  se publican:    ${publican.length}`);
  console.log(`  se despublican: ${despublican.length}`);

  // El detalle importa: son vinos concretos de gente concreta, y quien corre
  // esto tiene que poder mirar la lista antes de aplicarla.
  for (const f of publican.slice(0, 40)) {
    console.log(`  + ${f.name} — ${f.winery}${f.image ? " (con foto)" : ""}`);
  }
  if (publican.length > 40) console.log(`  … y ${publican.length - 40} más`);
  for (const f of despublican.slice(0, 40)) {
    console.log(`  - ${f.name} — ${f.winery}  (nombre = bodega, sin confirmar)`);
  }
  if (despublican.length > 40) console.log(`  … y ${despublican.length - 40} más`);

  if (dry) return;

  const cambios = [
    ...publican.map((f) => ({ fila: f, valor: true })),
    ...despublican.map((f) => ({ fila: f, valor: false })),
  ];

  let escritas = 0;
  for (let i = 0; i < cambios.length; i += LOTE) {
    const ops = cambios.slice(i, i + LOTE).map(({ fila, valor }) => ({
      updateOne: { filter: { _id: fila._id }, update: { $set: { published: valor } } },
    }));
    if (ops.length === 0) continue;
    const res = await CommunityWine.bulkWrite(ops);
    escritas += res.modifiedCount || 0;
  }
  console.log(`  ${escritas} filas actualizadas.`);
};

const run = async () => {
  const dry = process.argv.includes("--dry");
  await connectToDatabase();

  console.log("\n── 0. Claves viejas y duplicados ──");
  await arreglarClaves(dry);

  console.log("\n── 0b. Pools sin fila comunitaria (vinos del catálogo curado) ──");
  await arreglarPools(dry);

  console.log("\n── 1. Lo que está en las bodegas y no en el catálogo ──");
  await aportarBodegas(dry);

  console.log("\n── 2. Las filas que ya existían, con la regla nueva ──");
  await recalcularPublicadas(dry);

  console.log(dry ? "\n--dry: no se escribió nada." : "\nListo.");
};

run()
  .catch((error) => {
    console.error("Falló la migración:", error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
