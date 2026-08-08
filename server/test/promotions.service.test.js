const test = require("node:test");
const assert = require("node:assert/strict");
const Promotion = require("../src/models/promotion.model");
const PromotionStat = require("../src/models/promotionStat.model");
const PromotionView = require("../src/models/promotionView.model");
const ChangeLog = require("../src/models/changeLog.model");
const imageStorage = require("../src/services/imageStorage.service");
const promotions = require("../src/services/promotions.service");

/**
 * La auditoría escribe en Mongo y acá no hay Mongo: sin este reemplazo cada
 * operación del panel espera los diez segundos del buffer de Mongoose antes de
 * darse por vencida. El servicio se traga ese error a propósito (el log no puede
 * hacer fallar un cambio de campaña), así que el test pasaría igual —sólo que la
 * suite tardaría un minuto en vez de un segundo—.
 */
ChangeLog.create = async () => ({});

/**
 * Lo que no se puede romper en el gestor de campañas:
 *
 *  - una campaña que no está al aire NO se muestra, y eso lo decide la consulta
 *    con la fecha del momento y no una revisión manual un domingo a la noche;
 *  - el orden y el límite los resuelve MONGO, no JavaScript: es lo que hace que la
 *    portada cueste lo mismo con veinte campañas que con veinte mil;
 *  - una publicidad SIEMPRE queda marcada como publicidad;
 *  - los contadores no se pueden inflar: ni desde el body, ni mandando el id de
 *    una campaña que no se está mostrando, ni recargando la pantalla;
 *  - impresiones y personas distintas son dos números diferentes.
 */

const restore = (object, key, value) => {
  object[key] = value;
};

// `createdBy` es un ObjectId: un string cualquiera no castea y hace fallar la
// validación por un motivo que no tiene nada que ver con lo que se está probando.
const ADMIN = { id: "687f2a1b4c3d2e1f0a9b8c7d", email: "admin@rincones.local", role: "admin" };
const ID_A = "687f2a1b4c3d2e1f0a9b8c01";
const ID_B = "687f2a1b4c3d2e1f0a9b8c02";

/** Deja `Promotion.find(...)` devolviendo `filas`, y guarda el filtro y el orden. */
const mockFind = (filas) => {
  const capturado = {};
  Promotion.find = (filtro) => {
    capturado.filtro = filtro;
    const cadena = {
      select: () => cadena,
      sort: (s) => {
        capturado.sort = s;
        return cadena;
      },
      skip: () => cadena,
      limit: (n) => {
        capturado.limit = n;
        return cadena;
      },
      lean: async () => filas,
    };
    return cadena;
  };
  return capturado;
};

/** La caché de la portada es de proceso: sin esto un test lee lo del anterior. */
const limpio = () => promotions.invalidar();

test("la consulta pública sólo pide lo que está al aire", async () => {
  const originalFind = Promotion.find;
  const capturado = mockFind([]);
  limpio();

  try {
    const ahora = new Date("2026-07-29T12:00:00Z");
    await promotions.listPublic(ahora);

    assert.equal(capturado.filtro.active, true, "lo pausado no se muestra");

    const json = JSON.stringify(capturado.filtro.$and);
    // Empezada (o sin fecha de inicio) y todavía no terminada (o sin fin).
    assert.ok(json.includes("$lte"), "no se muestra lo que todavía no empezó");
    assert.ok(json.includes("$gte"), "no se muestra lo que ya terminó");
    assert.ok(json.includes("startsAt") && json.includes("endsAt"));
    // Una campaña sin fechas tiene que entrar igual: son opcionales.
    assert.ok(json.includes("null"), "las fechas vacías no excluyen la campaña");
  } finally {
    restore(Promotion, "find", originalFind);
    limpio();
  }
});

test("el orden y el límite los hace la base, no la memoria del server", async () => {
  const originalFind = Promotion.find;
  const capturado = mockFind([]);
  limpio();

  try {
    await promotions.listPublic();

    // Prioridad primero (lo pactado manda), después el evento más próximo
    // —`sortDate` deja al final las que no tienen fecha— y por último lo más nuevo.
    assert.deepEqual(capturado.sort, { priority: -1, sortDate: 1, createdAt: -1 });
    // El límite viaja a la consulta: antes se traía todo lo vigente y se cortaba
    // acá, que con volumen significa traer miles de documentos para mostrar seis.
    assert.equal(capturado.limit, promotions.MAX_PUBLICAS);
  } finally {
    restore(Promotion, "find", originalFind);
    limpio();
  }
});

