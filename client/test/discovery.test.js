import { describe, it, expect } from "vitest";
import { elegirOtroDistinto, razonDelSalto } from "../src/utils/discovery";

/**
 * "Mostrame otra" tiene que devolver algo DISTINTO, no algo otro.
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

describe("razonDelSalto", () => {
  it("nombra el cambio de uva, que es la razón más útil", () => {
    expect(razonDelSalto(malbec, cabernet)).toBe(
      "Si te gustó el Malbec, probá qué hace un Cabernet Sauvignon"
    );
  });

  it("nombra el salto grande cuando cambian uva y tipo", () => {
    expect(razonDelSalto(malbec, torrontes)).toBe("Otro palo: Torrontés en vez de Malbec");
  });

  it("con la misma uva, cuenta el cambio de región y no inventa otro", () => {
    const malbecSalteno = { ...otroMalbec, region: "Salta" };
    expect(razonDelSalto(malbec, malbecSalteno)).toBe("La misma uva, pero de Salta");
  });

  it("no afirma nada cuando no hubo ningún salto", () => {
    // `null` deja que la tarjeta caiga al motivo de siempre: preferimos una
    // razón verdadera de otro tipo antes que una frase de relleno.
    expect(razonDelSalto(malbec, otroMalbec)).toBe(null);
    expect(razonDelSalto(null, malbec)).toBe(null);
    expect(razonDelSalto(malbec, null)).toBe(null);
  });
});
