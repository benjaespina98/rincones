import { describe, it, expect } from "vitest";
import {
  terminosDe,
  haystackDe,
  pasaBusqueda,
  pasaFiltros,
  opcionesDe,
  ordenarVinos,
  resultadosDe,
} from "../src/utils/bodegaFiltros";
import { resumenDeBodega, frasesDelResumen } from "../src/utils/bodegaResumen";

/**
 * Estas reglas salieron de bugs reportados desde la app, no de un diseño. Vivían
 * adentro de un componente de 1965 líneas donde no se podían testear — que es
 * justamente por lo que se rompieron.
 */

const vino = (over = {}) => ({
  _id: "1",
  name: "Catena Alta",
  winery: "Catena Zapata",
  varietal: "Malbec",
  region: "Luján de Cuyo, Mendoza",
  vintage: 2019,
  type: "red",
  quantity: 2,
  tasted: false,
  rating: 0,
  createdAt: "2026-01-01",
  ...over,
});

describe("búsqueda", () => {
  it("cada palabra puede caer en un campo distinto", () => {
    // "rutini 2019" fallaba cuando se buscaba la frase entera dentro de un
    // solo campo: la bodega está en uno y el año en otro.
    const w = vino({ winery: "Rutini", vintage: 2019 });
    expect(pasaBusqueda(w, terminosDe("rutini 2019"))).toBe(true);
    expect(pasaBusqueda(w, terminosDe("rutini 2020"))).toBe(false);
  });

  it("encuentra por cosecha y por tipo escritos en castellano", () => {
    const w = vino();
    expect(pasaBusqueda(w, terminosDe("2019"))).toBe(true);
    expect(pasaBusqueda(w, terminosDe("tinto"))).toBe(true);
  });

  it("encuentra por dónde está guardado, dónde se compró y en qué estante", () => {
    // Las tres maneras de acordarse de una botella cuando no viene el nombre.
    const w = vino({
      cellar: { location: "Heladera", shelf: "Estante 3" },
      purchase: { store: "Carrefour" },
    });
    expect(pasaBusqueda(w, terminosDe("heladera"))).toBe(true);
    expect(pasaBusqueda(w, terminosDe("carrefour"))).toBe(true);
    expect(pasaBusqueda(w, terminosDe("estante 3"))).toBe(true);
  });

  it("ignora acentos y mayúsculas", () => {
    expect(pasaBusqueda(vino(), terminosDe("LUJAN"))).toBe(true);
  });

  it("el haystack no explota con campos ausentes", () => {
    expect(() => haystackDe({})).not.toThrow();
  });
});

describe("facetas", () => {
  it("la cosecha se compara como texto, porque el combo maneja strings", () => {
    const w = vino({ vintage: 2019 });
    expect(pasaBusqueda(w, [], { vintage: "2019" })).toBe(true);
    expect(pasaBusqueda(w, [], { vintage: "2018" })).toBe(false);
  });

  it("filtra por tipo, uva y región", () => {
    const w = vino();
    expect(pasaBusqueda(w, [], { tipo: "white" })).toBe(false);
    expect(pasaBusqueda(w, [], { varietal: "Malbec" })).toBe(true);
    expect(pasaBusqueda(w, [], { region: "Salta" })).toBe(false);
  });

  it("las opciones salen de lo que hay, y las cosechas de la más nueva", () => {
    const opts = opcionesDe([
      vino({ varietal: "Malbec", vintage: 2019, region: "Mendoza" }),
      vino({ varietal: "Bonarda", vintage: 2021, region: "Mendoza" }),
      vino({ varietal: "Malbec", vintage: null, region: null }),
    ]);
    expect(opts.varietales).toEqual(["Bonarda", "Malbec"]);
    expect(opts.cosechas).toEqual(["2021", "2019"]);
    expect(opts.regiones).toEqual(["Mendoza"]);
  });
});

describe("filtro de probado", () => {
  it("probado es un eje independiente del stock", () => {
    // Un vino puede estar probado Y tener botellas: abrir la primera de una
    // caja lo marca probado sin vaciarlo.
    const conStockYProbado = vino({ tasted: true, quantity: 3 });
    expect(pasaFiltros(conStockYProbado, { probado: true })).toBe(true);
    expect(pasaFiltros(conStockYProbado, { probado: false })).toBe(false);
  });

  it("sin filtro de probado pasan los dos", () => {
    expect(pasaFiltros(vino({ tasted: true }), {})).toBe(true);
    expect(pasaFiltros(vino({ tasted: false }), {})).toBe(true);
  });
});

