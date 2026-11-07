/**
 * Lotes: el stock de un vino contado por compra, no como un número suelto.
 *
 * `quantity` del vino sigue siendo la verdad para filtros, índices y pantallas
 * ("tenés 8 botellas"), y no se va a ningún lado. Lo que agregan los lotes es el
 * CUÁNDO: si comprás el mismo Malbec en 2019 y otra vez el mes pasado, ya no son
 * "8 botellas desde 2019" ni "8 desde el mes pasado" — son 3 de 2019 y 5 de
 * ahora, y la ficha puede decir la verdad.
 *
 * UN LOTE SEPARA LO QUE ENTRÓ DE LO QUE QUEDA:
 *
 *     quantity  → cuántas botellas trajo esa compra. No baja al tomarlas.
 *     remaining → cuántas de ésas siguen en la cava. Baja hasta 0.
 *
 * Por eso un lote agotado NO se borra: `{ addedAt: 2019-03, quantity: 6,
 * remaining: 0, depletedAt: 2021-08 }` es el registro de que esas seis botellas
 * existieron, de cuándo entraron y de cuándo se terminaron. Borrarlo perdería
 * justamente el origen de todo lo que ya te tomaste, que es lo que el historial
 * tiene que poder contar. El array crece con cada compra; es el costo de tener
 * trazabilidad y es un dato por compra, no por botella.
 *
 * INVARIANTE, y es la única regla que importa acá:
 *
 *     wine.quantity === suma de `remaining` de todos los lotes
 *
 * Ojo con la sutileza: el stock sale de `remaining`, NO de `quantity` del lote.
 * `quantity` del vino es lo disponible; `quantity` del lote es lo que trajo esa
 * compra. Suman cosas distintas a propósito.
 *
 * La invariante se sostiene en los dos extremos: el hook `pre("validate")` del
 * modelo la fuerza en cualquier `save()`, y los pipelines de este archivo la
 * recalculan dentro de Mongo en cada update atómico. No hay camino de escritura
 * que la pueda romper.
 *
 * Los lotes no tienen `_id`: los updates atómicos reescriben el array desde un
 * pipeline de agregación, que no sabe generar ObjectIds. Se identifican por su
 * `addedAt`.
 */

// Ninguna compra de la vida real pasa de esto. Sin tope, un lote que llega de afuera (por ejemplo al restaurar un
// vino) con `remaining: 1e15` dejaba un stock absurdo que después se sumaba y se mostraba tal cual.
const MAX_BOTELLAS_POR_LOTE = 100000;

const enteroPositivo = (valor) => {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), MAX_BOTELLAS_POR_LOTE);
};

/** Un precio sólo si es un número finito y no negativo: lo demás se descarta en vez de pasar al documento. */
const precioValido = (valor) => {
  const n = typeof valor === "number" ? valor : Number.NaN;
  return Number.isFinite(n) && n >= 0 && n < 1e12 ? n : undefined;
};

/** Una tienda sólo si es texto, y acotada. */
const tiendaValida = (valor) => (typeof valor === "string" && valor.trim() ? valor.trim().slice(0, 120) : undefined);

