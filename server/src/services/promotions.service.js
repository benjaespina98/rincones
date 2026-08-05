const crypto = require("crypto");
const mongoose = require("mongoose");
const Promotion = require("../models/promotion.model");
const PromotionStat = require("../models/promotionStat.model");
const PromotionView = require("../models/promotionView.model");
const ChangeLog = require("../models/changeLog.model");
const imageStorage = require("./imageStorage.service");
const {
  ESTADOS,
  parseFecha,
  aFechaInput,
  diaDe,
  estadoDe,
  urlSegura,
  imagenSegura,
  esImagenSubida,
  colorSeguro,
} = require("../utils/promotionState");

/**
 * El gestor de campañas del espacio destacado de Descubrí.
 *
 * ── LAS DOS REGLAS DE ORO ───────────────────────────────────────────────────
 * 1. Lo que no está al aire NO SALE, y eso lo decide la consulta con la fecha del
 *    momento, no una revisión manual. Una campaña que venció el domingo a la noche
 *    está apagada el domingo a la noche.
 * 2. El estado que ve el administrador es EL MISMO que aplica la consulta. Se
 *    calcula una sola vez (utils/promotionState.js) y viaja resuelto al panel. Un
 *    panel que dice "Activa" sobre algo que la app no muestra es peor que no tener
 *    panel.
 *
 * ── QUÉ SE PENSÓ PARA QUE ESTO CREZCA ───────────────────────────────────────
 *  - La consulta pública se resuelve con un índice que cubre filtro + orden +
 *    límite: toca seis documentos, no todos los vigentes. Cuesta lo mismo con
 *    veinte campañas que con veinte mil.
 *  - Encima hay una caché de proceso de pocos segundos, que se invalida sola en
 *    cuanto se toca cualquier campaña. Descubrí es la pantalla de entrada: sin
 *    esto, cada visitante paga una consulta para leer un contenido que cambia una
 *    vez por semana.
 *  - Las métricas entran EN LOTE y en dos escrituras masivas, no en una petición
 *    por tarjeta. Seis tarjetas × cada visitante era seis veces el tráfico de la
 *    portada para contar cosas.
 *  - El panel pagina. Una lista completa anda perfecto con quince campañas y deja
 *    de abrir con mil quinientas, que es exactamente el momento en que el panel
 *    más importa.
 */

/** Cuántas tarjetas se le mandan al carrusel. Más que esto nadie las ve. */
const MAX_PUBLICAS = 6;

/** Cuántas campañas trae una página del panel. */
const POR_PAGINA = 25;

/** Cuántos eventos de métrica acepta una sola petición. */
const MAX_EVENTOS_POR_LOTE = 24;

/**
 * Cuánto vive la caché de la portada.
 *
 * Corto a propósito. El requisito es que prender o apagar una campaña se vea
 * "inmediatamente", y la invalidación en cuanto se guarda un cambio da justamente
 * eso en el proceso que atendió el cambio. Estos segundos son el techo del atraso
 * en el escenario que la invalidación no cubre: varias instancias del server
 * atendiendo en paralelo, donde la que no recibió el cambio sigue con su copia.
 * Ocho segundos de atraso en el peor caso es un precio razonable por no consultar
 * la base en cada visita; un minuto no lo sería.
 */
const CACHE_MS = 8000;

let cache = { hasta: 0, datos: null, version: 0 };

/**
 * Tira la caché.
 *
 * Se llama en cada escritura del panel —crear, editar, pausar, reordenar,
 * borrar—. Es la mitad de "el cambio se refleja inmediatamente": sin esto, apagar
 * una campaña la dejaría a la vista hasta que la caché venciera sola, y el
 * administrador tocaría el interruptor dos o tres veces convencido de que no
 * funciona.
 */
const invalidar = () => {
  cache = { hasta: 0, datos: null, version: cache.version + 1 };
};

// ── Lo que ve el visitante ─────────────────────────────────────────────────

/**
 * Las campañas al aire, en orden.
 *
 * El orden es: prioridad (lo pactado manda), después el evento más próximo —una
 * feria de la semana que viene interesa más que una de noviembre— y al final lo
 * más nuevo. Las que no tienen fecha de evento no se cuelan adelante: `sortDate`
 * las guarda con una fecha lejanísima, así que caen al final de su grupo de
 * prioridad sin ningún caso especial acá.
 *
 * Todo el trabajo lo hace Mongo con el índice de promotion.model.js. Antes esto
 * traía todo lo vigente y ordenaba en memoria, que es la clase de código que
 * funciona perfecto hasta el día que hay volumen y entonces falla en la pantalla
 * de entrada de la app.
 */