test("la caché de la portada se cae en cuanto se toca una campaña", async () => {
  const originalFind = Promotion.find;
  const originalSave = Promotion.prototype.save;
  let consultas = 0;

  Promotion.find = () => {
    consultas += 1;
    const cadena = {
      select: () => cadena,
      sort: () => cadena,
      limit: () => cadena,
      lean: async () => [],
    };
    return cadena;
  };
  Promotion.prototype.save = async function save() {
    return this;
  };
  limpio();

  try {
    // Una llamada a listPublic hace DOS consultas: las vinotecas y el resto,
    // porque ocupan secciones distintas de la pantalla y tienen cupos distintos.
    await promotions.listPublic();
    await promotions.listPublic();
    assert.equal(consultas, 2, "la segunda visita se sirve de la caché");

    // Crear, pausar o editar cualquier campaña tiene que reflejarse YA: si no, el
    // administrador toca el interruptor y no ve nada durante segundos.
    await promotions.create(ADMIN, { title: "Nueva" });
    await promotions.listPublic();
    assert.equal(consultas, 4, "después de un cambio se vuelve a consultar");
  } finally {
    restore(Promotion, "find", originalFind);
    restore(Promotion.prototype, "save", originalSave);
    limpio();
  }
});

test("el tipo y el cobro son independientes: cualquier contenido puede ser pago", async () => {
  const originalSave = Promotion.prototype.save;
  Promotion.prototype.save = async function save() {
    // Se valida a mano para probar las reglas del modelo sin Mongo levantado.
    await this.validate();
    return this;
  };

  try {
    /**
     * Ésta es la razón de ser del cambio. Antes existía `kind: "ad"`, que era a
     * la vez el tipo y la marca de pago: una vinoteca que pagaba no podía
     * declararse vinoteca, y por lo tanto la pantalla no tenía cómo mandarla a
     * "Dónde comprar". Ahora las dos cosas conviven.
     */
    const tiendaPaga = await promotions.create(ADMIN, {
      type: "wineShop",
      title: "Vinos Ejemplo",
      sponsored: true,
    });
    assert.equal(tiendaPaga.type, "wineShop");
    assert.equal(tiendaPaga.sponsored, true);

    // La misma sección admite una recomendada, sin cartel y sin ser otra cosa.
    const tiendaCurada = await promotions.create(ADMIN, {
      type: "wineShop",
      title: "Vinoteca del barrio",
    });
    assert.equal(tiendaCurada.type, "wineShop");
    assert.equal(tiendaCurada.sponsored, false, "no se marca solo");

    // Y un evento auspiciado sigue siendo un evento.
    const auspiciado = await promotions.create(ADMIN, {
      type: "event",
      title: "Cata con marca",
      sponsored: true,
    });
    assert.equal(auspiciado.type, "event");
    assert.equal(auspiciado.sponsored, true);
  } finally {
    restore(Promotion.prototype, "save", originalSave);
    limpio();
  }
});

test("un tipo inventado no se guarda", async () => {
  const originalSave = Promotion.prototype.save;
  Promotion.prototype.save = async function save() {
    await this.validate();
    return this;
  };

  try {
    await assert.rejects(
      () => promotions.create(ADMIN, { type: "banner", title: "Cualquier cosa" }),
      /tipo tiene que ser/i,
      "el enum se valida antes de llegar a la base"
    );
  } finally {
    restore(Promotion.prototype, "save", originalSave);
    limpio();
  }
});

test("el saneado ignora lo que no es editable y normaliza fechas", async () => {
  const originalSave = Promotion.prototype.save;
  Promotion.prototype.save = async function save() {
    return this;
  };

  try {
    const promo = await promotions.create(ADMIN, {
      title: "  Con espacios  ",
      startsAt: "",
      endsAt: "2026-12-31",
      // Nada de esto puede entrar desde el body: son contadores y auditoría. Un
      // contador escribible desde una petición convierte a las estadísticas en algo
      // que no se le puede mostrar a nadie.
      impressions: 9999,
      clicks: 9999,
      reach: 9999,
      createdBy: "111111111111111111111111",
    });

    assert.equal(promo.title, "Con espacios", "los espacios se recortan");
    assert.equal(promo.startsAt, null, "fecha vacía es null, no una fecha inválida");
    // El último milisegundo del 31 en hora argentina: el día que se pactó, entero.
    assert.equal(promo.endsAt.toISOString(), "2027-01-01T02:59:59.999Z");

    assert.equal(promo.impressions, 0, "los contadores no se pueden inflar desde el body");
    assert.equal(promo.clicks, 0);
    assert.equal(promo.reach, 0);
    // El autor sale del usuario autenticado, NO del body.
    assert.equal(String(promo.createdBy), ADMIN.id);
  } finally {
    restore(Promotion.prototype, "save", originalSave);
    limpio();
  }
});

