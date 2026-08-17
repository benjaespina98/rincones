const test = require("node:test");
const assert = require("node:assert/strict");
const catalogService = require("../src/services/catalog.service");
const communityWines = require("../src/services/communityWines.service");
const wineAi = require("../src/services/wineAi.service");
const WineVerification = require("../src/models/wineVerification.model");
const Wine = require("../src/models/wine.model");

/**
 * ¿ESTE VINO EXISTE, Y SE LLAMA ASÍ?
 *
 * La pregunta que el escaneo no hacía. La visión devuelve un nombre y se puntúa
 * a sí misma —"95, lo leí nítido"— pero leer bien no es acertar: el modelo no
 * tiene contra qué contrastar lo que ve, porque está mirando una foto y no una
 * lista de vinos. `verifyReading` es ese contraste, y estos tests fijan las tres
 * respuestas posibles y —sobre todo— qué NO cuenta como fuente.
 *
 * La comunidad se stubea para que no haga falta Mongo: cada caso dice qué
 * devuelve, que es justamente la variable que se está probando.
 */

const conComunidad = (filas) => {
  const original = communityWines.search;
  communityWines.search = async () => filas;
  return () => {
    communityWines.search = original;
  };
};

/** El modelo no participa de estos casos: se apaga para que no salga a la red. */
const sinModelo = () => {
  const key = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  return () => {
    if (key !== undefined) process.env.GEMINI_API_KEY = key;
  };
};

/**
 * El modelo, encendido pero de mentira: `responde` es lo que devolvería la
 * verificación, y `llamadas` cuenta cuántas veces se le preguntó — que es la
 * mitad del comportamiento que hay que fijar, porque cada llamada cuesta cuota y
 * segundos en el camino crítico del escaneo.
 *
 * La caché de Mongo se cortocircuita: sin esto cada test esperaría el timeout de
 * buffering de mongoose antes de seguir.
 */