const fecha = (valor) => {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Un lote plano, sin la maquinaria de subdocumento de Mongoose y con los dos
 * contadores en orden.
 *
 * `remaining` ausente significa "lote de antes de que existiera la distinción":
 * todo lo que entró sigue estando. Es la lectura correcta y hace que un
 * documento viejo se acomode solo la primera vez que lo tocan.
 */
const aLotePlano = (lote, { fallbackDate } = {}) => {
  const fuente = lote && typeof lote.toObject === "function" ? lote.toObject() : lote || {};

  const entraron = enteroPositivo(fuente.quantity);
  const quedan =
    fuente.remaining === undefined || fuente.remaining === null
      ? entraron
      : enteroPositivo(fuente.remaining);

  const salida = {
    addedAt: fecha(fuente.addedAt) || fecha(fallbackDate) || new Date(),
    // Nunca puede quedar más de lo que entró. Si pasa (una devolución sobre un
    // lote ya agotado), el lote creció: lo que manda es lo que hay.
    quantity: Math.max(entraron, quedan),
    remaining: quedan,
  };

  const agotado = fecha(fuente.depletedAt);
  if (quedan === 0 && agotado) salida.depletedAt = agotado;

  // `price` y `store` todavía no los escribe nadie, pero si algún día llegan no
  // pueden perderse al pasar por acá.
  if (precioValido(fuente.price) !== undefined) salida.price = precioValido(fuente.price);
  if (tiendaValida(fuente.store)) salida.store = tiendaValida(fuente.store);

  return salida;
};

const listaDeLotes = (lots, { fallbackDate } = {}) =>
  (Array.isArray(lots) ? lots : []).map((l) => aLotePlano(l, { fallbackDate }));

/** FIFO: el lote más viejo primero. Empate de fecha, se respeta el orden dado. */
const ordenarLotes = (lots, opciones) =>
  listaDeLotes(lots, opciones)
    .map((lote, i) => ({ lote, i }))
    .sort((a, b) => a.lote.addedAt - b.lote.addedAt || a.i - b.i)
    .map(({ lote }) => lote);

/** El stock disponible: lo que queda, no lo que entró alguna vez. */
const availableFromLots = (lots) => listaDeLotes(lots).reduce((total, l) => total + l.remaining, 0);

/**
 * Deja el array en su forma canónica: ordenado, con los dos contadores puestos
 * y —si el vino viene de antes de los lotes— con el lote inicial derivado de
 * `quantity`.
 *
 * Sólo descarta lo que no es ni stock ni historial: un lote que nunca trajo
 * nada (`quantity` 0). Los agotados se quedan, que es todo el punto.
 *
 * Esto hace que la migración sea una comodidad, no un requisito: un vino que
 * nunca pasó por el script se arregla solo la primera vez que lo tocás.
 */
const normalizeLots = (lots, { quantity = 0, createdAt } = {}) => {
  const ordenados = ordenarLotes(lots).filter((l) => l.quantity > 0);
  if (ordenados.length > 0) return ordenados;

  const total = enteroPositivo(quantity);
  if (total === 0) return [];
  const alta = fecha(createdAt) || new Date();
  return [{ addedAt: alta, quantity: total, remaining: total }];
};

/**
 * Los lotes que se aceptan al RESTAURAR un vino borrado ("Deshacer"): sólo si viene `restauraDe` (un id de 24
 * hexadecimales) y una lista de lotes; pasan por `normalizeLots`, que sanea cada campo, y se acotan a 200.
 * Devuelve [] si no corresponde: entonces el vino se arma como siempre, desde la cantidad.
 */
const lotesParaRestaurar = (restauraDe, lots) => {
  if (typeof restauraDe !== "string" || !/^[0-9a-fA-F]{24}$/.test(restauraDe)) return [];
  if (!Array.isArray(lots) || lots.length === 0) return [];
  return normalizeLots(lots.slice(0, 200));
};

/** Reposición: botellas nuevas son un lote nuevo, con su propia fecha. */
const appendLot = (lots, quantity, { addedAt, price, store } = {}) => {
  const suman = enteroPositivo(quantity);
  const actuales = normalizeLots(lots);
  if (suman === 0) return actuales;

  const nuevo = { addedAt: fecha(addedAt) || new Date(), quantity: suman, remaining: suman };
  if (price !== undefined && price !== null) nuevo.price = price;
  if (store) nuevo.store = store;

  return ordenarLotes([...actuales, nuevo]);
};

/**
 * Consumo FIFO: primero se vacía el lote más viejo que todavía tenga botellas.
 *
 * Es lo que hace cualquiera parado frente a la cava —se toma la que lleva más
 * tiempo ahí— y es lo que mantiene honesto el "en cava hace X": cuando se acaba
 * la compra vieja, la antigüedad que muestra la ficha pasa a ser la de la que
 * queda, no la de una botella que ya no existe.
 *
 * El lote que llega a 0 se queda en el array con su `quantity` intacto y una
 * marca `depletedAt`: de ahí salen las botellas que te tomaste.
 *
 * Nunca deja negativos: si pedís más de lo que hay, se lleva lo que había.
 */
const consumeFromLots = (lots, amount, { consumedAt } = {}) => {
  let restante = enteroPositivo(amount);
  const cuando = fecha(consumedAt) || new Date();

  return normalizeLots(lots).map((lote) => {
    if (restante === 0 || lote.remaining === 0) return lote;

    const saca = Math.min(restante, lote.remaining);
    restante -= saca;

    const quedan = lote.remaining - saca;
    const actualizado = { ...lote, remaining: quedan };
    if (quedan === 0) actualizado.depletedAt = cuando;
    return actualizado;
  });
};

/**
 * Devolver botellas al lote del que salieron.
 *
 * Es el "deshacer", no una compra: destildar "probado" o corregir un toque de
 * más devuelve una botella que ya estaba en la cava. Si eso creara un lote con
 * fecha de hoy, un vino que tenés desde 2019 pasaría a figurar como recién
 * llegado por haber tocado mal un botón.
 *
 * Vuelve al ÚLTIMO lote del que se sacó algo, que es el que deshace de verdad
 * un consumo FIFO: si la compra de 2019 se agotó y ya empezaste la de ahora, la
 * botella que devolvés es de la de ahora. Poder saberlo es justamente lo que
 * habilita conservar los lotes agotados.
 *
 * En la app este movimiento corre siempre por `devolverExpr` (tiene que ser
 * atómico); ésta es la versión legible de la misma regla, y la que fijan los
 * tests.
 */
const returnToLastOpenedLot = (lots, amount, { fallbackDate } = {}) => {
  const suman = enteroPositivo(amount);
  const actuales = normalizeLots(lots);
  if (suman === 0) return actuales;

  if (actuales.length === 0) {
    const alta = fecha(fallbackDate) || new Date();
    return [{ addedAt: alta, quantity: suman, remaining: suman }];
  }

  // El último del que se sacó algo; si nunca se tomó nada, el más viejo.
  let destino = actuales.reduce((idx, lote, i) => (lote.remaining < lote.quantity ? i : idx), -1);
  if (destino === -1) destino = 0;

  return actuales.map((lote, i) => {
    if (i !== destino) return lote;
    const quedan = lote.remaining + suman;
    const devuelto = { ...lote, remaining: quedan, quantity: Math.max(lote.quantity, quedan) };
    // Ya no está agotado: la marca dejaría de ser cierta.
    delete devuelto.depletedAt;
    return devuelto;
  });
};

/**
 * Lleva el stock a un total exacto: sobra → se consume FIFO; falta → lote nuevo.
 *
 * Es el puente para todo lo que sigue escribiendo `quantity` directo (editar la
 * cantidad a mano en la ficha, un `PATCH` con un valor fijo). El usuario escribe
 * un número y los lotes se acomodan solos.
 */
const reconcileLots = (lots, targetQuantity, { addedAt, createdAt, currentQuantity } = {}) => {
  const objetivo = enteroPositivo(targetQuantity);
  const actuales = normalizeLots(lots, { quantity: currentQuantity, createdAt });
  const disponible = availableFromLots(actuales);

  if (objetivo === disponible) return actuales;
  if (objetivo < disponible) return consumeFromLots(actuales, disponible - objetivo);
  return appendLot(actuales, objetivo - disponible, { addedAt });
};

// ---------------------------------------------------------------------------
// Los mismos movimientos, pero expresados para el motor.
//
// Ajustar stock leyendo, sumando en Node y guardando es el lost update clásico:
// dos toques rápidos en "+" leen 1 los dos y escriben 2 los dos, y una botella
// desaparece sin error. Por eso `adjustStock` ya resolvía la cuenta dentro del
// documento con un pipeline; los lotes se calculan en el mismo lugar y en el
// mismo paso, o volveríamos a tener dos escrituras compitiendo.
// ---------------------------------------------------------------------------

const CANT_LOTE = { $ifNull: ["$$this.quantity", 0] };
const RESTAN_LOTE = { $ifNull: ["$$this.remaining", CANT_LOTE] };

/** Lotes normalizados dentro de Mongo (mismo criterio que `normalizeLots`). */
const LOTES_NORMALIZADOS = {
  $sortArray: {
    input: {
      $let: {
        vars: { actuales: { $ifNull: ["$lots", []] } },
        in: {
          $cond: [
            { $gt: [{ $size: "$$actuales" }, 0] },
            {
              // Sin `as`: la variable por defecto de $map ya es `$$this`.
              $map: {
                input: "$$actuales",
                in: {
                  $mergeObjects: [
                    "$$this",
                    {
                      quantity: { $max: [CANT_LOTE, RESTAN_LOTE] },
                      remaining: RESTAN_LOTE,
                    },
                  ],
                },
              },
            },
            {
              $cond: [
                { $gt: [{ $ifNull: ["$quantity", 0] }, 0] },
                [
                  {
                    addedAt: { $ifNull: ["$createdAt", "$$NOW"] },
                    quantity: { $ifNull: ["$quantity", 0] },
                    remaining: { $ifNull: ["$quantity", 0] },
                  },
                ],
                [],
              ],
            },
          ],
        },
      },
    },
    sortBy: { addedAt: 1 },
  },
};

/** El stock: la suma de lo que QUEDA en cada lote, no de lo que entró. */
const STOCK_DE_LOTES = {
  $sum: { $map: { input: "$lots", as: "l", in: { $ifNull: ["$$l.remaining", 0] } } },
};

/**
 * Consumo FIFO como expresión: recorre los lotes descontando el remanente y
 * marcando `depletedAt` en el que llega a cero. Ninguno se descarta.
 */
const consumirExpr = (cantidadExpr) => ({
  $let: {
    vars: {
      paso: {
        $reduce: {
          input: "$lots",
          initialValue: { resto: cantidadExpr, out: [] },
          in: {
            $let: {
              vars: {
                saca: { $min: ["$$value.resto", { $ifNull: ["$$this.remaining", 0] }] },
              },
              in: {
                resto: { $subtract: ["$$value.resto", "$$saca"] },
                out: {
                  $concatArrays: [
                    "$$value.out",
                    [
                      {
                        $let: {
                          vars: {
                            quedan: { $subtract: [{ $ifNull: ["$$this.remaining", 0] }, "$$saca"] },
                          },
                          in: {
                            $mergeObjects: [
                              "$$this",
                              { remaining: "$$quedan" },
                              // Sólo el lote que se agota AHORA estrena marca; los
                              // que ya estaban en cero conservan la suya.
                              {
                                $cond: [
                                  { $and: [{ $eq: ["$$quedan", 0] }, { $gt: ["$$saca", 0] }] },
                                  { depletedAt: "$$NOW" },
                                  {},
                                ],
                              },
                            ],
                          },
                        },
                      },
                    ],
                  ],
                },
              },
            },
          },
        },
      },
    },
    in: "$$paso.out",
  },
});

const reponerExpr = (cantidadExpr, lote = {}) => ({
  $concatArrays: [
    "$lots",
    // `lote` trae lo que se sabe de ESA compra (precio, tienda), como literales ya saneados por quien llama.
    [{ addedAt: "$$NOW", quantity: cantidadExpr, remaining: cantidadExpr, ...lote }],
  ],
});

/**
 * Deshacer una reposición: saca las botellas del ÚLTIMO lote (el que se acaba de agregar), no del más viejo.
 *
 * «Deshacer» de un «+» llamaba a un consumo FIFO, que descuenta del lote más viejo con botellas: con un lote de
 * 2019 y otro de hoy, deshacer vaciaba el de 2019 (inventando una botella tomada) y dejaba el de hoy. El vino
 * pasaba de «en cava desde 2019» a «desde hoy». Acá se achica el último lote en lo que entró y, si queda en
 * cero, se saca: esa compra nunca ocurrió, no es historial.
 */
const quitarUltimoExpr = (cantidadExpr) => ({
  $let: {
    vars: { n: { $size: "$lots" } },
    in: {
      $filter: {
        input: {
          $map: {
            input: { $range: [0, "$$n"] },
            as: "i",
            in: {
              $let: {
                vars: { lote: { $arrayElemAt: ["$lots", "$$i"] } },
                in: {
                  $cond: [
                    { $eq: ["$$i", { $subtract: ["$$n", 1] }] },
                    {
                      $let: {
                        vars: { sacar: { $min: [cantidadExpr, { $ifNull: ["$$lote.remaining", 0] }] } },
                        in: {
                          $mergeObjects: [
                            "$$lote",
                            {
                              quantity: { $subtract: [{ $ifNull: ["$$lote.quantity", 0] }, "$$sacar"] },
                              remaining: { $subtract: [{ $ifNull: ["$$lote.remaining", 0] }, "$$sacar"] },
                            },
                          ],
                        },
                      },
                    },
                    "$$lote",
                  ],
                },
              },
            },
          },
        },
        as: "l",
        cond: { $gt: [{ $ifNull: ["$$l.quantity", 0] }, 0] },
      },
    },
  },
});

/**
 * Devolver al último lote del que se sacó algo (`remaining < quantity`), o al
 * más viejo si nunca se tomó nada. `$unsetField` saca la marca de agotado, que
 * con la botella de vuelta dejaría de ser cierta.
 */
const devolverExpr = (cantidadExpr) => ({
  $cond: [
    { $gt: [{ $size: "$lots" }, 0] },
    {
      $let: {
        vars: {
          destino: {
            $max: [
              0,
              {
                $reduce: {
                  input: { $range: [0, { $size: "$lots" }] },
                  initialValue: -1,
                  in: {
                    $let: {
                      vars: { lote: { $arrayElemAt: ["$lots", "$$this"] } },
                      in: {
                        $cond: [
                          { $lt: ["$$lote.remaining", "$$lote.quantity"] },
                          "$$this",
                          "$$value",
                        ],
                      },
                    },
                  },
                },
              },
            ],
          },
        },
        in: {
          $map: {
            input: { $range: [0, { $size: "$lots" }] },
            as: "i",
            in: {
              $let: {
                vars: { lote: { $arrayElemAt: ["$lots", "$$i"] } },
                in: {
                  $cond: [
                    { $ne: ["$$i", "$$destino"] },
                    "$$lote",
                    {
                      $let: {
                        vars: { quedan: { $add: ["$$lote.remaining", cantidadExpr] } },
                        in: {
                          $unsetField: {
                            field: "depletedAt",
                            input: {
                              $mergeObjects: [
                                "$$lote",
                                {
                                  remaining: "$$quedan",
                                  quantity: { $max: ["$$lote.quantity", "$$quedan"] },
                                },
                              ],
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
    [
      {
        addedAt: { $ifNull: ["$createdAt", "$$NOW"] },
        quantity: cantidadExpr,
        remaining: cantidadExpr,
      },
    ],
  ],
});

/** `status` con las mismas reglas que `toWineStatus`, para que no se separen. */
const STATUS_SEGUN_STOCK = {
  $cond: [
    { $lte: ["$quantity", 0] },
    { $cond: ["$tasted", "archived", "stock"] },
    { $cond: ["$tasted", "tasted", "stock"] },
  ],
};

/**
 * Las etapas de un movimiento de stock, listas para `findOneAndUpdate`.
 *
 * `op`:
 *   - "restock": suma botellas y las guarda como un lote nuevo, con fecha de hoy.
 *   - "consume": descuenta FIFO, del lote más viejo con stock hacia adelante.
 *   - "return":  devuelve botellas al lote del que salieron (deshacer, no compra).
 *   - "unrestock": deshace una reposición: achica el último lote (no consume FIFO).
 * `lote` (sólo "restock"): precio y tienda de esa compra, ya saneados.
 *   - "set":     fija un total exacto y acomoda los lotes hacia donde haga falta.
 *
 * Siempre termina recalculando `quantity` desde lo que queda en los lotes, así
 * que la invariante no depende de que el llamador haga bien las cuentas.
 */
const buildStockStages = (op, cantidadExpr, { lote } = {}) => {
  const lotesNuevos = {
    restock: () => reponerExpr(cantidadExpr, lote),
    unrestock: () => quitarUltimoExpr(cantidadExpr),
    consume: () => consumirExpr(cantidadExpr),
    return: () => devolverExpr(cantidadExpr),
    set: () => ({
      $let: {
        vars: { disponible: STOCK_DE_LOTES, objetivo: cantidadExpr },
        in: {
          $cond: [
            { $eq: ["$$objetivo", "$$disponible"] },
            "$lots",
            {
              $cond: [
                { $lt: ["$$objetivo", "$$disponible"] },
                consumirExpr({ $subtract: ["$$disponible", "$$objetivo"] }),
                reponerExpr({ $subtract: ["$$objetivo", "$$disponible"] }),
              ],
            },
          ],
        },
      },
    }),
  }[op];

  if (!lotesNuevos) throw new Error(`Operación de stock desconocida: ${op}`);

  return [
    // 1. Normalizar primero: un vino sin lotes (anterior a esta versión) entra
    //    a la operación ya con su lote inicial derivado de quantity/createdAt,
    //    y uno sin `remaining` (anterior a la separación) queda completo.
    { $set: { lots: LOTES_NORMALIZADOS } },
    // 2. El movimiento.
    { $set: { lots: lotesNuevos() } },
    // 3. quantity SIEMPRE sale de lo que queda en los lotes, nunca al revés.
    { $set: { quantity: STOCK_DE_LOTES } },
    { $set: { status: STATUS_SEGUN_STOCK, updatedAt: "$$NOW" } },
  ];
};

module.exports = {
  availableFromLots,
  normalizeLots,
  appendLot,
  consumeFromLots,
  returnToLastOpenedLot,
  reconcileLots,
  lotesParaRestaurar,
  buildStockStages,
};