test("un enlace que no es http(s) ni interno se rechaza al cargar", async () => {
  const originalSave = Promotion.prototype.save;
  Promotion.prototype.save = async function save() {
    return this;
  };

  try {
    await assert.rejects(
      () => promotions.create(ADMIN, { title: "Trampa", url: "javascript:alert(1)" }),
      /enlace/i,
      "el destino termina en window.open: un esquema ejecutable ahí corre código"
    );
    await assert.rejects(
      () => promotions.create(ADMIN, { title: "Trampa", image: "javascript:alert(1)" }),
      /imagen/i
    );
    await assert.rejects(
      () => promotions.create(ADMIN, { title: "Trampa", accent: "red; background: url(x)" }),
      /color/i
    );
  } finally {
    restore(Promotion.prototype, "save", originalSave);
    limpio();
  }
});

test("sólo se le cuentan eventos a las campañas que están al aire", async () => {
  const originalFind = Promotion.find;
  const originalBulk = Promotion.bulkWrite;
  const originalStats = PromotionStat.bulkWrite;
  const originalViews = PromotionView.bulkWrite;

  mockFind([{ _id: ID_A, updatedAt: new Date() }]);
  let escrituras = null;
  Promotion.bulkWrite = async (ops) => {
    escrituras = ops;
    return {};
  };
  PromotionStat.bulkWrite = async () => ({});
  PromotionView.bulkWrite = async () => ({ upsertedIds: {} });
  limpio();

  try {
    const res = await promotions.recordEvents({
      entries: [
        { id: ID_A, type: "impression" },
        // Una campaña que no se está mostrando (vencida, pausada o inexistente).
        // El endpoint es público, así que sin este control cualquiera le sumaba
        // impresiones a cualquier documento mandando su id.
        { id: ID_B, type: "impression" },
        // Basura: ni siquiera es un id.
        { id: "no-es-un-id", type: "click" },
      ],
      visitorHash: "hash-de-una-persona",
    });

    assert.equal(res.accepted, 1, "sólo entra la que está al aire");
    assert.equal(escrituras.length, 1);
    assert.equal(String(escrituras[0].updateOne.filter._id), ID_A);
  } finally {
    restore(Promotion, "find", originalFind);
    restore(Promotion, "bulkWrite", originalBulk);
    restore(PromotionStat, "bulkWrite", originalStats);
    restore(PromotionView, "bulkWrite", originalViews);
    limpio();
  }
});

test("impresiones y personas distintas son dos números diferentes", async () => {
  const originalFind = Promotion.find;
  const originalBulk = Promotion.bulkWrite;
  const originalStats = PromotionStat.bulkWrite;
  const originalViews = PromotionView.bulkWrite;

  mockFind([{ _id: ID_A, updatedAt: new Date() }]);
  const escrituras = [];
  Promotion.bulkWrite = async (ops) => {
    escrituras.push(ops);
    return {};
  };
  PromotionStat.bulkWrite = async () => ({});

  // Primera vez de esta persona hoy: la marca entra.
  PromotionView.bulkWrite = async () => ({ upsertedIds: { 0: "x" } });
  limpio();

  try {
    await promotions.recordEvents({
      entries: [{ id: ID_A, type: "impression" }],
      visitorHash: "misma-persona",
    });
    assert.deepEqual(escrituras[0][0].updateOne.update.$inc, { impressions: 1, reach: 1 });

    // Segunda visita de la MISMA persona el mismo día: el índice único rechaza la
    // marca, así que suma impresión pero no alcance. Sin esto se le informaría a
    // un anunciante "dos personas vieron tu campaña" cuando fue una.
    PromotionView.bulkWrite = async () => ({ upsertedIds: {} });
    limpio();
    await promotions.recordEvents({
      entries: [{ id: ID_A, type: "impression" }],
      visitorHash: "misma-persona",
    });
    assert.deepEqual(escrituras[1][0].updateOne.update.$inc, { impressions: 1 });
  } finally {
    restore(Promotion, "find", originalFind);
    restore(Promotion, "bulkWrite", originalBulk);
    restore(PromotionStat, "bulkWrite", originalStats);
    restore(PromotionView, "bulkWrite", originalViews);
    limpio();
  }
});

