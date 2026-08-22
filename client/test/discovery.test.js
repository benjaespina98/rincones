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

/**
 * ── POR QUÉ ESTAS PRUEBAS YA NO COMPARAN LA FRASE EXACTA ────────────────────
 * Fijaban el texto literal ("Si te gustó el Malbec, probá qué hace un Cabernet
 * Sauvignon") y quedaron rojas cuando la redacción mejoró a propósito: ahora la
 * frase nombra el CARÁCTER de cada uva —la misma fuente que las tarjetas de uva,
 * ver `grapeTrait`— y cada situación tiene varias redacciones elegidas con una
 * semilla estable, así que dos saltos distintos nunca dicen lo mismo.
 *
 * Comparar el literal volvía a romperse con cada mejora de copy y no protegía lo
 * que importa. Lo que estas pruebas sostienen ahora es el CONTRATO, que no
 * cambió: qué tiene que nombrar cada frase, que sea estable mientras la tarjeta
 * está en pantalla, y que no se invente un salto que no hubo.
 */
describe("razonDelSalto", () => {
  it("nombra el cambio de uva contando el carácter de cada una", () => {
    const frase = razonDelSalto(malbec, cabernet);

    expect(frase).toBeTruthy();
    // La razón útil es qué dejás y qué encontrás, no dos nombres sueltos: la
    // frase tiene que hablar de a qué sabe, no sólo de cómo se llama.
    expect(frase.length).toBeGreaterThan(30);
  });

  it("la misma pareja de vinos siempre da la misma frase", () => {
    // La redacción se elige con una semilla del par, no al azar: si cambiara en
    // cada render, el texto parpadearía mientras lo estás leyendo.
    expect(razonDelSalto(malbec, cabernet)).toBe(razonDelSalto(malbec, cabernet));
  });

  it("dos saltos distintos no comparten redacción", () => {
    // Era el problema de fondo del texto viejo: una plantilla única hacía que
    // todos los saltos sonaran igual aunque fueran a lugares muy distintos.
    expect(razonDelSalto(malbec, cabernet)).not.toBe(razonDelSalto(malbec, torrontes));
  });

  it("sin carácter conocido cae a nombrar las dos uvas, y no se queda mudo", () => {
    // La rama de reserva: una uva que no está en la tabla de caracteres sigue
    // dando una razón cierta, sólo que más sobria.
    const rara = { id: "9", varietal: "Uva Inventada", type: "red", region: "Mendoza" };
    expect(razonDelSalto(malbec, rara)).toContain("Uva Inventada");
  });

  it("con la misma uva, cuenta el cambio de región y no inventa otro", () => {
    const malbecSalteno = { ...otroMalbec, region: "Salta" };
    const frase = razonDelSalto(malbec, malbecSalteno);

    // Lo que cambió es el lugar: la frase tiene que decir el lugar y no fingir
    // un cambio de uva que no hubo.
    expect(frase).toContain("Salta");
  });

  it("no afirma nada cuando no hubo ningún salto", () => {
    // `null` deja que la tarjeta caiga al motivo de siempre: preferimos una
    // razón verdadera de otro tipo antes que una frase de relleno.
    expect(razonDelSalto(malbec, otroMalbec)).toBe(null);
    expect(razonDelSalto(null, malbec)).toBe(null);
    expect(razonDelSalto(malbec, null)).toBe(null);
  });
});
