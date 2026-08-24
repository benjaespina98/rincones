import { describe, it, expect } from "vitest";
import { paginas } from "../src/utils/pagination";

/**
 * El paginador del panel muestra números para poder saltar de página. El
 * registro de actividad puede tener cientos, así que la lista se recorta: lo
 * que se prueba acá es que el recorte nunca esconda las tres cosas que hacen
 * falta para orientarse —dónde estás, dónde empieza y dónde termina—.
 */
describe("paginas", () => {
  it("con pocas páginas las muestra todas, sin huecos", () => {
    expect(paginas(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(paginas(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("siempre deja a la vista la primera, la última y la actual", () => {
    const lista = paginas(50, 120);
    expect(lista).toContain(1);
    expect(lista).toContain(120);
    expect(lista).toContain(50);
  });

  it("no crece con el total: 8 páginas y 8000 ocupan lo mismo", () => {
    // Es la razón de ser del recorte. Sin esto, el registro con 300 páginas
    // dibujaba 300 botones y el paginador tapaba la tabla.
    const chica = paginas(4, 8).length;
    const enorme = paginas(4000, 8000).length;
    expect(enorme).toBeLessThanOrEqual(chica + 2);
  });

  it("marca los saltos con un hueco, y sólo cuando de verdad hay salto", () => {
    // Un hueco de una sola página no se marca: el "…" ocupa lo mismo que el
    // número que estaría escondiendo.
    const lista = paginas(1, 20);
    expect(lista).toContain(null);
    expect(lista.every((p, i) => !(p === null && lista[i + 1] - lista[i - 1] === 2))).toBe(true);
  });

  it("los números salen en orden y sin repetirse", () => {
    const numeros = paginas(6, 40).filter((p) => p !== null);
    expect([...numeros].sort((a, b) => a - b)).toEqual(numeros);
    expect(new Set(numeros).size).toBe(numeros.length);
  });

  it("cerca de los bordes no se sale del rango", () => {
    for (const actual of [1, 2, 39, 40]) {
      const numeros = paginas(actual, 40).filter((p) => p !== null);
      expect(Math.min(...numeros)).toBeGreaterThanOrEqual(1);
      expect(Math.max(...numeros)).toBeLessThanOrEqual(40);
    }
  });
});