test("todo el lote se escribe en una operación por colección", async () => {
  const originalFind = Promotion.find;
  const originalBulk = Promotion.bulkWrite;
  const originalStats = PromotionStat.bulkWrite;
  const originalViews = PromotionView.bulkWrite;

  mockFind([
    { _id: ID_A, updatedAt: new Date() },
    { _id: ID_B, updatedAt: new Date() },
  ]);
  let llamadasPromo = 0;
  let llamadasStats = 0;
  Promotion.bulkWrite = async () => {
    llamadasPromo += 1;
    return {};
  };
  PromotionStat.bulkWrite = async () => {
    llamadasStats += 1;
    return {};
  };
  PromotionView.bulkWrite = async () => ({ upsertedIds: {} });
  limpio();

  try {
    await promotions.recordEvents({
      entries: [
        { id: ID_A, type: "impression" },
        { id: ID_B, type: "impression" },
        { id: ID_A, type: "click" },
      ],
      visitorHash: "una-persona",
    });

    // Un carrusel de seis tarjetas eran seis peticiones y doce escrituras por
    // visita a la pantalla de entrada de la app. Ahora es una y tres.
    assert.equal(llamadasPromo, 1);
    assert.equal(llamadasStats, 1);
  } finally {
    restore(Promotion, "find", originalFind);
    restore(Promotion, "bulkWrite", originalBulk);
    restore(PromotionStat, "bulkWrite", originalStats);
    restore(PromotionView, "bulkWrite", originalViews);
    limpio();
  }
});

test("contar nunca lanza, pase lo que pase", async () => {
  const originalFind = Promotion.find;
  Promotion.find = () => {
    throw new Error("la base se cayó");
  };
  limpio();

  try {
    // Un contador roto no puede romperle la pantalla a nadie ni cortarle la
    // navegación a quien está yendo al sitio del anunciante.
    const res = await promotions.recordEvents({
      entries: [{ id: ID_A, type: "impression" }],
      visitorHash: "x",
    });
    assert.deepEqual(res, { accepted: 0 });
  } finally {
    restore(Promotion, "find", originalFind);
    limpio();
  }
});

test("reordenar deja el orden guardado igual al que se ve", async () => {
  const originalFind = Promotion.find;
  const originalBulk = Promotion.bulkWrite;

  // Tres campañas empatadas en prioridad: el orden real lo desempata la base y el
  // administrador no tiene forma de cambiarlo escribiendo números.
  mockFind([
    { _id: ID_A, priority: 5, title: "A" },
    { _id: ID_B, priority: 5, title: "B" },
    { _id: "687f2a1b4c3d2e1f0a9b8c03", priority: 5, title: "C" },
  ]);
  let ops = null;
  Promotion.bulkWrite = async (o) => {
    ops = o;
    return {};
  };
  limpio();

  try {
    // Subir la segunda un lugar.
    const res = await promotions.move(ID_B, "up", ADMIN);
    assert.deepEqual(res, { moved: true });

    // Después de mover no quedan empates: el orden que se ve es el que está
    // guardado, y eso es lo que hace que las flechas sean predecibles.
    const prioridades = ops.map((o) => o.updateOne.update.$set.priority);
    assert.deepEqual([...prioridades].sort((a, b) => b - a), prioridades, "quedan descendentes");
    assert.equal(new Set(prioridades).size, prioridades.length, "sin empates");

    // La primera de la lista ahora es B.
    assert.equal(String(ops[0].updateOne.filter._id), ID_B);
  } finally {
    restore(Promotion, "find", originalFind);
    restore(Promotion, "bulkWrite", originalBulk);
    limpio();
  }
});

