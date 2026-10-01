const User = require("../models/user.model");
const Wine = require("../models/wine.model");
const WineWish = require("../models/wineWish.model");
const WineMoment = require("../models/wineMoment.model");
const WineReview = require("../models/wineReview.model");
const SommelierConversation = require("../models/sommelierConversation.model");

/**
 * Llevarse los datos propios.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * Alguien carga doscientas botellas, con lo que pagó por cada una, dónde la
 * guarda, con quién la tomó y qué le pareció. Eso es trabajo suyo, de años. Si
 * la única forma de sacarlo de acá es a mano, la app deja de ser una bodega
 * personal y pasa a ser un lugar donde los datos entran y no salen.
 *
 * Es además la otra mitad de la baja de cuenta: borrar sin poder exportar antes
 * obliga a elegir entre irse y conservar lo propio.
 *
 * ── EL MISMO INVENTARIO QUE EL BORRADO ──────────────────────────────────────
 * Las dos listas de colecciones tienen que coincidir. Si una colección se
 * exporta y no se borra, queda un dato que se prometió eliminar; si se borra y
 * no se exporta, alguien pierde algo sin enterarse. Hay un test que compara las
 * dos (accountExport.test.js) justamente para que no se desincronicen.
 *
 * Queda afuera lo que no es dato personal: el catálogo comunitario, la caché de
 * etiquetas y los precios de referencia son anónimos y compartidos. También la
 * auditoría y los logs, que son de operación.
 *
 * ── Y LOS EVENTOS DE ANALÍTICA? ─────────────────────────────────────────────
 * Se borran con la cuenta pero NO se exportan. No es un olvido: son telemetría
 * —"abrió la pantalla X a tal hora"— que nadie pidió generar y que no le sirve
 * a nadie en un archivo. Exportarla sería devolverle a la persona un registro
 * de vigilancia de sí misma con forma de regalo.
 */

/** Saca los campos internos que no significan nada fuera de la base. */
const limpiar = (doc) => {
  const { __v, userId, user, ...resto } = doc;
  return resto;
};

/**
 * Todo lo que una persona cargó, en un objeto serializable.
 *
 * `lean()` en todas: son documentos para escribir a un archivo, no para
 * modificar, y los de Mongoose traen toda su maquinaria encima.
 */
const exportAccount = async (userId) => {
  const user = await User.findById(userId)
    .select("-passwordHash -resetPasswordToken -resetPasswordExpires -emailVerificationToken")
    .lean();

  if (!user) return null;

  const [wines, wishes, moments, reviews, conversations] = await Promise.all([
    Wine.find({ userId }).lean(),
    WineWish.find({ userId }).lean(),
    WineMoment.find({ userId }).lean(),
    WineReview.find({ userId }).lean(),
    SommelierConversation.find({ userId }).lean(),
  ]);

  return {
    /**
     * La cabecera dice qué es esto y de cuándo, porque un JSON suelto en la
     * carpeta de descargas dentro de dos años no se explica solo.
     */
    exportadoEl: new Date().toISOString(),
    app: "Rincones",
    formato: 1,
    cuenta: limpiar(user),
    vinos: wines.map(limpiar),
    quieroProbar: wishes.map(limpiar),
    momentos: moments.map(limpiar),
    resenas: reviews.map(limpiar),
    consultasAlSommelier: conversations.map(limpiar),
    /* Los números de arriba, contados. Sirve para verificar de un vistazo que
       el archivo está completo sin tener que leerlo entero. */
    resumen: {
      vinos: wines.length,
      quieroProbar: wishes.length,
      momentos: moments.length,
      resenas: reviews.length,
      consultasAlSommelier: conversations.length,
    },
  };
};

/** Las colecciones que se exportan. El test compara esta lista con la del borrado. */
const COLECCIONES_EXPORTADAS = ["Wine", "WineWish", "WineMoment", "WineReview", "SommelierConversation"];

module.exports = { exportAccount, COLECCIONES_EXPORTADAS, limpiar };