const consultarAlAire = async (now) =>
  Promotion.find({
    active: true,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  })
    .select("-createdBy -impressions -clicks -reach -clickReach -reportToken -sortDate -updatedAt")
    .sort({ priority: -1, sortDate: 1, createdAt: -1 })
    .limit(MAX_PUBLICAS)
    .lean();

const listPublic = async (now = new Date()) => {
  const ahora = Date.now();
  if (cache.datos && cache.hasta > ahora) return cache.datos;

  const datos = await consultarAlAire(now);
  cache = { hasta: ahora + CACHE_MS, datos, version: cache.version };
  return datos;
};

// ── Métricas ───────────────────────────────────────────────────────────────

const esId = (valor) => mongoose.Types.ObjectId.isValid(String(valor || ""));

/**
 * Registra un lote de impresiones y clics.
 *
 * NUNCA lanza: no medir una impresión no puede romperle la pantalla a nadie ni
 * cortarle la navegación a quien está yendo al sitio del anunciante.
 *
 * ── LAS TRES COSAS QUE HACE Y ANTES NO SE HACÍAN ────────────────────────────
 *
 * 1. SÓLO CUENTA CAMPAÑAS QUE ESTÁN AL AIRE. El endpoint es público (lo tiene que
 *    ser: lo llama el visitante, con o sin sesión), así que cualquiera podía
 *    mandar el id de una campaña vencida —o de cualquier documento— y sumarle
 *    impresiones. Ahora el lote se cruza contra las que efectivamente se están
 *    mostrando, que además ya están en la caché: el control no cuesta una consulta.
 *
 * 2. DEDUPLICA POR PERSONA. `impressions` sigue contando veces mostrada, y `reach`
 *    cuenta personas distintas por día vía el índice único de
 *    promotionView.model.js. Son dos números que responden dos preguntas
 *    diferentes, y hasta ahora sólo existía el que se puede inflar.
 *
 * 3. ESCRIBE EN DOS OPERACIONES, NO EN 2N. Todo el lote se resuelve con un
 *    `bulkWrite` por colección, sin importar cuántas tarjetas trajo. Una visita a
 *    Descubrí pasa de seis peticiones y doce escrituras a una petición y tres
 *    escrituras.
 */