describe("orden", () => {
  it("lo que tiene stock va primero, por encima del orden elegido", () => {
    const vacio = vino({ _id: "vacio", quantity: 0, rating: 5 });
    const lleno = vino({ _id: "lleno", quantity: 1, rating: 1 });
    const orden = ordenarVinos([vacio, lleno], { sortBy: "rating" });
    // Aunque el vacío tiene mejor puntaje, la pregunta de esta pantalla es
    // "¿qué tengo para tomar?".
    expect(orden.map((w) => w._id)).toEqual(["lleno", "vacio"]);
  });

  it("sin precio cargado queda al final, no como si fuera barato", () => {
    const sinPrecio = vino({ _id: "sin" });
    const conPrecio = vino({ _id: "con", purchase: { price: 100 } });
    const orden = ordenarVinos([sinPrecio, conPrecio], { sortBy: "price" });
    expect(orden.map((w) => w._id)).toEqual(["con", "sin"]);
  });

  it("agrupando, el grupo manda y el orden elegido vale adentro", () => {
    const a = vino({ _id: "a", type: "red", rating: 1 });
    const b = vino({ _id: "b", type: "white", rating: 5 });
    const c = vino({ _id: "c", type: "red", rating: 3 });
    const orden = ordenarVinos([a, b, c], { sortBy: "rating", groupOf: (w) => w.type });
    // Los dos tintos juntos, y adentro el de mejor puntaje primero.
    expect(orden.map((w) => w._id)).toEqual(["c", "a", "b"]);
  });

  it("no muta la lista que recibe", () => {
    const lista = [vino({ _id: "a" }), vino({ _id: "b" })];
    const copia = [...lista];
    ordenarVinos(lista, { sortBy: "name" });
    expect(lista).toEqual(copia);
  });
});

describe("buscar mira toda la bodega, no la pestaña abierta", () => {
  // El bug reportado: se cargaba un Piatelli, se escribía "piatelli" y no
  // aparecía, porque la pestaña era "En stock" y ese vino no tenía botellas.
  const piatelli = vino({ _id: "p", name: "Piatelli", quantity: 0 });
  const otro = vino({ _id: "o", name: "Otro", quantity: 5 });
  const enStock = (w) => Number(w.quantity) > 0;

  it("amplía cuando la vista no tiene nada pero la bodega sí", () => {
    const r = resultadosDe([piatelli, otro], {
      terms: terminosDe("piatelli"),
      enLaVista: enStock,
      pasa: (w) => pasaBusqueda(w, terminosDe("piatelli")),
    });
    expect(r.ampliada).toBe(true);
    expect(r.lista.map((w) => w._id)).toEqual(["p"]);
  });

  it("no amplía sin búsqueda: la vista vacía es una respuesta válida", () => {
    const r = resultadosDe([piatelli], {
      terms: [],
      enLaVista: enStock,
      pasa: () => true,
    });
    expect(r.ampliada).toBe(false);
    expect(r.lista).toHaveLength(0);
  });

  it("si la vista tiene resultados, no amplía aunque haya más afuera", () => {
    const r = resultadosDe([piatelli, otro], {
      terms: terminosDe("a"),
      enLaVista: enStock,
      pasa: () => true,
    });
    expect(r.ampliada).toBe(false);
    expect(r.lista.map((w) => w._id)).toEqual(["o"]);
  });
});

