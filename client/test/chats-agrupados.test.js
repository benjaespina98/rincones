import { describe, it, expect } from "vitest";
import { agruparPorFecha, grupoDe } from "../src/utils/chatsAgrupados";

// Un miércoles al mediodía, para que "ayer" y "hace una semana" no dependan de la hora.
const AHORA = new Date(2026, 9, 14, 12, 0, 0);
const hace = (dias, hora = 12) => new Date(2026, 9, 14 - dias, hora, 0, 0).toISOString();

describe("grupoDe", () => {
  it("separa por día calendario y no por horas transcurridas", () => {
    // 23:50 de anoche es "Ayer" a las 00:10, aunque pasaron veinte minutos.
    const poco = new Date(2026, 9, 15, 0, 10, 0);
    expect(grupoDe(new Date(2026, 9, 14, 23, 50, 0).toISOString(), poco)).toBe("Ayer");
  });

  it("Hoy, Ayer, 7 días, 30 días y más antiguas", () => {
    expect(grupoDe(hace(0, 8), AHORA)).toBe("Hoy");
    expect(grupoDe(hace(1), AHORA)).toBe("Ayer");
    expect(grupoDe(hace(2), AHORA)).toBe("Últimos 7 días");
    expect(grupoDe(hace(7), AHORA)).toBe("Últimos 7 días");
    expect(grupoDe(hace(8), AHORA)).toBe("Últimos 30 días");
    expect(grupoDe(hace(30), AHORA)).toBe("Últimos 30 días");
    expect(grupoDe(hace(31), AHORA)).toBe("Más antiguas");
    expect(grupoDe(hace(44), AHORA)).toBe("Más antiguas");
  });

  it("una fecha futura (reloj desfasado) cuenta como hoy, y una inválida como antigua", () => {
    expect(grupoDe(hace(-3), AHORA)).toBe("Hoy");
    expect(grupoDe("no es una fecha", AHORA)).toBe("Más antiguas");
    expect(grupoDe(undefined, AHORA)).toBe("Más antiguas");
  });
});

describe("agruparPorFecha", () => {
  const charlas = [
    { id: "1", title: "a", updatedAt: hace(0, 9) },
    { id: "2", title: "b", updatedAt: hace(0, 8) },
    { id: "3", title: "c", updatedAt: hace(1) },
    { id: "4", title: "d", updatedAt: hace(20) },
  ];

  it("agrupa respetando el orden en que llegan", () => {
    const g = agruparPorFecha(charlas, AHORA);
    expect(g.map((x) => [x.titulo, x.items.map((i) => i.id)])).toEqual([
      ["Hoy", ["1", "2"]],
      ["Ayer", ["3"]],
      ["Últimos 30 días", ["4"]],
    ]);
  });

  it("no inventa grupos vacíos, y sin conversaciones no hay grupos", () => {
    expect(agruparPorFecha([], AHORA)).toEqual([]);
    expect(agruparPorFecha(undefined, AHORA)).toEqual([]);
    expect(agruparPorFecha([charlas[3]], AHORA)).toHaveLength(1);
  });
});