const recordEvents = async ({ entries = [], visitorHash = "", now = new Date() } = {}) => {
  try {
    const lote = (Array.isArray(entries) ? entries : [])
      .map((e) => ({
        id: String(e?.id || ""),
        type: e?.type === "click" ? "click" : "impression",
      }))
      .filter((e) => esId(e.id))
      .slice(0, MAX_EVENTOS_POR_LOTE);

    if (lote.length === 0) return { accepted: 0 };

    // Sólo lo que el visitante realmente pudo haber visto. Ver el punto 1 de arriba.
    const alAire = new Set((await listPublic(now)).map((p) => String(p._id)));
    const validos = lote.filter((e) => alAire.has(e.id));
    if (validos.length === 0) return { accepted: 0 };

    const day = diaDe(now);

    // Un mismo id puede venir dos veces en el lote (una impresión y un clic).
    const porId = new Map();
    for (const e of validos) {
      const actual = porId.get(e.id) || { impressions: 0, clicks: 0 };
      if (e.type === "click") actual.clicks += 1;
      else actual.impressions += 1;
      porId.set(e.id, actual);
    }

    /**
     * Personas distintas: se marca la vista y se cuenta cuántas marcas eran nuevas.
     *
     * Es un `upsert` y no un `insert` a propósito. La pregunta "¿esta persona ya
     * vio esta campaña hoy?" la responde la base en la misma operación que la
     * escribe: `upsertedIds` trae exactamente las marcas que no existían. Con un
     * insert habría que leer el error de clave duplicada para deducir lo mismo, y
     * con una consulta previa habría una carrera con dos pestañas abiertas.
     */
    let nuevas = new Set();
    if (visitorHash) {
      const marcas = [...porId.entries()]
        .filter(([, v]) => v.impressions > 0)
        .map(([id]) => ({ promotion: id, day, visitorHash }));

      if (marcas.length > 0) {
        try {
          const res = await PromotionView.bulkWrite(
            marcas.map((m) => ({
              updateOne: {
                filter: m,
                update: { $setOnInsert: { ...m, createdAt: now } },
                upsert: true,
              },
            })),
            { ordered: false }
          );
          nuevas = new Set(
            Object.keys(res?.upsertedIds || {}).map((i) => String(marcas[Number(i)]?.promotion))
          );
        } catch {
          // Si la deduplicación no se pudo escribir, se sigue sin contar alcance:
          // es mejor que `reach` quede corto que frenar la impresión, que es el
          // número que sí tiene que estar.
        }
      }
    }

    /**
     * Personas distintas que TOCARON, no toques.
     *
     * Sin esto el panel dividía clics sin deduplicar sobre impresiones contadas
     * una vez por visita, y mostraba efectividades del 130%: un porcentaje que no
     * puede existir, y que delataba que arriba y abajo de la fracción se estaban
     * contando cosas distintas.
     *
     * La marca vive en el mismo documento que ya deduplica las vistas, así que no
     * hay colección nueva ni índice nuevo. Se hace de a una y no en lote porque
     * hace falta saber, por campaña, si esta persona ya había tocado hoy —dato que
     * un bulkWrite sólo devuelve sumado— y porque una persona toca una tarjeta por
     * vez: el lote de clics es de uno.
     */
    const clickers = new Set();
    if (visitorHash) {
      for (const [id, v] of porId.entries()) {
        if (!v.clicks) continue;
        try {
          const r = await PromotionView.updateOne(
            { promotion: id, day, visitorHash },
            {
              $setOnInsert: { promotion: id, day, visitorHash, createdAt: now },
              $set: { clicked: true },
            },
            { upsert: true }
          );
          // Entró una marca nueva, o existía sin tocar y recién ahora se tocó.
          if (r.upsertedCount === 1 || r.modifiedCount === 1) clickers.add(id);
        } catch {
          // Igual que con el alcance: si la marca no se pudo escribir, el clic se
          // cuenta igual. Perder el clic es peor que perder su deduplicación.
        }
      }
    }

    const opsPromo = [];
    const opsStats = [];

    for (const [id, v] of porId.entries()) {
      const reach = nuevas.has(id) ? 1 : 0;
      const inc = {};
      if (v.impressions) inc.impressions = v.impressions;
      if (v.clicks) inc.clicks = v.clicks;
      if (reach) inc.reach = reach;
      if (clickers.has(id)) inc.clickReach = 1;
      if (Object.keys(inc).length === 0) continue;

      opsPromo.push({ updateOne: { filter: { _id: id }, update: { $inc: inc } } });
      opsStats.push({
        updateOne: {
          filter: { promotion: id, day },
          update: { $inc: inc, $set: { updatedAt: now } },
          upsert: true,
        },
      });
    }

    if (opsPromo.length > 0) {
      await Promise.all([
        Promotion.bulkWrite(opsPromo, { ordered: false }),
        PromotionStat.bulkWrite(opsStats, { ordered: false }),
      ]);
    }

    return { accepted: validos.length };
  } catch {
    // Ver arriba: medir es una mejora, nunca un requisito de la navegación.
    return { accepted: 0 };
  }
};

/** Debajo de esto, el porcentaje es ruido: 1 de 3 no es "33% de efectividad". */
const MINIMO_PARA_UN_PORCENTAJE = 20;

/**
 * Qué proporción de la gente que vio la campaña la tocó.
 *
 * ── EL 130% ─────────────────────────────────────────────────────────────────
 * Antes esto era `clics / impresiones`, y llegó a mostrar 130%. No era un error
 * de cuentas: era que arriba y abajo se contaban cosas distintas. Las impresiones
 * se deduplican —una por tarjeta y por visita, y sólo si estuvo un segundo a la
 * vista—, mientras que los clics se sumaban todos. Alguien probando su campaña y
 * tocándola veinte veces generaba veinte clics sobre tres impresiones.
 *
 * Un porcentaje mayor a 100 no es sólo feo: le avisa al anunciante que los números
 * no se pueden comparar entre sí, y a partir de ahí no hay razón para creerle a
 * ninguno de los otros.
 *
 * Ahora los dos lados cuentan PERSONAS: cuánta gente la tocó sobre cuánta gente la
 * vio. Es la pregunta que quiere hacer alguien que paga, y no puede pasar de 100.
 * El `Math.min` es un cinturón por si un clic entra sin su impresión previa.
 */