describe("resumen de la cabecera", () => {
  it("el promedio sale solo de los puntuados", () => {
    // Promediando todos, cada vino sin puntuar entra como un cero: con 3 vinos
    // y 1 puntuado en 4, daría 1.3 en vez de 4.
    const r = resumenDeBodega([vino({ rating: 4 }), vino({ rating: 0 }), vino({ rating: 0 })]);
    expect(r.promedio).toBe(4);
    expect(r.puntuados).toBe(1);
  });

  it("sin ningún puntuado el promedio es null, no cero", () => {
    // Un cero se lee como "mis vinos son malos"; null hace que la cabecera no
    // muestre la métrica.
    expect(resumenDeBodega([vino({ rating: 0 })]).promedio).toBeNull();
  });

  it("cuenta botellas y vinos con stock por separado", () => {
    const r = resumenDeBodega([vino({ quantity: 6 }), vino({ quantity: 0 })]);
    expect(r.botellas).toBe(6);
    expect(r.vinosConStock).toBe(1);
    expect(r.total).toBe(2);
  });

  it("probado se cuenta por el campo, no por el stock", () => {
    const r = resumenDeBodega([vino({ tasted: true, quantity: 3 }), vino({ tasted: false })]);
    expect(r.probados).toBe(1);
  });

  it("uvas distintas y región más frecuente", () => {
    const r = resumenDeBodega([
      vino({ varietal: "Malbec", region: "Mendoza" }),
      vino({ varietal: "Malbec", region: "Mendoza" }),
      vino({ varietal: "Bonarda", region: "Salta" }),
    ]);
    expect(r.uvasDistintas).toBe(2);
    expect(r.regionFrecuente).toBe("Mendoza");
    expect(r.regionFrecuenteVeces).toBe(2);
  });

  it("con la bodega vacía no inventa nada", () => {
    const r = resumenDeBodega([]);
    expect(r).toMatchObject({ total: 0, botellas: 0, promedio: null, regionFrecuente: null });
  });
});

describe("la línea de resumen", () => {
  const frases = (vinos) => frasesDelResumen(resumenDeBodega(vinos));

  it("con botellas dice cuántas, en cuántos vinos y cuántas uvas", () => {
    expect(
      frases([
        vino({ quantity: 3, varietal: "Malbec" }),
        vino({ quantity: 1, varietal: "Bonarda" }),
      ])
    ).toEqual(["4 botellas en 2 vinos", "2 uvas"]);
  });

  it("con una botella por vino no repite el número", () => {
    expect(frases([vino({ quantity: 1, varietal: "Malbec" }), vino({ quantity: 1, varietal: "Malbec" })])[0]).toBe(
      "2 botellas"
    );
  });

  it("sin botellas (los ya tomados) cuenta vinos, no botellas", () => {
    expect(frases([vino({ quantity: 0, tasted: true }), vino({ quantity: 0, tasted: true })])).toEqual([
      "2 vinos ya tomados",
      "1 uva",
    ]);
  });

  it("no mete el promedio: la línea tiene que entrar en un renglón del teléfono", () => {
    expect(frases([vino({ quantity: 1, rating: 4.4 })]).some((f) => f.includes("★"))).toBe(false);
  });

  it("sin nada que contar no dice nada", () => {
    expect(frases([])).toEqual([]);
  });
});

describe("frasesDelResumen: números grandes", () => {
  it("lleva separador de miles (es-AR) para que no se pegue ni se corte", async () => {
    const { frasesDelResumen } = await import("../src/utils/bodegaResumen");
    const frases = frasesDelResumen({ botellas: 1000100051, vinosConStock: 41, probados: 0, uvasDistintas: 3 });
    expect(frases[0]).toBe("1.000.100.051 botellas en 41 vinos");
    expect(frases[1]).toBe("3 uvas");
  });

  it("singular sin separador", async () => {
    const { frasesDelResumen } = await import("../src/utils/bodegaResumen");
    expect(frasesDelResumen({ botellas: 1, vinosConStock: 1, probados: 0, uvasDistintas: 1 })).toEqual(["1 botella", "1 uva"]);
  });
});

