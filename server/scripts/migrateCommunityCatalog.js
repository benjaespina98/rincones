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
const communityWines = require("../src/services/communityWines.service");
const wineImages = require("../src/services/wineImages.service");
const { isCuratedWine } = require("../src/services/catalog.service");
const { canonicalVarietal } = require("../src/data/wineValidation");

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
 */
const arreglarClaves = async (dry) => {
  const filas = await CommunityWine.find({}).lean();
  const porClave = new Map(filas.map((f) => [f.key, f]));

  const renombres = [];
  const fusiones = [];

  for (const fila of filas) {
    const uva = canonicalVarietal(fila.varietal || "");
    const keyCorrecta = communityWines.wineKey(fila.name, fila.winery, uva.value);
    const cambiaUva = uva.value !== String(fila.varietal || "").trim();

    if (!keyCorrecta || (keyCorrecta === fila.key && !cambiaUva)) continue;

    const hermana = keyCorrecta !== fila.key ? porClave.get(keyCorrecta) : null;
    if (hermana) fusiones.push({ vieja: fila, sobrevive: hermana });
    else renombres.push({ fila, keyCorrecta, varietal: uva.value, cambiaUva });
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

  // Las fotos del pool se mudan con la fila: guardan nombre y bodega pero no la
  // uva, así que su clave sufrió exactamente la misma deriva. Sin esto, la foto
  // queda guardada bajo una clave que ya nadie consulta.
  for (const { fila, keyCorrecta, varietal, cambiaUva } of renombres) {
    await CommunityWine.updateOne(
      { _id: fila._id },
      { $set: cambiaUva ? { key: keyCorrecta, varietal } : { key: keyCorrecta } }
    );

    if (keyCorrecta === fila.key) continue;

    // El destino puede estar ocupado: la foto buena ya llegó por el camino
    // nuevo (el alta la aporta con la clave correcta) y la vieja es el resto de
    // la deriva. `key` es único, así que mudarla encima explota — hay que
    // elegir, y gana la que ya está bien.
    const ocupada = await WineImage.findOne({ key: keyCorrecta }).select("_id").lean();
    if (ocupada) await WineImage.deleteOne({ key: fila.key });
    else await WineImage.updateOne({ key: fila.key }, { $set: { key: keyCorrecta } });
  }

  for (const { vieja, sobrevive } of fusiones) {
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
    // La foto de la fila que se va también: si la sobreviviente no tenía una
    // guardada en el pool, la de la otra pasa a ser suya.
    const yaHay = await WineImage.findOne({ key: sobrevive.key }).select("_id").lean();
    if (yaHay) await WineImage.deleteOne({ key: vieja.key });
    else await WineImage.updateOne({ key: vieja.key }, { $set: { key: sobrevive.key } });
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