const efectividad = (promo) => {
  const gente = promo.reach || 0;
  if (gente < MINIMO_PARA_UN_PORCENTAJE) return null;
  const tocaron = Math.min(promo.clickReach || 0, gente);
  return Math.round((tocaron / gente) * 1000) / 10;
};

// ── Panel ──────────────────────────────────────────────────────────────────

/**
 * Lo que el panel necesita de una campaña: sus datos, su estado ya resuelto, sus
 * números y las fechas en el formato que espera el formulario.
 *
 * Las fechas se devuelven convertidas acá y no en el navegador por la misma razón
 * que el estado: son la misma conversión que hizo el server al guardarlas, y
 * hacerla dos veces en dos lenguajes distintos termina con el formulario
 * mostrando un día menos del que se cargó.
 */
const paraPanel = (promo, ahora) => {
  const estado = estadoDe(promo, ahora);

  const { reportToken, ...visible } = promo;

  return {
    ...visible,
    state: estado,
    stateLabel: ESTADOS[estado].label,
    stateHint: ESTADOS[estado].hint,
    ctr: efectividad(promo),
    // Si la campaña tiene un informe compartido. Va el booleano y NUNCA el
    // token: el panel sólo necesita saber si hay enlace vivo para ofrecer
    // cortarlo, y un token que viaja de más es un token que se filtra de más.
    hasReport: Boolean(promo.reportToken),
    form: {
      startsAt: aFechaInput(promo.startsAt),
      endsAt: aFechaInput(promo.endsAt),
      eventAt: aFechaInput(promo.eventAt),
    },
  };
};

/**
 * El listado del panel: paginado, filtrable por estado y con el resumen de cuántas
 * hay en cada uno.
 *
 * El filtro por estado se aplica DESPUÉS de traer la página porque "Activa" no es
 * un campo: es una función de `active` y de dos fechas contra la hora actual, y
 * escribirla como consulta de Mongo la duplicaría (ver la regla de oro 2). El
 * resumen sí se cuenta sobre todas, con una agregación que no trae documentos.
 */
const listAll = async ({ page = 1, limit = POR_PAGINA, state = "", q = "", kind = "" } = {}) => {
  const ahora = new Date();
  const porPagina = Math.min(Math.max(Number(limit) || POR_PAGINA, 1), 100);
  const pagina = Math.max(Number(page) || 1, 1);

  const filtro = {};
  // Publicidades y eventos comparten el espacio en la app —con su cartel cada uno—
  // pero en el panel se administran distinto: lo pago tiene alguien esperando un
  // informe del otro lado. Por eso acá sí se pueden separar.
  if (kind === "ad" || kind === "event") filtro.kind = kind;
  const busqueda = String(q || "").trim();
  if (busqueda) {
    // `escapeRegExp`: el texto lo escribe una persona en un buscador, y un "(" suelto
    // haría fallar la consulta entera con un error de expresión inválida.
    const seguro = busqueda.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 60);
    filtro.$or = [
      { title: { $regex: seguro, $options: "i" } },
      { "sponsor.name": { $regex: seguro, $options: "i" } },
    ];
  }

  const [filas, total] = await Promise.all([
    Promotion.find(filtro)
      // EL MISMO orden que usa la app y el mismo que usan las flechas de reorden.
      // Si el panel ordenara distinto, subir una campaña un lugar la movería
      // respecto de una lista que el administrador no está viendo: la flecha haría
      // algo correcto y aparentemente arbitrario, que es la peor combinación.
      .sort({ priority: -1, sortDate: 1, createdAt: -1 })
      .skip((pagina - 1) * porPagina)
      .limit(porPagina)
      .lean(),
    Promotion.countDocuments(filtro),
  ]);

  const items = filas.map((p) => paraPanel(p, ahora));
  const filtrados = state && ESTADOS[state] ? items.filter((i) => i.state === state) : items;

  return {
    items: filtrados,
    page: pagina,
    pages: Math.max(Math.ceil(total / porPagina), 1),
    total,
    // El resumen respeta el filtro por tipo: los contadores SON los botones de
    // estado, así que si dicen otro número que el de la lista que se está viendo,
    // el panel se contradice solo.
    summary: await resumenPorEstado(ahora, filtro.kind ? { kind: filtro.kind } : {}),
  };
};

