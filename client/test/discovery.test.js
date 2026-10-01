import { describe, it, expect } from "vitest";
import { elegirOtroDistinto, elegirEntrada } from "../src/utils/discovery";

/**
 * "Ver otro" tiene que devolver algo DISTINTO, no algo otro.
 *
 * El botón sorteaba un índice, y como las recomendaciones se parecen entre sí
 * —salen de tus gustos—, el sorteo devolvía otro Malbec de Mendoza la mayoría de
 * las veces: prometía salir de la rutina y entregaba la rutina.
 */
const malbec = { id: "1", varietal: "Malbec", type: "red", region: "Mendoza" };
const otroMalbec = { id: "2", varietal: "Malbec", type: "red", region: "Mendoza" };
const cabernet = { id: "3", varietal: "Cabernet Sauvignon", type: "red", region: "Mendoza" };
const torrontes = { id: "4", varietal: "Torrontés", type: "white", region: "Salta" };

// Azar fijo en el primer candidato: lo que se prueba es QUÉ candidatos hay, no
// cuál sale sorteado entre iguales.
const primero = () => 0;

describe("elegirOtroDistinto", () => {
  it("prefiere el salto más grande: otra uva y otro tipo", () => {
    const lista = [malbec, otroMalbec, cabernet, torrontes];
    expect(elegirOtroDistinto(lista, 0, primero)).toBe(3);
  });

  it("sin cambio de tipo disponible, se conforma con otra uva", () => {
    const lista = [malbec, otroMalbec, cabernet];
    expect(elegirOtroDistinto(lista, 0, primero)).toBe(2);
  });

  it("si todo es igual devuelve otro igual, pero nunca el mismo", () => {
    const lista = [malbec, otroMalbec];
    const elegido = elegirOtroDistinto(lista, 0, primero);
    expect(elegido).toBe(1);
    expect(elegido).not.toBe(0);
  });

  it("nunca devuelve el índice actual, se lo pida como se lo pida", () => {
    const lista = [malbec, otroMalbec, cabernet, torrontes];
    for (let i = 0; i < lista.length; i += 1) {
      for (const azar of [() => 0, () => 0.5, () => 0.999]) {
        expect(elegirOtroDistinto(lista, i, azar)).not.toBe(i);
      }
    }
  });

  it("avisa cuando no hay a dónde ir, en vez de repetir la tarjeta", () => {
    // Quien llama necesita distinguirlo para esconder el botón: ofrecer otra
    // botella cuando no hay otra es prometer algo que no va a pasar.
    expect(elegirOtroDistinto([malbec], 0, primero)).toBe(null);
    expect(elegirOtroDistinto([], 0, primero)).toBe(null);
    expect(elegirOtroDistinto(null, 0, primero)).toBe(null);
  });

  it("un tipo desconocido no se hace pasar por un salto", () => {
    // Si "unknown" contara como otro tipo, el botón diría que te llevó a otro
    // lado cuando lo único que pasó es que falta un dato.
    const sinTipo = { id: "5", varietal: "Malbec", type: "unknown", region: "Mendoza" };
    const lista = [malbec, sinTipo, cabernet];
    expect(elegirOtroDistinto(lista, 0, primero)).toBe(2);
  });

  it("devuelve un índice válido siempre que devuelva algo", () => {
    const lista = [malbec, otroMalbec, cabernet, torrontes];
    const elegido = elegirOtroDistinto(lista, 1, () => 0.99);
    expect(Number.isInteger(elegido)).toBe(true);
    expect(elegido).toBeGreaterThanOrEqual(0);
    expect(elegido).toBeLessThan(lista.length);
  });
});


/**
 * Por dónde se ENTRA a Descubrí. Se entraba siempre por la primera del ranking,
 * y como el set es estable durante el día, la home mostraba el mismo vino cada
 * vez que se abría la app.
 */
describe("elegirEntrada", () => {
  const set = [
    { id: "a" },
    { id: "b" },
    { id: "c" },
    { id: "d" },
    { id: "e" },
    { id: "f" },
  ];

  it("sortea entre las primeras del ranking y nunca baja de ahí", () => {
    const vistos = new Set();
    for (let i = 0; i < 200; i += 1) vistos.add(elegirEntrada(set, null, { top: 4 }));
    expect([...vistos].sort()).toEqual([0, 1, 2, 3]);
  });

  it("nunca devuelve la que se vio la última vez", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(elegirEntrada(set, "a", { top: 4 })).not.toBe(0);
      expect(elegirEntrada(set, "c", { top: 4 })).not.toBe(2);
    }
  });

  it("compara ids como texto: un id numérico guardado como string sigue contando", () => {
    const numericos = [{ id: 1 }, { id: 2 }, { id: 3 }];
    for (let i = 0; i < 100; i += 1) {
      expect(elegirEntrada(numericos, "1", { top: 3 })).not.toBe(0);
    }
  });

  it("una recomendación que ya no está entre las primeras no condiciona nada", () => {
    // Lo último visto fue la sexta ("f"): fuera del tope, así que las cuatro valen.
    const vistos = new Set();
    for (let i = 0; i < 200; i += 1) vistos.add(elegirEntrada(set, "f", { top: 4 }));
    expect(vistos.size).toBe(4);
  });

  it("usa el azar que se le pasa: con el mismo azar, la misma entrada", () => {
    expect(elegirEntrada(set, null, { top: 4, azar: () => 0 })).toBe(0);
    expect(elegirEntrada(set, null, { top: 4, azar: () => 0.99 })).toBe(3);
  });

  it("con una sola recomendación, o ninguna, devuelve 0", () => {
    expect(elegirEntrada([{ id: "x" }], "x")).toBe(0);
    expect(elegirEntrada([], null)).toBe(0);
    expect(elegirEntrada(undefined, null)).toBe(0);
  });

  it("con dos recomendaciones alterna: la que no se vio", () => {
    const dos = [{ id: "p" }, { id: "q" }];
    expect(elegirEntrada(dos, "p")).toBe(1);
    expect(elegirEntrada(dos, "q")).toBe(0);
  });
});
