// Rearma el pool de precios comunitarios desde lo que ya está cargado.
//
// ── POR QUÉ HACE FALTA ──────────────────────────────────────────────────────
// El promedio se alimentaba SÓLO en el momento de escribir el precio, y durante
// mucho tiempo únicamente al dar de alta el vino: el aporte al editar recién
// existe desde el 20/08/2026. Todo lo que se cargó antes por ese camino —un vino
// creado sin precio al que después se le puso uno— nunca entró al pool, así que
// la ficha mostraba "Sin datos todavía" al lado del precio que la persona tenía
// escrito arriba. Los datos estaban; lo que faltaba era la suma.
//
// Y como el pool pasó a guardar una muestra POR PERSONA (ver
// winePrice.model.js), los documentos viejos —que sólo tenían `sum` y `count`,
// sin dueño— ya no se pueden corregir ni retirar. No se pueden migrar: no hay
// forma de saber quién aportó cada peso. Se descartan y se reconstruye todo
// desde los vinos, que es la fuente que sí tiene dueño.
//
// Es idempotente: reconstruye el pool entero cada vez, así que correrlo dos
// veces deja exactamente lo mismo.
//
//   node scripts/backfillWinePrices.js --dry     ver qué haría, sin escribir
//   node scripts/backfillWinePrices.js           aplicar

const dotenv = require("dotenv");
const connectToDatabase = require("../src/config/db");
const { modoMigracion } = require("./lib/modoMigracion");
const Wine = require("../src/models/wine.model");
const WinePrice = require("../src/models/winePrice.model");
const { recalcular, wineKey } = require("../src/services/winePrices.service");

dotenv.config();

const run = async () => {
  const { dry: dryRun } = modoMigracion();
  await connectToDatabase();
  console.log(`\n  Precios comunitarios${dryRun ? "  (simulación)" : ""}\n`);

  const vinos = await Wine.find({ "purchase.price": { $gt: 0 } })
    .select("userId name winery varietal purchase.price purchase.currency")
    .lean();

  console.log(`  ${vinos.length} vino(s) con precio cargado`);

  // Una muestra por persona y por clave. Si alguien cargó DOS botellas del mismo
  // vino con precios distintos —perfectamente posible: las compró en dos
  // momentos— vale la última, igual que si hubiera editado: es una persona, es
  // un precio.
  const pools = new Map();
  let sinClave = 0;

  for (const vino of vinos) {
    const key = wineKey(vino.name, vino.winery, vino.varietal);
    // Un vino con nombre demasiado corto no genera clave (ver `poolKey`): no
    // hay identidad que compartir con nadie, así que no entra al pool.
    if (!key) {
      sinClave += 1;
      continue;
    }
    if (!pools.has(key)) {
      pools.set(key, {
        key,
        name: String(vino.name || "").trim(),
        winery: String(vino.winery || "").trim(),
        currency: vino.purchase?.currency || "ARS",
        porUsuario: new Map(),
      });
    }
    pools.get(key).porUsuario.set(String(vino.userId), {
      user: vino.userId,
      price: Number(vino.purchase.price),
      currency: vino.purchase?.currency || "ARS",
      at: new Date(),
    });
  }

  for (const pool of pools.values()) {
    const precios = [...pool.porUsuario.values()].map((s) => s.price);
    const promedio = Math.round(precios.reduce((a, b) => a + b, 0) / precios.length);
    console.log(
      `  · ${pool.name}${pool.winery ? ` — ${pool.winery}` : ""}: ` +
        `$${promedio.toLocaleString("es-AR")} (${precios.length})`
    );
  }

  if (dryRun) {
    console.log(`
  ${pools.size} pool(s) quedarían armados
  ${sinClave} vino(s) sin clave (nombre demasiado corto), se ignoran

  Nada de esto se escribió. Corré con --aplicar para escribirlo (en producción, también --confirmo-destino=rincones).
`);
    return;
  }

  // Se borra todo antes de reconstruir: los documentos viejos no tienen muestras
  // con dueño y mezclarlos con los nuevos dejaría el promedio a medio camino
  // entre los dos modelos, sin poder distinguir después qué vino de dónde.
  const borrados = await WinePrice.deleteMany({});

  for (const pool of pools.values()) {
    const doc = new WinePrice({
      key: pool.key,
      name: pool.name,
      winery: pool.winery,
      currency: pool.currency,
      samples: [...pool.porUsuario.values()],
    });
    recalcular(doc);
    await doc.save();
  }

  console.log(`
  ${borrados.deletedCount} pool(s) viejo(s) descartado(s)
  ${pools.size} pool(s) armado(s) desde los vinos cargados
  ${sinClave} vino(s) sin clave (nombre demasiado corto), ignorados
`);
};

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error en el backfill:", error.message);
    process.exit(1);
  });