/**
 * Cuántas campañas hay en cada estado.
 *
 * Se cuenta con `countDocuments` sobre las mismas condiciones que definen cada
 * estado, no trayendo documentos: el resumen tiene que seguir costando lo mismo
 * cuando haya miles de campañas cargadas. Son cuatro conteos en paralelo y los
 * cuatro pegan en el índice.
 */
const resumenPorEstado = async (ahora = new Date(), base = {}) => {
  const vencida = { ...base, endsAt: { $ne: null, $lt: ahora } };
  const noVencida = { ...base, $or: [{ endsAt: null }, { endsAt: { $gte: ahora } }] };

  const [ended, paused, scheduled, active, total] = await Promise.all([
    Promotion.countDocuments(vencida),
    Promotion.countDocuments({ ...noVencida, active: false }),
    Promotion.countDocuments({ ...noVencida, active: true, startsAt: { $ne: null, $gt: ahora } }),
    Promotion.countDocuments({
      ...noVencida,
      active: true,
      $and: [{ $or: [{ startsAt: null }, { startsAt: { $lte: ahora } }] }],
    }),
    Promotion.countDocuments(base),
  ]);

  return { active, scheduled, paused, ended, total };
};

const CAMPOS_TEXTO = ["kind", "title", "summary", "ctaLabel"];

const aBooleano = (valor) => valor === true || valor === "true";

/**
 * Toma sólo lo que se puede editar y lo deja en condiciones de guardarse.
 *
 * Lo que NO entra nunca desde el body: los contadores (`impressions`, `clicks`,
 * `reach`) y la auditoría (`createdBy`). Que un contador se pueda escribir desde
 * una petición convierte a las estadísticas en algo que no se puede presentar.
 *
 * Las URLs y el color se validan acá además de en el modelo, para poder devolver
 * un mensaje que diga QUÉ campo está mal en vez del error genérico de Mongoose.
 */
const saneado = (payload = {}) => {
  const datos = {};
  const errores = [];

  for (const campo of CAMPOS_TEXTO) {
    if (payload[campo] === undefined) continue;
    datos[campo] = typeof payload[campo] === "string" ? payload[campo].trim() : payload[campo];
  }

  if (payload.kind !== undefined && !["ad", "event"].includes(datos.kind)) {
    errores.push("El tipo tiene que ser publicidad o evento");
  }

  if (payload.url !== undefined) {
    const url = urlSegura(payload.url);
    if (url === null) errores.push('El enlace tiene que empezar con "https://" o con "/"');
    else datos.url = url;
  }

  if (payload.image !== undefined) {
    const image = imagenSegura(payload.image);
    if (image === null) errores.push("La imagen tiene que ser una URL que empiece con https://");
    else datos.image = image;
  }

  if (payload.accent !== undefined) {
    const accent = colorSeguro(payload.accent);
    if (accent === null) errores.push("El color de acento no es un color válido (probá #c6465f)");
    else datos.accent = accent;
  }

  // Las fechas se interpretan en día calendario argentino: "hasta el 31" incluye
  // el 31 completo. Ver utils/promotionState.js.
  if (payload.startsAt !== undefined) datos.startsAt = parseFecha(payload.startsAt, "inicio");
  if (payload.endsAt !== undefined) datos.endsAt = parseFecha(payload.endsAt, "fin");
  if (payload.eventAt !== undefined) datos.eventAt = parseFecha(payload.eventAt, "inicio");

  if (payload.active !== undefined) datos.active = aBooleano(payload.active);

  if (payload.priority !== undefined) {
    const n = Number.parseInt(payload.priority, 10);
    datos.priority = Number.isFinite(n) ? Math.min(Math.max(n, 0), 999) : 0;
  }

  if (payload.sponsor && typeof payload.sponsor === "object") {
    const logo = imagenSegura(payload.sponsor.logo);
    if (logo === null) errores.push("El logo tiene que ser una URL que empiece con https://");
    datos.sponsor = {
      name: String(payload.sponsor.name || "").trim().slice(0, 60),
      logo: logo || "",
    };
  }

  if (payload.place && typeof payload.place === "object") {
    datos.place = {
      city: String(payload.place.city || "").trim().slice(0, 60),
      venue: String(payload.place.venue || "").trim().slice(0, 80),
    };
  }

  // `sponsored` se puede marcar a mano en un evento (un evento auspiciado sigue
  // siendo contenido pago). Que una publicidad quede marcada NO depende de esto:
  // lo fuerza el modelo.
  if (payload.sponsored !== undefined) datos.sponsored = aBooleano(payload.sponsored);

  return { datos, errores };
};