describe("filtros por bodega y puntaje, y fichas rápidas por dimensión", () => {
  it("pasaBusqueda filtra por bodega exacta y por puntaje mínimo (sin puntuar no pasa)", async () => {
    const { pasaBusqueda } = await import("../src/utils/bodegaFiltros");
    const a = { name: "A", winery: "Catena", rating: 4.5 };
    const b = { name: "B", winery: "Rutini", rating: 3 };
    const c = { name: "C", winery: "Catena", rating: 0 };
    expect(pasaBusqueda(a, [], { winery: "Catena" })).toBe(true);
    expect(pasaBusqueda(b, [], { winery: "Catena" })).toBe(false);
    expect(pasaBusqueda(a, [], { puntajeMin: "4" })).toBe(true);
    expect(pasaBusqueda(b, [], { puntajeMin: "4" })).toBe(false);
    expect(pasaBusqueda(c, [], { puntajeMin: "3" })).toBe(false);
    expect(pasaBusqueda(c, [], { puntajeMin: "all", winery: "all" })).toBe(true);
  });

  it("opcionesDe suma las bodegas, sin repetir y en orden", async () => {
    const { opcionesDe } = await import("../src/utils/bodegaFiltros");
    expect(opcionesDe([{ winery: "Rutini" }, { winery: "Catena" }, { winery: "Rutini" }, {}]).bodegas).toEqual(["Catena", "Rutini"]);
  });

  it("chipsRapidosDe: por cantidad, con el activo siempre visible y sin nada si hay un solo valor", async () => {
    const { chipsRapidosDe } = await import("../src/utils/bodegaFiltros");
    const vinos = [
      ...Array.from({ length: 3 }, () => ({ varietal: "Malbec" })),
      ...Array.from({ length: 2 }, () => ({ varietal: "Cabernet Sauvignon" })),
      { varietal: "Tannat" },
      { varietal: "Syrah" },
    ];
    expect(chipsRapidosDe(vinos, "uva").map((c) => [c.id, c.n])).toEqual([
      ["Malbec", 3],
      ["Cabernet Sauvignon", 2],
      ["Syrah", 1],
      ["Tannat", 1],
    ]);
    // Con corte a 2, el activo que quedó afuera se agrega igual.
    expect(chipsRapidosDe(vinos, "uva", { max: 2, activo: "Tannat" }).map((c) => c.id)).toEqual(["Malbec", "Cabernet Sauvignon", "Tannat"]);
    expect(chipsRapidosDe([{ varietal: "Malbec" }, { varietal: "Malbec" }], "uva")).toEqual([]);
    expect(chipsRapidosDe(vinos, "inexistente")).toEqual([]);
    expect(chipsRapidosDe(null, "uva")).toEqual([]);
  });

  it("chipsRapidosDe sirve también para región y bodega", async () => {
    const { chipsRapidosDe } = await import("../src/utils/bodegaFiltros");
    const vinos = [{ region: "Salta", winery: "Colomé" }, { region: "Mendoza", winery: "Catena" }, { region: "Mendoza", winery: "Catena" }];
    expect(chipsRapidosDe(vinos, "region").map((c) => c.id)).toEqual(["Mendoza", "Salta"]);
    expect(chipsRapidosDe(vinos, "bodega").map((c) => c.id)).toEqual(["Catena", "Colomé"]);
  });
});

describe("orden por defecto: lo más reciente primero", () => {
  const dia = (d) => `2026-10-${String(d).padStart(2, "0")}T12:00:00.000Z`;

  it("fechaReciente toma lo más nuevo entre cargarlo, reponer botellas y abrir una", async () => {
    const { fechaReciente } = await import("../src/utils/bodegaFiltros");
    const w = { createdAt: dia(1), lastConsumedAt: dia(10), lots: [{ addedAt: dia(5) }, { addedAt: dia(20) }] };
    expect(fechaReciente(w)).toBe(new Date(dia(20)).getTime());
    expect(fechaReciente({ createdAt: dia(3) })).toBe(new Date(dia(3)).getTime());
    expect(fechaReciente({})).toBe(0);
    expect(fechaReciente(null)).toBe(0);
  });

  it("por defecto ordena por esa fecha SIN poner primero lo que tiene stock", async () => {
    const { ordenarVinos } = await import("../src/utils/bodegaFiltros");
    const vinos = [
      { _id: "viejo-con-stock", name: "A", quantity: 3, createdAt: dia(1) },
      { _id: "reciente-sin-stock", name: "B", quantity: 0, lastConsumedAt: dia(25) },
      { _id: "medio-con-stock", name: "C", quantity: 1, createdAt: dia(10) },
    ];
    expect(ordenarVinos(vinos, { sortBy: "recent" }).map((w) => w._id)).toEqual([
      "reciente-sin-stock",
      "medio-con-stock",
      "viejo-con-stock",
    ]);
  });

  it("al elegir otro orden, el stock vuelve a ir primero", async () => {
    const { ordenarVinos } = await import("../src/utils/bodegaFiltros");
    const vinos = [
      { _id: "sin-stock-mejor", name: "A", quantity: 0, rating: 5 },
      { _id: "con-stock", name: "B", quantity: 2, rating: 3 },
    ];
    expect(ordenarVinos(vinos, { sortBy: "rating" }).map((w) => w._id)).toEqual(["con-stock", "sin-stock-mejor"]);
  });
});