const conModelo = (responde) => {
  const original = wineAi.verifyWineWithAi;
  const key = process.env.GEMINI_API_KEY;
  const cacheFind = WineVerification.findOne;
  const cacheUpdate = WineVerification.updateOne;

  const llamadas = [];
  process.env.GEMINI_API_KEY = "test";
  wineAi.verifyWineWithAi = async (lectura) => {
    llamadas.push(lectura);
    return typeof responde === "function" ? responde(lectura) : responde;
  };
  WineVerification.findOne = () => ({ lean: async () => null });
  WineVerification.updateOne = async () => ({});

  return {
    llamadas,
    restore: () => {
      wineAi.verifyWineWithAi = original;
      WineVerification.findOne = cacheFind;
      WineVerification.updateOne = cacheUpdate;
      if (key === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = key;
    },
  };
};

/** Lo que devuelve el modelo cuando conoce el vino. */
const respuestaDelModelo = (extra = {}) => ({
  id: "verif-1",
  name: "Refugio Alto",
  line: "Refugio Alto",
  properName: "",
  winery: "Bodega Los Cardones",
  region: "Valle de Uco, Mendoza",
  varietal: "Bonarda",
  type: "red",
  source: "gemini",
  mismatches: [],
  confidence: 90,
  ...extra,
});

test("el catálogo curado confirma un nombre bien leído", async () => {
  const restoreComunidad = conComunidad([]);
  const restoreModelo = sinModelo();
  try {
    const v = await catalogService.verifyReading({
      winery: "Catena Zapata",
      line: "Saint Felicien",
      name: "",
      varietal: "Malbec",
    });

    assert.equal(v.status, "confirmado");
    assert.equal(v.source, "catalogo-ar");
    assert.equal(v.name, "Saint Felicien");
  } finally {
    restoreComunidad();
    restoreModelo();
  }
});

/**
 * El caso que motiva todo: el modelo lee casi bien y nadie lo corrige.
 *
 * Una letra de menos en la etiqueta se guardaba tal cual, con la confianza que
 * el propio modelo se puso, y de ahí pasaba a la ficha, a la búsqueda y al
 * catálogo compartido. Acá la fuente dice cómo se llama de verdad.
 */
test("un nombre casi bien leído se corrige al del catálogo", async () => {
  const restoreComunidad = conComunidad([]);
  const restoreModelo = sinModelo();
  try {
    const v = await catalogService.verifyReading({
      winery: "Catena Zapata",
      line: "Saint Felicen",
      name: "",
      varietal: "Malbec",
    });

    assert.equal(v.status, "corregido");
    assert.equal(v.name, "Saint Felicien", "el nombre exacto, no el que se leyó");
  } finally {
    restoreComunidad();
    restoreModelo();
  }
});

test("un vino que no está en ninguna fuente NO se da por bueno", async () => {
  const restoreComunidad = conComunidad([]);
  const restoreModelo = sinModelo();
  try {
    const v = await catalogService.verifyReading({
      winery: "Bodega Los Cardones",
      line: "Refugio Alto",
      name: "",
      varietal: "Bonarda",
    });

    assert.equal(v.status, "sin-verificar");
    assert.equal(v.name, "");
  } finally {
    restoreComunidad();
    restoreModelo();
  }
});

/**
 * ── LA PARTE QUE MÁS IMPORTA ────────────────────────────────────────────────
 * Una fila comunitaria cargada por UNA sola persona puede ser exactamente el
 * mismo escaneo mal leído de la semana pasada —incluso de la misma persona—.
 * Confirmar una lectura con su propia copia no es verificar nada: es repetirse,
 * y encima con la autoridad de un "verificado" en pantalla.
 *
 * Recién cuando una segunda persona llegó por su cuenta a lo mismo (la fila pasa
 * a "comunidad-verificada") vale como fuente.
 */
test("una fila comunitaria de una sola persona no alcanza para verificar", async () => {
  const fila = {
    id: "com-1",
    name: "Refugio Alto",
    winery: "Bodega Los Cardones",
    varietal: "Bonarda",
    region: "Valle de Uco, Mendoza",
    type: "red",
    source: "comunidad",
    score: 1,
  };
  const restoreComunidad = conComunidad([fila]);
  const restoreModelo = sinModelo();
  try {
    const lectura = {
      winery: "Bodega Los Cardones",
      line: "Refugio Alto",
      name: "",
      varietal: "Bonarda",
    };

    assert.equal((await catalogService.verifyReading(lectura)).status, "sin-verificar");

    // La misma fila, confirmada por una segunda persona, sí vale.
    communityWines.search = async () => [{ ...fila, source: "comunidad-verificada" }];
    const confirmado = await catalogService.verifyReading(lectura);
    assert.equal(confirmado.status, "confirmado");
    assert.equal(confirmado.source, "comunidad-verificada");
  } finally {
    restoreComunidad();
    restoreModelo();
  }
});

/**
 * El enriquecimiento (`findMatch`) sí puede apoyarse en una fila comunitaria de
 * una sola persona: completar una región vacía no es lo mismo que afirmar que el
 * vino se llama así. Que las dos funciones compartan el criterio de match pero no
 * el de fuentes es deliberado, y esto lo fija.
 */
test("para completar huecos, en cambio, una fila comunitaria sigue sirviendo", async () => {
  const restoreComunidad = conComunidad([
    {
      id: "com-1",
      name: "Refugio Alto",
      winery: "Bodega Los Cardones",
      varietal: "Bonarda",
      region: "Valle de Uco, Mendoza",
      type: "red",
      source: "comunidad",
      score: 1,
    },
  ]);
  const restoreModelo = sinModelo();
  try {
    const match = await catalogService.findMatch({
      winery: "Bodega Los Cardones",
      line: "Refugio Alto",
      name: "",
      varietal: "Bonarda",
    });

    assert.ok(match, "el match existe: es la misma botella");
    assert.equal(match.region, "Valle de Uco, Mendoza");
  } finally {
    restoreComunidad();
    restoreModelo();
  }
});

/**
 * ── EL ESCALÓN QUE FALTABA: PREGUNTARLE AL MODELO, EN EL ESCANEO ────────────
 *
 * El catálogo curado tiene 410 filas y 96 bodegas: la enorme mayoría de los
 * vinos que alguien escanea NO están ahí. Para todos ésos, "sin verificar" era
 * el final del camino y el nombre entraba con lo que el lector creyó ver.
 *
 * Ahora hay una segunda pregunta, de texto y sin la foto: ¿este vino existe y se
 * llama así? Es independiente de la primera —el modelo no puede confirmarse a sí
 * mismo mirando la misma imagen— y por eso coincidir significa algo.
 */
test("cuando el catálogo no lo tiene, lo verifica el modelo", async () => {
  const restoreComunidad = conComunidad([]);
  const modelo = conModelo(respuestaDelModelo());
  try {
    const v = await catalogService.verifyReading({
      winery: "Bodega Los Cardones",
      line: "Refugio Alto",
      name: "",
      varietal: "Bonarda",
    });

    assert.equal(v.status, "confirmado");
    assert.equal(v.source, "gemini");
    assert.equal(modelo.llamadas.length, 1, "una sola consulta por escaneo");
  } finally {
    restoreComunidad();
    modelo.restore();
  }
});

test("el modelo también corrige el nombre mal transcripto", async () => {
  const restoreComunidad = conComunidad([]);
  const modelo = conModelo(respuestaDelModelo());
  try {
    const v = await catalogService.verifyReading({
      winery: "Bodega Los Cardones",
      // Al lector se le comió una letra, que es como falla de verdad.
      line: "Refugio Alt",
      name: "",
      varietal: "Bonarda",
    });

    assert.equal(v.status, "corregido");
    assert.equal(v.name, "Refugio Alto");
  } finally {
    restoreComunidad();
    modelo.restore();
  }
});

/**
 * "Puede ser" no verifica nada. Un modelo inseguro que igual contesta es
 * exactamente la forma en que un dato inventado se gana un cartel de
 * "verificado" — el problema que este trabajo vino a resolver, reintroducido por
 * la puerta de atrás.
 */
test("una respuesta insegura del modelo no cuenta como verificación", async () => {
  const restoreComunidad = conComunidad([]);
  const modelo = conModelo(respuestaDelModelo({ confidence: 45 }));
  try {
    const v = await catalogService.verifyReading({
      winery: "Bodega Los Cardones",
      line: "Refugio Alto",
      name: "",
      varietal: "Bonarda",
    });

    assert.equal(v.status, "sin-verificar");
  } finally {
    restoreComunidad();
    modelo.restore();
  }
});

/**
 * El modelo contesta sobre la lectura que se le mandó, pero puede entender otra
 * botella. Los vetos duros del match (bodega que no se parece en nada, otra uva)
 * valen para todas las fuentes por igual, también para él.
 */
test("si el modelo contesta sobre otro vino, no se acepta", async () => {
  const restoreComunidad = conComunidad([]);
  const modelo = conModelo(
    respuestaDelModelo({ winery: "Catena Zapata", line: "Saint Felicien", varietal: "Malbec" })
  );
  try {
    const v = await catalogService.verifyReading({
      winery: "Bodega Los Cardones",
      line: "Refugio Alto",
      name: "",
      varietal: "Bonarda",
    });

    assert.equal(v.status, "sin-verificar");
  } finally {
    restoreComunidad();
    modelo.restore();
  }
});

/**
 * Un vino que el catálogo curado ya confirmó no necesita una segunda opinión: la
 * fuente que lo respalda está congelada, se puede leer y corregir, y una llamada
 * al modelo cuesta cuota y un par de segundos en el peor momento posible —
 * alguien parado frente a la góndola esperando la revisión.
 */
test("lo que el catálogo ya confirmó no gasta una llamada al modelo", async () => {
  const restoreComunidad = conComunidad([]);
  const modelo = conModelo(respuestaDelModelo());
  try {
    const v = await catalogService.verifyReading({
      winery: "Catena Zapata",
      line: "Saint Felicien",
      name: "",
      varietal: "Malbec",
    });

    assert.equal(v.status, "confirmado");
    assert.equal(v.source, "catalogo-ar");
    assert.equal(modelo.llamadas.length, 0, "no se le preguntó al modelo");
  } finally {
    restoreComunidad();
    modelo.restore();
  }
});

/**
 * Lo que la fuente contradice viaja hasta la pantalla, pero no pisa nada: la
 * etiqueta la tiene la persona en la mano y las bodegas cambian cortes entre
 * añadas. La revisión abre esos campos; decidir es de quien mira la botella.
 */
test("los campos que el modelo contradice viajan como desacuerdos", async () => {
  const restoreComunidad = conComunidad([]);
  const modelo = conModelo(respuestaDelModelo({ mismatches: ["region"] }));
  try {
    const v = await catalogService.verifyReading({
      winery: "Bodega Los Cardones",
      line: "Refugio Alto",
      name: "",
      varietal: "Bonarda",
      region: "Salta",
    });

    assert.equal(v.status, "confirmado");
    assert.deepEqual(v.mismatches, ["region"]);
  } finally {
    restoreComunidad();
    modelo.restore();
  }
});

/**
 * ── TU PROPIA BODEGA COMO SEÑAL ─────────────────────────────────────────────
 *
 * Un vino que ya confirmaste una vez es un candidato de primera: se repite lo
 * que gustó, y esa fila ya pasó por tus manos. Sólo entran los `trusted` — tus
 * escaneos dudosos son justamente los que podrían repetir un error viejo con
 * cara de certeza.
 *
 * Este test existe por un bug que ninguno de los otros podía ver: la consulta
 * usaba una función que no estaba declarada en el módulo, así que tiraba
 * ReferenceError apenas había un usuario con sesión. El llamador lo atrapaba y
 * seguía, con lo cual el escaneo "funcionaba" y tus vinos nunca participaban.
 * Todo lo demás corría sin `userId`, que es el único caso donde ese código no
 * se ejecuta.
 */
const conMisVinos = (vinos) => {
  const original = Wine.find;
  const consultas = [];
  Wine.find = (filtro) => {
    consultas.push(filtro);
    return {
      select: () => ({ limit: () => ({ lean: async () => vinos }) }),
    };
  };
  return { consultas, restore: () => { Wine.find = original; } };
};

test("un vino tuyo ya confirmado entra como candidato", async () => {
  const restoreComunidad = conComunidad([]);
  const restoreModelo = sinModelo();
  const mios = conMisVinos([
    {
      _id: "mio1",
      name: "Refugio Alto",
      line: "Refugio Alto",
      winery: "Bodega Los Cardones",
      region: "Valle de Uco, Mendoza",
      varietal: "Bonarda",
      type: "red",
    },
  ]);

  try {
    const r = await catalogService.identifyReading(
      { winery: "Bodega Los Cardones", line: "Refugio Alto", name: "", varietal: "Bonarda", type: "red" },
      { userId: "u1" }
    );

    assert.equal(r.level, "alta");
    assert.equal(r.best.wine.source, "mis-vinos");
    // Y se consultó lo que corresponde: sólo tuyo y sólo lo confirmado.
    const filtro = mios.consultas[0];
    assert.equal(filtro.userId, "u1");
    assert.equal(filtro["identification.verdict"], "trusted");
  } finally {
    restoreComunidad();
    restoreModelo();
    mios.restore();
  }
});

test("una bodega con caracteres raros no rompe la consulta", async () => {
  // "Bodega (Ex) Norton +" como texto de una etiqueta mal leída: si no se escapa,
  // el patrón es un regex inválido y la consulta explota.
  const restoreComunidad = conComunidad([]);
  const restoreModelo = sinModelo();
  const mios = conMisVinos([]);

  try {
    const r = await catalogService.identifyReading(
      { winery: "Bodega (Ex) Norton +", line: "Reserva ***", name: "", varietal: "" },
      { userId: "u1" }
    );
    assert.equal(r.level, "ninguna");
  } finally {
    restoreComunidad();
    restoreModelo();
    mios.restore();
  }
});
