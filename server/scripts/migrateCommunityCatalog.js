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
// ── SON DOS PASOS, Y EL PRIMERO ES EL QUE IMPORTA ───────────────────────────
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
const communityWines = require("../src/services/communityWines.service");
const wineImages = require("../src/services/wineImages.service");
const { isCuratedWine } = require("../src/services/catalog.service");

dotenv.config();

const LOTE = 500; // filas por bulkWrite

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
