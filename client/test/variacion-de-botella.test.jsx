import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import WineArtwork from "../src/components/WineArtwork";
import { variacionDeBotella, inicialDeMarca } from "../src/utils/variacionDeBotella";

/**
 * La botella de relleno de un vino sin foto tiene personalidad según su bodega, y es siempre la misma para
 * la misma bodega. Sin bodega se ve la botella genérica de siempre.
 */
afterEach(cleanup);

const BODEGAS = ["Catena Zapata", "Trapiche", "Luigi Bosca", "Piattelli", "Bodega Norton", "Finca Flichman", "Rutini", "Zuccardi", "Salentein", "Susana Balbo", "Achaval Ferrer", "Terrazas"];

describe("variacionDeBotella", () => {
  it("es estable: la misma bodega siempre da lo mismo, sin importar mayúsculas ni tildes", () => {
    expect(variacionDeBotella("Luigi Bosca")).toEqual(variacionDeBotella("luigi bosca"));
    expect(variacionDeBotella("Viñas de Balbo")).toEqual(variacionDeBotella("vinas de balbo"));
  });

  it("sin bodega no hay variación", () => {
    expect(variacionDeBotella("")).toBeNull();
    expect(variacionDeBotella(undefined)).toBeNull();
    expect(variacionDeBotella("   ")).toBeNull();
  });

  it("queda dentro de rango y hay variedad de verdad entre bodegas", () => {
    const vs = BODEGAS.map(variacionDeBotella);
    for (const v of vs) {
      expect(v.tono).toBeGreaterThanOrEqual(-7);
      expect(v.tono).toBeLessThanOrEqual(7);
      expect([0, 1, 2]).toContain(v.etiqueta);
      expect([0, 1, 2, 3]).toContain(v.capsula);
    }
    expect(new Set(vs.map((v) => v.etiqueta)).size).toBeGreaterThanOrEqual(2);
    expect(new Set(vs.map((v) => v.capsula)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(vs.map((v) => v.tono)).size).toBeGreaterThanOrEqual(6);
  });

  it("la inicial se saca del nombre propio, no del 'Bodega' o 'Finca' de adelante", () => {
    expect(inicialDeMarca("Bodega Norton")).toBe("N");
    expect(inicialDeMarca("Finca Flichman")).toBe("F");
    expect(inicialDeMarca("Viñas de Balbo")).toBe("B");
    expect(inicialDeMarca("Catena Zapata")).toBe("C");
    expect(inicialDeMarca("Él")).toBe("E");
    expect(inicialDeMarca("")).toBe("");
  });
});

describe("WineArtwork con bodega", () => {
  it("lleva la inicial en la etiqueta cuando entra, y el tono como variable", () => {
    const { container } = render(<WineArtwork type="red" size={120} marca="Bodega Norton" />);
    expect(container.querySelector(".wine-artwork__inicial")?.textContent).toBe("N");
    expect(container.querySelector(".wine-artwork").style.getPropertyValue("--tono")).toMatch(/deg$/);
  });

  it("en miniatura no hay letra (no se lee): quedan los renglones de siempre", () => {
    const { container } = render(<WineArtwork type="red" size={40} marca="Bodega Norton" />);
    expect(container.querySelector(".wine-artwork__inicial")).toBeNull();
    expect(container.querySelectorAll(".wine-artwork__renglon").length).toBe(2);
  });

  it("sin bodega es la botella genérica: sin letra, sin cápsula y sin tono", () => {
    const { container } = render(<WineArtwork type="red" size={120} />);
    expect(container.querySelector(".wine-artwork__inicial")).toBeNull();
    expect(container.querySelector(".wine-artwork__capsula")).toBeNull();
    expect(container.querySelector(".wine-artwork").style.getPropertyValue("--tono")).toBe("");
  });

  it("el espumante no lleva cápsula (ya tiene su bozal)", () => {
    for (const b of BODEGAS) {
      const { container, unmount } = render(<WineArtwork type="sparkling" size={120} marca={b} />);
      expect(container.querySelector(".wine-artwork__capsula")).toBeNull();
      unmount();
    }
  });

  it("dos bodegas distintas dibujan botellas distintas; la misma, idéntica", () => {
    const dibujo = (b) => {
      const { container, unmount } = render(<WineArtwork type="red" size={120} marca={b} />);
      const html = container.innerHTML;
      unmount();
      return html;
    };
    const distintos = new Set(BODEGAS.map(dibujo));
    expect(distintos.size).toBeGreaterThanOrEqual(10);
    expect(dibujo("Rutini")).toBe(dibujo("Rutini"));
  });
});