test("mover la primera hacia arriba no es un error, simplemente no hace nada", async () => {
  const originalFind = Promotion.find;
  const originalBulk = Promotion.bulkWrite;
  mockFind([{ _id: ID_A, priority: 1, title: "A" }]);
  let escribio = false;
  Promotion.bulkWrite = async () => {
    escribio = true;
    return {};
  };
  limpio();

  try {
    assert.deepEqual(await promotions.move(ID_A, "up", ADMIN), { moved: false });
    assert.equal(escribio, false);
  } finally {
    restore(Promotion, "find", originalFind);
    restore(Promotion, "bulkWrite", originalBulk);
    limpio();
  }
});

test("una imagen subida se guarda como URL, no dentro de la campaña", async () => {
  const originalSave = Promotion.prototype.save;
  const originalStore = imageStorage.store;

  Promotion.prototype.save = async function save() {
    return this;
  };

  const subidas = [];
  imageStorage.store = async (valor, opciones) => {
    subidas.push(opciones?.folder);
    return "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_800,c_limit/logo.png";
  };

  try {
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
    const promo = await promotions.create(ADMIN, {
      title: "Con logo",
      image: png,
      sponsor: { name: "Bodega Ejemplo", logo: png },
    });

    // Lo que queda en la base es una URL liviana. Si el archivo se guardara adentro,
    // la consulta de la portada arrastraría cientos de KB por campaña en cada visita.
    assert.match(promo.image, /^https:\/\/res\.cloudinary\.com/);
    assert.match(promo.sponsor.logo, /^https:\/\/res\.cloudinary\.com/);
    assert.equal(subidas.length, 2, "se sube el fondo y el logo");
    assert.deepEqual(subidas, ["rincones/promos", "rincones/promos/logos"]);

    // Un enlace no se re-sube: no hay nada que subir.
    subidas.length = 0;
    const conEnlace = await promotions.create(ADMIN, {
      title: "Con enlace",
      image: "https://bodega.com/foto.jpg",
    });
    assert.equal(subidas.length, 0);
    assert.equal(conEnlace.image, "https://bodega.com/foto.jpg");
  } finally {
    restore(Promotion.prototype, "save", originalSave);
    restore(imageStorage, "store", originalStore);
    limpio();
  }
});

test("el panel puede pedir por tipo y por si es pago", async () => {
  const originalFind = Promotion.find;
  const originalCount = Promotion.countDocuments;

  const capturado = mockFind([]);
  const filtrosContados = [];
  Promotion.countDocuments = async (f) => {
    filtrosContados.push(f);
    return 0;
  };
  limpio();

  try {
    await promotions.listAll({ type: "wineShop" });
    assert.equal(capturado.filtro.type, "wineShop");
    // Los contadores del resumen SON los botones de estado: si contaran sobre todo
    // mientras la lista muestra sólo vinotecas, el panel se contradice solo.
    assert.ok(
      filtrosContados.every((f) => f.type === "wineShop"),
      "el resumen respeta el filtro por tipo"
    );

    // Un tipo que no existe no filtra nada (no inventa un tipo).
    await promotions.listAll({ type: "cualquier-cosa" });
    assert.equal(capturado.filtro.type, undefined);

    /**
     * Lo pago se filtra aparte del tipo, que es todo el punto de haberlos
     * separado: "mostrame las vinotecas que están pagando" es la pregunta que
     * se hace quien tiene que facturar, y antes era imposible —una vinoteca
     * paga era "ad" y dejaba de ser vinoteca—.
     */
    filtrosContados.length = 0;
    await promotions.listAll({ type: "wineShop", sponsored: "true" });
    assert.equal(capturado.filtro.type, "wineShop");
    assert.equal(capturado.filtro.sponsored, true);
    assert.ok(
      filtrosContados.every((f) => f.sponsored === true),
      "el resumen también respeta el filtro de pago"
    );

    // "false" es un filtro real (lo gratuito), no la ausencia de filtro.
    await promotions.listAll({ sponsored: "false" });
    assert.equal(capturado.filtro.sponsored, false);

    await promotions.listAll({});
    assert.equal(capturado.filtro.sponsored, undefined, "sin filtro, entran los dos");
  } finally {
    restore(Promotion, "find", originalFind);
    restore(Promotion, "countDocuments", originalCount);
    limpio();
  }
});

