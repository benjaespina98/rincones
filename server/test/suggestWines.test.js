const test = require("node:test");
const assert = require("node:assert/strict");
const Wine = require("../src/models/wine.model");
const winesService = require("../src/services/wines.service");

/**
 * El Sommelier: qué abrir, según con qué vas a comer y con qué ganas estás.
 *
 * ── POR QUÉ APARECE ESTE TEST AHORA ─────────────────────────────────────────
 * El servicio puntúa con DOS ejes desde siempre, pero la pantalla sólo ofrecía
 * la comida: el eje "ganas" (liviano / cuerpo / festivo) estaba implementado,
 * viajaba en el contexto y no había forma de activarlo desde la app. Al
 * exponerlo dejó de ser código muerto y pasó a decidir lo que ve la gente, así
 * que ahora tiene que estar cubierto.
 *
 * Lo que se fija: que el veto de comida siga mandando sobre el gusto personal,
 * que las ganas funcionen SIN comida (que es la mitad de las veces que alguien
 * abre una botella) y que sólo se sugiera lo que tenés.
 */

const conBodega = (vinos) => {
  const original = Wine.find;
  Wine.find = (filtro) => ({
    select: async () =>
      // El servicio pide sólo lo que tiene stock; se respeta acá para que el
      // test no dependa de un detalle del filtro pero tampoco lo contradiga.
      vinos.filter((w) => (filtro?.quantity?.$gt !== undefined ? w.quantity > 0 : true)),
  });
  return () => {
    Wine.find = original;
  };
};

const vino = (props) => ({
  _id: props.name,
  name: props.name,
  quantity: 1,
  rating: 0,
  favorite: false,
  tasted: false,
  toObject() {
    return { ...this };
  },
  ...props,
});

const BLANCO_LIVIANO = vino({ name: "Torrontés", type: "white", varietal: "Torrontés" });
const TINTO_PESADO = vino({ name: "Malbec de guarda", type: "red", varietal: "Malbec", rating: 5, favorite: true });
const ESPUMANTE = vino({ name: "Extra Brut", type: "sparkling", varietal: "Chardonnay" });

const nombres = (r) => r.map((w) => w.name);

test("las ganas solas alcanzan: no hace falta estar comiendo", async () => {
  const restore = conBodega([BLANCO_LIVIANO, TINTO_PESADO, ESPUMANTE]);
  try {
    const livianos = await winesService.suggestWines("u1", { mood: "liviano" });
    assert.equal(nombres(livianos)[0], "Torrontés", "un blanco encabeza si pediste algo liviano");

    const conCuerpo = await winesService.suggestWines("u1", { mood: "cuerpo" });
    assert.equal(nombres(conCuerpo)[0], "Malbec de guarda");

    const brindis = await winesService.suggestWines("u1", { mood: "festivo" });
    assert.equal(nombres(brindis)[0], "Extra Brut");
  } finally {
    restore();
  }
});

test("las ganas dicen POR QUÉ, no sólo qué", async () => {
  const restore = conBodega([BLANCO_LIVIANO, TINTO_PESADO]);
  try {
    const [primero] = await winesService.suggestWines("u1", { mood: "liviano" });
    assert.match(primero.matchReason, /liviano/i, "el motivo es lo que vuelve útil a la sugerencia");
  } finally {
    restore();
  }
});

/**
 * El veto de comida manda sobre todo lo demás, incluidas tus ganas y tu propio
 * puntaje. Un Malbec de 5★ no es una respuesta a "¿qué tomo con pescado?" por
 * mucho que te guste — y con el eje de ganas expuesto, ahora hay una forma
 * nueva de pedirle al sistema que se equivoque en eso.
 */
test("pedir 'con cuerpo' no mete un tinto en una cena de pescado", async () => {
  const restore = conBodega([BLANCO_LIVIANO, TINTO_PESADO]);
  try {
    const r = await winesService.suggestWines("u1", { food: "pescado", mood: "cuerpo" });
    assert.deepEqual(nombres(r), ["Torrontés"], "el tinto queda afuera aunque sea el favorito");
  } finally {
    restore();
  }
});

/**
 * Dos pedidos que se contradicen no vacían la pantalla: la comida manda (es una
 * regla de maridaje) y las ganas ordenan lo que ella deja pasar. Por eso el eje
 * "ganas" pesa mucho pero no veta — si vetara, este caso devolvería nada.
 */
test("las ganas ordenan, no vacían: siempre queda lo mejor dentro de lo que la comida permite", async () => {
  const CHARDONNAY = vino({ name: "Chardonnay con madera", type: "white", varietal: "Chardonnay" });
  const restore = conBodega([BLANCO_LIVIANO, CHARDONNAY, TINTO_PESADO]);
  try {
    const r = await winesService.suggestWines("u1", { food: "pescado", mood: "cuerpo" });
    assert.equal(r.length, 2, "los dos blancos siguen ahí");
    assert.ok(!nombres(r).includes("Malbec de guarda"));
  } finally {
    restore();
  }
});

test("sin contexto sugiere igual, con lo que tengas", async () => {
  const restore = conBodega([BLANCO_LIVIANO, TINTO_PESADO]);
  try {
    const r = await winesService.suggestWines("u1", {});
    assert.equal(r.length, 2, "no filtra nada, sólo ordena");
  } finally {
    restore();
  }
});
