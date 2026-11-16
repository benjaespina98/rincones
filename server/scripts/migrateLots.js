// Le da su historial de lotes a los vinos que ya estaban cargados.
//
// Hasta ahora un vino guardaba un solo número: "8 botellas". Con los lotes ese
// número se desagrega por compra, y para los vinos viejos sólo hay una lectura
// honesta posible: todo lo que tenés entró el día que lo cargaste. Así que cada
// vino con stock recibe UN lote inicial:
//
//     { addedAt: createdAt del vino, quantity: su quantity, remaining: idem }
//
// `quantity` del lote es lo que entró y `remaining` lo que queda: arrancan
// iguales porque de un vino viejo no sabemos qué botellas se tomaron ni cuándo.
// De acá en adelante sí: cada consumo baja el `remaining` del lote más viejo y
// el lote agotado queda como historial.
//
// No se pierde nada y no cambia ningún total: el `quantity` del vino queda
// exactamente igual, y a partir de acá cada reposición suma su propio lote.
//
// Es idempotente: correrlo dos veces no duplica nada. Cubre tres casos —vinos
// sin lotes, lotes de la versión anterior (sin `remaining`) y, si alguna vez la
// invariante `quantity === suma de remaining` se rompiera, la reparación.
//
//   npm run migrate:lots -- --dry     ver qué haría, sin escribir
//   npm run migrate:lots              aplicar

const dotenv = require("dotenv");
const connectToDatabase = require("../src/config/db");
const { modoMigracion } = require("./lib/modoMigracion");
const Wine = require("../src/models/wine.model");
const { normalizeLots, reconcileLots, availableFromLots } = require("../src/utils/lots");

dotenv.config();

const LOTE = 500; // vinos por bulkWrite

const mismosLotes = (a, b) =>
  JSON.stringify((a || []).map((l) => [l.addedAt, l.quantity, l.remaining, l.depletedAt])) ===
  JSON.stringify((b || []).map((l) => [l.addedAt, l.quantity, l.remaining, l.depletedAt]));

const run = async () => {
  const { dry: dryRun } = modoMigracion();

  await connectToDatabase();

  const total = await Wine.countDocuments();
  console.log(`\n${total} vino(s) en la base.${dryRun ? "  [SIMULACRO — no se escribe nada]" : ""}\n`);

  const resumen = { inicial: 0, completados: 0, reparados: 0, sinStock: 0, intactos: 0 };
  let pendientes = [];

  const aplicar = async () => {
    if (pendientes.length === 0) return;
    if (!dryRun) await Wine.bulkWrite(pendientes, { ordered: false });
    pendientes = [];
  };

  const cursor = Wine.find({}, { lots: 1, quantity: 1, createdAt: 1, name: 1 }).lean().cursor();

  for await (const vino of cursor) {
    const lotes = Array.isArray(vino.lots) ? vino.lots : [];
    const cantidad = Number(vino.quantity) || 0;

    let nuevos;
    if (lotes.length === 0) {
      // El caso principal: el vino nunca tuvo lotes.
      nuevos = normalizeLots([], { quantity: cantidad, createdAt: vino.createdAt });
      if (nuevos.length > 0) resumen.inicial += 1;
      else resumen.sinStock += 1;
    } else {
      // Completa lo que falte: `remaining` en los lotes escritos por la versión
      // anterior (donde `quantity` era lo disponible, no lo que entró).
      nuevos = normalizeLots(lotes, { createdAt: vino.createdAt });

      if (availableFromLots(nuevos) !== cantidad) {
        // No debería ocurrir: el modelo y los updates atómicos sostienen la
        // invariante. Si ocurrió, `quantity` es la fuente de verdad (es lo que
        // ve el usuario en la app) y los lotes se acomodan a ella.
        console.log(
          `  reparado  ${vino.name}: los lotes dejaban ${availableFromLots(nuevos)}, quantity ${cantidad}`
        );
        nuevos = reconcileLots(nuevos, cantidad, { createdAt: vino.createdAt });
        resumen.reparados += 1;
      } else if (mismosLotes(lotes, nuevos)) {
        resumen.intactos += 1;
        continue;
      } else {
        resumen.completados += 1;
      }
    }

    pendientes.push({
      updateOne: {
        filter: { _id: vino._id },
        // `quantity` se reescribe con lo que queda en los lotes: es el mismo
        // número, y dejarlo explícito hace que el documento salga de la
        // migración consistente aunque el vino tuviera datos raros.
        update: { $set: { lots: nuevos, quantity: availableFromLots(nuevos) } },
      },
    });

    if (pendientes.length >= LOTE) await aplicar();
  }

  await aplicar();

  console.log(`
  ${resumen.inicial} vino(s) con lote inicial nuevo
  ${resumen.completados} lote(s) completado(s) con "remaining"
  ${resumen.sinStock} sin stock (quedan sin lotes)
  ${resumen.reparados} reparado(s)
  ${resumen.intactos} ya estaban bien
`);
  if (dryRun) console.log("  Nada de esto se escribió. Corré con --aplicar para escribirlo (en producción, también --confirmo-destino=rincones).\n");
};

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error en la migración:", error.message);
    process.exit(1);
  });