/**
 * Sube a Cloudinary las imágenes que llegaron como archivo y deja la URL.
 *
 * ── POR QUÉ SE PUEDE SUBIR UN ARCHIVO Y NO SÓLO PEGAR UNA URL ───────────────
 * Porque así es como llega una imagen en la vida real: la bodega te manda el logo
 * por WhatsApp. Pedir una URL obliga a subir el archivo a otro lado primero —y a
 * que ese otro lado siga existiendo el año que viene, o la tarjeta se rompe sola—.
 * El enlace sigue estando para cuando el anunciante sí te pasa uno.
 *
 * Lo que se guarda en la base es SIEMPRE una URL, no el archivo: Cloudinary lo
 * reduce al recibirlo y lo sirve optimizado. Si Cloudinary no estuviera
 * configurado, `store` devuelve la imagen tal cual y queda dentro del documento
 * —más pesado, pero la campaña se carga igual—: el mismo criterio que usan las
 * fotos de los vinos.
 *
 * Va DESPUÉS de la validación: no tiene sentido subir un archivo de una campaña
 * que va a ser rechazada por otro campo.
 */
const guardarImagenes = async (datos) => {
  if (esImagenSubida(datos.image)) {
    datos.image = await imageStorage.store(datos.image, { folder: "rincones/promos" });
  }
  if (datos.sponsor && esImagenSubida(datos.sponsor.logo)) {
    datos.sponsor.logo = await imageStorage.store(datos.sponsor.logo, {
      folder: "rincones/promos/logos",
    });
  }
  return datos;
};

/** Un error de validación con el mensaje que hay que mostrarle a quien carga. */
const errorDeCarga = (mensaje) => {
  const error = new Error(mensaje);
  error.statusCode = 400;
  return error;
};

/**
 * Deja registro de quién tocó qué campaña.
 *
 * Un espacio comercial es exactamente el lugar donde alguna vez va a haber que
 * responder "¿por qué mi campaña estuvo apagada el martes?". Reutiliza el
 * `ChangeLog` que ya audita los vinos, con `entityType: "promotion"`. Nunca lanza:
 * el registro es importante, pero no tanto como que la operación se complete.
 */
const auditar = async (accion, promo, actor, antes = null) => {
  try {
    if (!actor?.email) return;
    await ChangeLog.create({
      entityType: "promotion",
      entityId: promo._id,
      action: accion,
      actor: { userId: actor.id, email: actor.email, role: actor.role || "admin" },
      before: antes,
      after: accion === "delete" ? null : resumenAuditable(promo),
    });
  } catch {
    // Sin ruido: no vale la pena hacer fallar un cambio de campaña por su log.
  }
};

/** Lo que vale la pena guardar de una campaña en el log: lo que cambia su entrega. */
const resumenAuditable = (p) => ({
  title: p.title,
  kind: p.kind,
  active: p.active,
  priority: p.priority,
  startsAt: p.startsAt,
  endsAt: p.endsAt,
  url: p.url,
});

const create = async (actor, payload) => {
  const { datos, errores } = saneado(payload);
  if (errores.length > 0) throw errorDeCarga(errores[0]);
  await guardarImagenes(datos);

  const promo = new Promotion({ ...datos, createdBy: actor?.id || null });
  await promo.save();
  invalidar();
  await auditar("create", promo, actor);
  return promo;
};

const update = async (id, actor, payload) => {
  if (!esId(id)) return null;
  const { datos, errores } = saneado(payload);
  if (errores.length > 0) throw errorDeCarga(errores[0]);

  const promo = await Promotion.findById(id);
  if (!promo) return null;
  await guardarImagenes(datos);

  const antes = resumenAuditable(promo);
  Object.assign(promo, datos);
  await promo.save();
  invalidar();
  await auditar("update", promo, actor, antes);
  return promo;
};

/**
 * Mostrar u ocultar, que es la operación que más se va a usar.
 *
 * Tiene su propio endpoint en vez de pasar por `update` con `{active}` para que
 * sea una operación con un solo significado: no puede arrastrar por accidente otro
 * campo del formulario que quedó a medio editar en la pantalla.
 */