test("el panel recibe el estado ya resuelto y las fechas en formato de formulario", async () => {
  const originalFind = Promotion.find;
  const originalCount = Promotion.countDocuments;

  mockFind([
    {
      _id: ID_A,
      title: "Campaña pausada",
      active: false,
      endsAt: new Date("2030-01-01T02:59:59.999Z"),
      impressions: 100,
      clicks: 40,
      reach: 40,
      clickReach: 2,
    },
  ]);
  Promotion.countDocuments = async () => 1;
  limpio();

  try {
    const { items } = await promotions.listAll({});
    const fila = items[0];

    // El estado lo calcula el server con el MISMO código que decide si la campaña
    // se muestra. Que lo recalcule el navegador es la garantía de que algún día el
    // panel va a decir "Activa" sobre algo que la app no muestra.
    assert.equal(fila.state, "paused");
    assert.equal(fila.stateLabel, "Pausada");
    assert.ok(fila.stateHint, "cada estado explica su razón");

    // La fecha vuelve como el día que se cargó, no corrida por la zona horaria.
    assert.equal(fila.form.endsAt, "2029-12-31");

    // La efectividad son PERSONAS sobre PERSONAS: 2 de las 40 que la vieron la
    // tocaron. Antes era clics sobre impresiones, y como los clics no se
    // deduplican y las impresiones sí, el panel llegó a mostrar "130%".
    assert.equal(fila.ctr, 5);
  } finally {
    restore(Promotion, "find", originalFind);
    restore(Promotion, "countDocuments", originalCount);
    limpio();
  }
});

test("el porcentaje de clic no se muestra con pocos datos", async () => {
  const originalFind = Promotion.find;
  const originalCount = Promotion.countDocuments;

  // 1 clic de 3 personas no es "33% de efectividad": es ruido. Un número así en
  // un informe invita a una conclusión que el dato no aguanta.
  mockFind([
    { _id: ID_A, title: "Recién publicada", active: true, impressions: 3, clicks: 1, reach: 3, clickReach: 1 },
  ]);
  Promotion.countDocuments = async () => 1;
  limpio();

  try {
    const { items } = await promotions.listAll({});
    assert.equal(items[0].ctr, null);
  } finally {
    restore(Promotion, "find", originalFind);
    restore(Promotion, "countDocuments", originalCount);
    limpio();
  }
});

test("la efectividad no puede pasar de 100%, que es lo que pasaba", async () => {
  const originalFind = Promotion.find;
  const originalCount = Promotion.countDocuments;

  /**
   * El caso real que apareció en el panel: "20 impresiones · 3 personas · 26
   * clics · 130%".
   *
   * No era un error de cuentas: arriba y abajo se contaban cosas distintas. Las
   * impresiones se deduplican —una por tarjeta y por visita— y los clics se
   * sumaban todos, así que alguien probando su campaña generaba más clics que
   * impresiones. Un porcentaje mayor a 100 le avisa al anunciante que los números
   * no se pueden comparar entre sí, y desde ahí no hay razón para creerle a
   * ninguno.
   */
  mockFind([
    {
      _id: ID_A,
      title: "La que mostraba 130%",
      active: true,
      impressions: 20,
      clicks: 26,
      reach: 30,
      clickReach: 3,
    },
  ]);
  Promotion.countDocuments = async () => 1;
  limpio();

  try {
    const { items } = await promotions.listAll({});
    // 3 personas de las 30 que la vieron: 10%. Los 26 toques no entran en la
    // cuenta, aunque se sigan mostrando como "26 clics".
    assert.equal(items[0].ctr, 10);
  } finally {
    restore(Promotion, "find", originalFind);
    restore(Promotion, "countDocuments", originalCount);
    limpio();
  }
});

test("aunque un clic entre sin su impresión, la efectividad queda en 100%", async () => {
  const originalFind = Promotion.find;
  const originalCount = Promotion.countDocuments;

  // Cinturón: si por una carrera se cuenta a alguien que tocó sin haber sumado
  // como visto, el porcentaje se planta en 100 y no vuelve a mostrar un absurdo.
  mockFind([
    { _id: ID_A, title: "Rara", active: true, impressions: 40, clicks: 99, reach: 20, clickReach: 25 },
  ]);
  Promotion.countDocuments = async () => 1;
  limpio();

  try {
    const { items } = await promotions.listAll({});
    assert.equal(items[0].ctr, 100);
  } finally {
    restore(Promotion, "find", originalFind);
    restore(Promotion, "countDocuments", originalCount);
    limpio();
  }
});
