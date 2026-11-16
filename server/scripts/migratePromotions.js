// Pone al día las campañas cargadas antes del gestor de campañas.
//
// Dos cosas que las campañas viejas no tienen:
//
// 1. `sortDate`. Es la clave de orden secundaria que permite que MONGO ordene el
//    carrusel (antes se ordenaba en memoria trayendo todo lo vigente). Vale
//    `eventAt`, o una fecha lejanísima cuando la campaña no tiene fecha de evento,
//    que es lo que la deja al final de su grupo de prioridad. Sin este campo, una
//    campaña vieja ordena como si tuviera la fecha más próxima de todas y se cuela
//    adelante de las que sí la tienen.
//
// 2. Fin de vigencia a la medianoche UTC. Un "hasta el 31 de diciembre" cargado
//    antes se guardó como 2026-12-31T00:00:00Z, o sea las 21:00 del 30 en
//    Argentina: la campaña se apagaba 27 horas antes de lo pactado. Los fines que
//    están exactamente a medianoche UTC se corren al final del día calendario
//    argentino, que es lo que quiso decir quien los cargó.
//
// Nada de esto es obligatorio para que la app funcione —el modelo recalcula
// `sortDate` en cada guardado y el orden de una campaña sin fecha de evento es un
// detalle— pero deja el dato coherente sin esperar a que alguien edite cada
// campaña a mano.
//
//   node scripts/migratePromotions.js --dry     ver qué haría, sin escribir
//   node scripts/migratePromotions.js           aplicar

const dotenv = require("dotenv");
const connectToDatabase = require("../src/config/db");
const { modoMigracion } = require("./lib/modoMigracion");
const Promotion = require("../src/models/promotion.model");
const { parseFecha, aFechaInput } = require("../src/utils/promotionState");

dotenv.config();

const SIN_FECHA_DE_EVENTO = new Date("3000-01-01T00:00:00.000Z");
const { dry: dryRun } = modoMigracion();

/** ¿Este fin quedó guardado a la medianoche UTC, o sea 21:00 del día anterior? */
const esMedianocheUTC = (fecha) =>
  fecha instanceof Date &&
  fecha.getUTCHours() === 0 &&
  fecha.getUTCMinutes() === 0 &&
  fecha.getUTCSeconds() === 0 &&
  fecha.getUTCMilliseconds() === 0;

const run = async () => {
  await connectToDatabase();

  const campañas = await Promotion.find({}).lean();
  const resumen = { orden: 0, fechas: 0, intactas: 0 };
  const ops = [];

  for (const c of campañas) {
    const cambios = {};

    const sortDate = c.eventAt || SIN_FECHA_DE_EVENTO;
    if (!c.sortDate || new Date(c.sortDate).getTime() !== new Date(sortDate).getTime()) {
      cambios.sortDate = sortDate;
      resumen.orden += 1;
    }

    if (c.endsAt && esMedianocheUTC(new Date(c.endsAt))) {
      // La fecha que quiso poner quien la cargó, leída en día argentino, y
      // reinterpretada como el día completo.
      const nuevo = parseFecha(aFechaInput(c.endsAt), "fin");
      if (nuevo && nuevo.getTime() !== new Date(c.endsAt).getTime()) {
        cambios.endsAt = nuevo;
        resumen.fechas += 1;
        console.log(
          `  ${c.title}: fin ${new Date(c.endsAt).toISOString()} → ${nuevo.toISOString()}`
        );
      }
    }

    if (Object.keys(cambios).length === 0) {
      resumen.intactas += 1;
      continue;
    }

    ops.push({ updateOne: { filter: { _id: c._id }, update: { $set: cambios } } });
  }

  if (ops.length > 0 && !dryRun) await Promotion.bulkWrite(ops, { ordered: false });

  console.log(`
  ${resumen.orden} campaña(s) con clave de orden nueva
  ${resumen.fechas} fin(es) de vigencia corregido(s) al día argentino completo
  ${resumen.intactas} ya estaban bien
`);
  if (dryRun) console.log("  Nada de esto se escribió. Corré con --aplicar para escribirlo (en producción, también --confirmo-destino=rincones).\n");
};

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error en la migración:", error.message);
    process.exit(1);
  });