const setVisibility = async (id, visible, actor) => {
  if (!esId(id)) return null;
  const promo = await Promotion.findById(id);
  if (!promo) return null;

  const antes = resumenAuditable(promo);
  promo.active = visible === true;
  await promo.save();
  invalidar();
  await auditar("update", promo, actor, antes);
  return promo;
};

/**
 * Sube o baja una campaña en el orden del carrusel.
 *
 * ── POR QUÉ NO ES "ESCRIBIR UN NÚMERO EN UN CAMPO" ──────────────────────────
 * La prioridad es un número, pero nadie piensa en números al ordenar: se piensa
 * "esta va antes que esa". Pedirle al administrador que calcule qué valor poner
 * —y que se acuerde de que había un empate en 5— es trasladarle un detalle de
 * implementación. Peor: con empates, el orden real lo desempata la fecha de
 * creación, así que dos campañas en 5 se ordenan de una forma que el panel no
 * explica y el administrador no puede cambiar.
 *
 * Acá se resuelve al revés: se ordena la lista como la ve la app, se mueve el
 * elemento un lugar, y se reasignan prioridades descendentes a todo el conjunto en
 * UNA escritura. Después de mover, no quedan empates: el orden que se ve es el
 * orden que está guardado.
 *
 * Se limita a las primeras 200 por prioridad, que es de sobra para un carrusel de
 * seis lugares: reordenar mil quinientas campañas históricas no cambia nada de lo
 * que se muestra y sería una escritura enorme por un toque en una flecha.
 */
const TOPE_REORDEN = 200;

const move = async (id, direccion, actor) => {
  if (!esId(id)) return null;

  const filas = await Promotion.find({})
    .sort({ priority: -1, sortDate: 1, createdAt: -1 })
    .limit(TOPE_REORDEN)
    .select("_id priority title")
    .lean();

  const desde = filas.findIndex((p) => String(p._id) === String(id));
  if (desde === -1) return null;

  const hasta = direccion === "up" ? desde - 1 : desde + 1;
  // Ya está en un extremo: no es un error, simplemente no hay nada que hacer.
  if (hasta < 0 || hasta >= filas.length) return { moved: false };

  const orden = [...filas];
  [orden[desde], orden[hasta]] = [orden[hasta], orden[desde]];

  // Prioridades descendentes y espaciadas de 1 desde el techo, en el orden nuevo.
  const base = Math.min(orden.length, 999);
  const ops = orden
    .map((p, i) => ({ p, valor: Math.max(base - i, 0) }))
    .filter(({ p, valor }) => (p.priority || 0) !== valor)
    .map(({ p, valor }) => ({
      updateOne: { filter: { _id: p._id }, update: { $set: { priority: valor, updatedAt: new Date() } } },
    }));

  if (ops.length > 0) await Promotion.bulkWrite(ops, { ordered: false });
  invalidar();

  if (actor?.email) {
    await auditar("update", { _id: id, title: filas[desde].title }, actor, {
      orden: `posición ${desde + 1}`,
    });
  }

  return { moved: true };
};

const remove = async (id, actor) => {
  if (!esId(id)) return false;
  const promo = await Promotion.findById(id).lean();
  if (!promo) return false;

  await Promotion.deleteOne({ _id: id });
  // Las stats diarias y las marcas de deduplicación se van con la campaña: sin
  // ella son filas huérfanas que nadie va a poder interpretar.
  await Promise.all([
    PromotionStat.deleteMany({ promotion: id }),
    PromotionView.deleteMany({ promotion: id }),
  ]);
  invalidar();
  await auditar("delete", promo, actor, resumenAuditable(promo));
  return true;
};

/**
 * El informe de una campaña: la serie por día y los totales del período.
 *
 * Es lo que se le muestra —o se le manda— a un anunciante, así que dice de qué
 * período habla y no mezcla veces mostrada con personas distintas.
 */
