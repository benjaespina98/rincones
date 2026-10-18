import { describe, expect, it } from "vitest";
import { recorteDeVinos, VINOS_VISIBLES } from "../src/utils/recorteDeVinos";

const lista = (n, p) => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}` }));

describe("recorteDeVinos: una respuesta del Sommelier no puede llenar la pantalla", () => {
  it("muestra a lo sumo 3 vinos en total", () => {
    const r = recorteDeVinos({ wines: lista(6, "b"), descubrir: lista(6, "d") }, false);
    expect(r.bodega.length + r.nuevos.length).toBe(VINOS_VISIBLES);
    expect(r.ocultos).toBe(9);
  });

  it("deja lugar a una sugerencia nueva cuando hay de las dos", () => {
    const r = recorteDeVinos({ wines: lista(5, "b"), descubrir: lista(4, "d") }, false);
    expect(r.bodega).toHaveLength(2);
    expect(r.nuevos).toHaveLength(1);
  });

  it("sin sugerencias nuevas, tres de la bodega", () => {
    const r = recorteDeVinos({ wines: lista(5, "b") }, false);
    expect(r.bodega).toHaveLength(3);
    expect(r.nuevos).toHaveLength(0);
    expect(r.ocultos).toBe(2);
  });

  it("con pocos vinos no oculta nada", () => {
    const r = recorteDeVinos({ wines: lista(1, "b"), descubrir: lista(1, "d") }, false);
    expect(r.ocultos).toBe(0);
  });

  it("'ver todos' devuelve la lista entera", () => {
    const r = recorteDeVinos({ wines: lista(6, "b"), descubrir: lista(6, "d") }, true);
    expect(r.bodega).toHaveLength(6);
    expect(r.nuevos).toHaveLength(6);
    expect(r.ocultos).toBe(0);
  });

  it("tolera una respuesta sin vinos", () => {
    expect(recorteDeVinos({}, false)).toEqual({ bodega: [], nuevos: [], ocultos: 0 });
  });
});
