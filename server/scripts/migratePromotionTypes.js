// Pasa las campañas de `kind: "ad" | "event"` al par `type` + `sponsored`.
//
// ── QUÉ CAMBIÓ Y POR QUÉ HAY QUE MIGRAR ─────────────────────────────────────
// `kind` mezclaba dos preguntas en un campo: QUÉ es el contenido y SI ALGUIEN
// PAGÓ. Con eso, una publicidad no podía ser nada en particular —era "ad"— así
// que la pantalla no tenía forma de mandarla a la sección que le corresponde.
// Ahora `type` dice qué es y `sponsored` dice si se paga, por separado.
//
// El modelo ya no conoce `kind`. Una campaña vieja sin `type` toma el default
// del esquema ("event") en cuanto alguien la guarde, así que sin esta migración
// una vinoteca paga cargada como "ad" terminaría anunciada como evento. Por eso
// se corre una vez y de una.
//
// ── CÓMO SE DECIDE EL TIPO ──────────────────────────────────────────────────
//   kind "event"                 → type "event"          (era literal)
//   kind "ad"  + tiene eventAt   → type "event"          (una feria auspiciada)
//   kind "ad"  sin eventAt       → type "wineShop"       (ver abajo)
//
// La última es la única que ADIVINA, y conviene saberlo: una publicidad sin
// fecha de evento es, en la práctica, un anunciante —una vinoteca, una bodega—
// y "wineShop" es el destino más probable y el más fácil de corregir después
// desde el panel. El script imprime una por una cuáles cayeron ahí para que se
// puedan revisar; con `--dry` las lista sin escribir nada.
//
// `sponsored` se preserva tal cual venía, y se fuerza a true en los "ad" por si
// alguno quedó sin la marca: lo que era pago sigue siendo pago, y una campaña
// paga que pierde su cartel es el único error acá que no se puede deshacer
// mirando la pantalla.
//
//   node scripts/migratePromotionTypes.js --dry     ver qué haría, sin escribir
//   node scripts/migratePromotionTypes.js           aplicar

const dotenv = require("dotenv");
const connectToDatabase = require("../src/config/db");
const Promotion = require("../src/models/promotion.model");

dotenv.config();

const dryRun = process.argv.includes("--dry");

const TIPOS = ["event", "wineShop", "winery", "article", "course", "video"];

const run = async () => {
  await connectToDatabase();

  // `.lean()` sobre la colección cruda: `kind` ya no está en el esquema, así que
  // un `find()` normal de Mongoose no lo devolvería y este script no tendría con
  // qué decidir.
  const campañas = await Promotion.collection.find({}).toArray();

  const resumen = { eventos: 0, tiendas: 0, intactas: 0, adivinadas: [] };
  const ops = [];

  for (const c of campañas) {
    // Ya migrada (tiene un `type` válido y no le quedó `kind`): no se toca.
    if (TIPOS.includes(c.type) && c.kind === undefined) {
      resumen.intactas += 1;
      continue;
    }

    const eraPublicidad = c.kind === "ad";
    const tieneFechaDeEvento = Boolean(c.eventAt);

    let type;
    if (!eraPublicidad) type = "event";
    else if (tieneFechaDeEvento) type = "event";
    else type = "wineShop";

    if (type === "wineShop") {
      resumen.tiendas += 1;
      resumen.adivinadas.push(c.title || String(c._id));
    } else {
      resumen.eventos += 1;
    }

    ops.push({
      updateOne: {
        filter: { _id: c._id },
        update: {
          // Lo pago sigue pago. Ver la nota de arriba.
          $set: { type, sponsored: eraPublicidad ? true : Boolean(c.sponsored) },
          $unset: { kind: "" },
        },
      },
    });
  }

  /**
   * `Promotion.collection.bulkWrite` (driver crudo) y NO `Promotion.bulkWrite`
   * (el del modelo).
   *
   * El del modelo castea el update contra el esquema en modo estricto, y `kind`
   * ya no está en el esquema: Mongoose descartaba el `$unset` sin decir nada. El
   * resultado era el peor tipo de éxito parcial — `type` y `sponsored` quedaban
   * bien escritos, `kind: "ad"` sobrevivía, y el script informaba que había
   * migrado todo. Al volver a correrlo decía "0 ya estaban migradas" sobre
   * documentos que sí tenían su tipo nuevo.
   *
   * La lectura de arriba usa `.collection` por la misma razón (leer un campo que
   * el esquema no conoce). Escribir tiene que ir por el mismo lado.
   */
  if (ops.length > 0 && !dryRun) await Promotion.collection.bulkWrite(ops, { ordered: false });

  console.log(`
  ${resumen.eventos} campaña(s) → type "event"
  ${resumen.tiendas} campaña(s) → type "wineShop"
  ${resumen.intactas} ya estaban migradas
`);

  if (resumen.adivinadas.length > 0) {
    console.log("  REVISAR — publicidades sin fecha de evento, puestas como vinoteca:");
    for (const t of resumen.adivinadas) console.log(`    · ${t}`);
    console.log("  Si alguna era otra cosa (una bodega, una nota), cambiale el tipo en el panel.\n");
  }

  if (dryRun) console.log("  Nada de esto se escribió. Corré sin --dry para aplicarlo.\n");
};

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error en la migración:", error.message);
    process.exit(1);
  });
