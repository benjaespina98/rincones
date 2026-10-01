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
import { resumenDeBodega } from "../src/utils/bodegaResumen";

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