const stats = async (id, { days = 30 } = {}) => {
  if (!esId(id)) return null;

  const promo = await Promotion.findById(id).lean();
  if (!promo) return null;

  const cantidad = Math.min(Math.max(Number(days) || 30, 1), 365);
  const rango = [];
  for (let i = cantidad - 1; i >= 0; i -= 1) {
    rango.push(diaDe(new Date(Date.now() - i * 24 * 60 * 60 * 1000)));
  }

  const filas = await PromotionStat.find({ promotion: id, day: { $gte: rango[0] } })
    .sort({ day: 1 })
    .lean();
  const porDia = new Map(filas.map((f) => [f.day, f]));

  const daily = rango.map((day) => {
    const f = porDia.get(day);
    return {
      day,
      impressions: f?.impressions || 0,
      reach: f?.reach || 0,
      clicks: f?.clicks || 0,
      clickReach: f?.clickReach || 0,
    };
  });

  const sumar = (campo) => daily.reduce((n, d) => n + d[campo], 0);
  const reach = sumar("reach");
  const clickReach = sumar("clickReach");

  return {
    promotion: paraPanel(promo, new Date()),
    range: { days: cantidad, from: rango[0], to: rango[rango.length - 1] },
    period: {
      impressions: sumar("impressions"),
      reach,
      clicks: sumar("clicks"),
      clickReach,
      // La misma cuenta que en la lista, con los mismos dos números de gente: ver
      // `efectividad`. Sumar días puede contar dos veces a quien volvió otro día,
      // pero arriba y abajo por igual, que es lo que hace comparable la fracción.
      ctr: efectividad({ reach, clickReach }),
    },
    lifetime: {
      impressions: promo.impressions || 0,
      reach: promo.reach || 0,
      clicks: promo.clicks || 0,
      clickReach: promo.clickReach || 0,
    },
    daily,
  };
};

/**
 * El enlace del informe para el anunciante.
 *
 * ── POR QUÉ ES UN ENLACE Y NO UNA CUENTA ────────────────────────────────────
 * Porque el objetivo es que el anunciante MIRE sus números, y cada paso que le
 * pongas adelante termina en "mandame una captura por WhatsApp". Una captura no
 * la audita nadie: es tu palabra contra la suya, que es exactamente lo que un
 * informe tiene que evitar.
 *
 * El token se genera recién cuando se pide, así que una campaña que nunca se
 * compartió no tiene ninguna puerta abierta. Son 32 bytes al azar: no se adivina
 * ni se enumera, y no da acceso a nada más que a los números de ESA campaña.
 */
const ensureReportToken = async (id) => {
  if (!esId(id)) return null;
  const promo = await Promotion.findById(id).select("reportToken").lean();
  if (!promo) return null;
  if (promo.reportToken) return promo.reportToken;

  const token = crypto.randomBytes(24).toString("base64url");
  await Promotion.updateOne({ _id: id }, { $set: { reportToken: token } });
  return token;
};

/** Corta el enlace sin borrar la campaña ni sus números. */
const revokeReportToken = async (id) => {
  if (!esId(id)) return false;
  const r = await Promotion.updateOne({ _id: id }, { $set: { reportToken: null } });
  return r.matchedCount > 0;
};

/**
 * El informe que ve el anunciante con su enlace.
 *
 * Devuelve MENOS que el informe del panel, y a propósito: la campaña de otro no
 * es asunto suyo, y los datos internos —prioridad, quién la cargó, si está
 * pausada— tampoco. Van los números que se facturan, la serie por día para que
 * pueda verificar contra su propio calendario, y el período.
 */
const reportByToken = async (token, { days = 30 } = {}) => {
  const limpio = String(token || "").trim();
  if (limpio.length < 20) return null;

  const promo = await Promotion.findOne({ reportToken: limpio }).lean();
  if (!promo) return null;

  const informe = await stats(promo._id, { days });
  if (!informe) return null;

  return {
    campaign: {
      title: promo.title,
      summary: promo.summary,
      image: promo.image,
      sponsor: promo.sponsor?.name || "",
      // El anunciante tiene que poder verificar que el período que se le cobra es
      // el que estuvo al aire.
      startsAt: aFechaInput(promo.startsAt),
      endsAt: aFechaInput(promo.endsAt),
      kind: promo.kind,
    },
    range: informe.range,
    period: informe.period,
    lifetime: informe.lifetime,
    daily: informe.daily,
  };
};

module.exports = {
  listPublic,
  ensureReportToken,
  revokeReportToken,
  reportByToken,
  recordEvents,
  listAll,
  create,
  update,
  setVisibility,
  move,
  remove,
  stats,
  // Para los tests y para quien necesite invalidar a mano.
  invalidar,
  MAX_PUBLICAS,
};
