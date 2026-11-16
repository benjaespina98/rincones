// Saca la uva del nombre de los vinos ya cargados.
//
// Hasta ahora el nombre visible se componía como "<línea> <varietal>", así que
// en la bodega el vino figuraba como "Saint Felicien Malbec". Pero el vino se
// llama "Saint Felicien": que sea Malbec es otro dato, y uno que la ficha ya
// muestra en su propio chip. El composer nuevo (ver src/data/wineIdentity.js) ya
// no la pega; esto acomoda lo que quedó guardado con la regla vieja.
//
// QUÉ HACE, exactamente:
//   name: "Saint Felicien Malbec" + varietal: "Malbec"  →  name: "Saint Felicien"
//   line vacío                                          →  line: "Saint Felicien"
//
// La uva NO se pierde: sigue en `varietal`, que es su campo, y entra igual en la
// búsqueda (el buscador exige que cada palabra aparezca en ALGÚN campo, así que
// "saint felicien malbec" sigue encontrando el vino).
//
// Sólo toca lo que es seguro tocar:
//   - el nombre tiene que TERMINAR con la uva (comparando sin acentos ni
//     mayúsculas): "Saint Felicien Malbec" sí, "Malbec Reserva" no;
//   - tiene que quedar algo después de sacarla: un vino que se llama sólo
//     "Malbec" se deja como está, porque vaciarlo lo dejaría sin nombre.
//
// Es idempotente: correrlo dos veces no cambia nada la segunda.
//
//   node scripts/migrateWineNames.js --dry     ver qué haría, sin escribir
//   node scripts/migrateWineNames.js           aplicar

const dotenv = require("dotenv");
const connectToDatabase = require("../src/config/db");
const { modoMigracion } = require("./lib/modoMigracion");
const Wine = require("../src/models/wine.model");
const { fold } = require("../src/data/argentineWines");

dotenv.config();

const LOTE = 500; // vinos por bulkWrite

/**
 * El nombre sin la uva del final, o null si no hay nada seguro que sacar.
 *
 * Se compara por tokens y no por substring: recortar caracteres a ojo dejaría
 * "Saint Felicien Cabernet Sauvignon" convertido en "Saint Felicien Cabernet"
 * si la uva guardada fuera sólo "Sauvignon".
 */
const nombreSinUva = (name, varietal) => {
  const nombre = String(name || "").trim();
  const uva = String(varietal || "").trim();
  if (!nombre || !uva) return null;

  const tokensNombre = nombre.split(/\s+/);
  const tokensUva = uva.split(/\s+/);
  if (tokensNombre.length <= tokensUva.length) return null;

  const cola = tokensNombre.slice(-tokensUva.length);
  if (fold(cola.join(" ")) !== fold(uva)) return null;

  const recortado = tokensNombre.slice(0, -tokensUva.length).join(" ").trim();
  return recortado || null;
};

const run = async () => {
  const { dry: dryRun } = modoMigracion();

  await connectToDatabase();

  const total = await Wine.countDocuments();
  console.log(`\n${total} vino(s) en la base.${dryRun ? "  [SIMULACRO — no se escribe nada]" : ""}\n`);

  const resumen = { renombrados: 0, lineaCompletada: 0, intactos: 0 };
  let pendientes = [];

  const aplicar = async () => {
    if (pendientes.length === 0) return;
    if (!dryRun) await Wine.bulkWrite(pendientes, { ordered: false });
    pendientes = [];
  };

  const cursor = Wine.find({}, { name: 1, line: 1, varietal: 1 }).lean().cursor();

  for await (const vino of cursor) {
    const nuevo = nombreSinUva(vino.name, vino.varietal);
    const lineaVacia = !String(vino.line || "").trim();

    if (!nuevo) {
      // Aunque el nombre ya esté bien, si `line` está vacío conviene llenarlo:
      // es lo que usa la deduplicación para saber que dos cargas del mismo vino
      // son el mismo vino, sin tener que recortar substrings del nombre.
      if (lineaVacia && String(vino.name || "").trim()) {
        pendientes.push({
          updateOne: {
            filter: { _id: vino._id },
            update: { $set: { line: String(vino.name).trim() } },
          },
        });
        resumen.lineaCompletada += 1;
      } else {
        resumen.intactos += 1;
      }
      if (pendientes.length >= LOTE) await aplicar();
      continue;
    }

    console.log(`  "${vino.name}"  →  "${nuevo}"   (uva: ${vino.varietal})`);

    const cambios = { name: nuevo };
    if (lineaVacia) cambios.line = nuevo;

    pendientes.push({ updateOne: { filter: { _id: vino._id }, update: { $set: cambios } } });
    resumen.renombrados += 1;

    if (pendientes.length >= LOTE) await aplicar();
  }

  await aplicar();

  console.log(`
  ${resumen.renombrados} vino(s) renombrado(s) (se les sacó la uva del nombre)
  ${resumen.lineaCompletada} con "line" completado
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
