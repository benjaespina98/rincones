const test = require("node:test");
const assert = require("node:assert/strict");
const Promotion = require("../src/models/promotion.model");
const promotions = require("../src/services/promotions.service");

const restore = (object, key, value) => {
  object[key] = value;
};

/**
 * Lo que no se puede romper en los destacados:
 *  - una campaña vencida NO se muestra (lo decide la consulta, no una revisión
 *    manual un domingo a la noche);
 *  - el orden respeta lo pactado (prioridad) antes que cualquier otra cosa;
 *  - una publicidad SIEMPRE queda marcada como publicidad.
 */

test("la consulta pública sólo pide lo activo y vigente", async () => {
  const originalFind = Promotion.find;

  let filtro = null;
  Promotion.find = (f) => {
    filtro = f;
    return { select: () => ({ lean: async () => [] }) };
  };

  try {
    const ahora = new Date("2026-07-29T12:00:00Z");
    await promotions.listPublic(ahora);

    assert.equal(filtro.active, true, "lo pausado no se muestra");

    const json = JSON.stringify(filtro.$and);
    // Empezada (o sin fecha de inicio) y todavía no terminada (o sin fin).
    assert.ok(json.includes("$lte"), "no se muestra lo que todavía no empezó");
    assert.ok(json.includes("$gte"), "no se muestra lo que ya terminó");
    assert.ok(json.includes("startsAt") && json.includes("endsAt"));
    // Una campaña sin fechas tiene que entrar igual: son opcionales.
    assert.ok(json.includes("null"), "las fechas vacías no excluyen la campaña");
  } finally {
    restore(Promotion, "find", originalFind);
  }
});

test("ordena por prioridad primero y por evento más próximo después", async () => {
  const originalFind = Promotion.find;

  const filas = [
    { _id: "c", title: "Sin fecha, prioridad 0", priority: 0, eventAt: null, createdAt: "2026-01-01" },
    { _id: "a", title: "Feria de noviembre", priority: 0, eventAt: "2026-11-01", createdAt: "2026-01-01" },
    { _id: "b", title: "Cata de agosto", priority: 0, eventAt: "2026-08-01", createdAt: "2026-01-01" },
    { _id: "z", title: "Campaña paga", priority: 10, eventAt: null, createdAt: "2026-01-01" },
  ];

  Promotion.find = () => ({ select: () => ({ lean: async () => filas }) });

  try {
    const orden = (await promotions.listPublic()).map((p) => p._id);

    // Lo pactado manda: prioridad 10 va primero aunque no tenga fecha.
    assert.equal(orden[0], "z");
    // Después, el evento más próximo antes que el más lejano.
    assert.deepEqual(orden.slice(1), ["b", "a", "c"]);
  } finally {
    restore(Promotion, "find", originalFind);
  }
});

// `createdBy` es un ObjectId: un string cualquiera no castea y hace fallar la
// validación por un motivo que no tiene nada que ver con lo que se está probando.
const ADMIN_ID = "687f2a1b4c3d2e1f0a9b8c7d";

test("una publicidad siempre queda marcada como publicidad", async () => {
  const originalSave = Promotion.prototype.save;
  Promotion.prototype.save = async function save() {
    // La marca la fuerza el hook pre("validate") del modelo. Se corre a mano para
    // probar la regla sin necesitar Mongo levantado.
    await this.validate();
    return this;
  };

  try {
    // Aunque el payload diga explícitamente que NO es publicidad.
    const promo = await promotions.create(ADMIN_ID, {
      kind: "ad",
      title: "Vinos Ejemplo",
      sponsored: false,
    });

    assert.equal(promo.kind, "ad");
    assert.equal(
      promo.sponsored,
      true,
      "que una publicidad se muestre sin cartel no puede depender de una casilla"
    );

    // Un evento común no se marca solo.
    const evento = await promotions.create(ADMIN_ID, { kind: "event", title: "Vendimia" });
    assert.equal(evento.sponsored, false);

    // Pero un evento auspiciado sí se puede marcar a mano: sigue siendo pago.
    const auspiciado = await promotions.create(ADMIN_ID, {
      kind: "event",
      title: "Cata con marca",
      sponsored: true,
    });
    assert.equal(auspiciado.sponsored, true);
  } finally {
    restore(Promotion.prototype, "save", originalSave);
  }
});

test("el saneado ignora lo que no es editable y normaliza fechas vacías", async () => {
  const originalSave = Promotion.prototype.save;
  Promotion.prototype.save = async function save() { return this; };

  try {
    const promo = await promotions.create(ADMIN_ID, {
      title: "  Con espacios  ",
      priority: "5",
      startsAt: "",
      endsAt: "2026-12-31",
      // Nada de esto puede entrar desde el body: son contadores y auditoría.
      impressions: 9999,
      clicks: 9999,
      createdBy: "111111111111111111111111",
    });

    assert.equal(promo.title, "Con espacios", "los espacios se recortan");
    assert.equal(promo.priority, 5, "la prioridad llega como número");
    assert.equal(promo.startsAt, null, "fecha vacía es null, no una fecha inválida");
    assert.ok(promo.endsAt instanceof Date);

    assert.equal(promo.impressions, 0, "los contadores no se pueden inflar desde el body");
    assert.equal(promo.clicks, 0);
    // El autor sale del usuario autenticado, NO del body: el `createdBy` que vino
    // en el payload se ignora.
    assert.equal(String(promo.createdBy), ADMIN_ID);
  } finally {
    restore(Promotion.prototype, "save", originalSave);
  }
});
