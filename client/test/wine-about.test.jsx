import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import WineAbout from "../src/components/WineAbout";
import WineStructure from "../src/components/WineStructure";

/**
 * "Sobre este vino": lo que la app sabe del vino.
 *
 * Vale un test porque el bloque decía la misma cosa dos y tres veces, y eso no se
 * ve leyendo el código de a un archivo: las barras y las pastillas de perfil son
 * los mismos cuatro ejes, y encima se contradecían.
 */

afterEach(cleanup);

const infoBase = {
  known: true,
  summary: "Un Malbec de entrada, frutado y fácil.",
  structure: { body: 3, acidity: 3, tannin: 3, sweetness: 1 },
  profile: ["Cuerpo medio", "Taninos suaves", "Seco"],
  aromas: ["ciruela", "cereza", "violetas", "frutos rojos", "vainilla", "pimienta"],
  foodPairing: ["asado", "empanadas", "pastas", "picada", "provoleta"],
};

describe("el bloque generado con IA", () => {
  it("no repite el perfil en pastillas cuando ya lo dicen las barras", () => {
    render(<WineAbout info={infoBase} />);

    // Las barras están…
    expect(screen.getByText("Perfil de sabor")).toBeInTheDocument();
    expect(screen.getByText("Cuerpo")).toBeInTheDocument();
    // …y las pastillas que decían lo mismo sin el número, no.
    expect(screen.queryByText("Cuerpo medio")).not.toBeInTheDocument();
    expect(screen.queryByText("Taninos suaves")).not.toBeInTheDocument();
  });

  it("muestra las pastillas sólo si no hubo barras", () => {
    render(<WineAbout info={{ ...infoBase, structure: null }} />);
    expect(screen.getByText("Cuerpo medio")).toBeInTheDocument();
  });

  it("corta las listas largas: cuatro aromas y cuatro maridajes", () => {
    render(<WineAbout info={infoBase} />);

    expect(screen.getByText("ciruela")).toBeInTheDocument();
    // Del quinto en adelante ya no distinguen este vino de ningún otro, y la
    // ficha se convierte en una pared de pastillas.
    expect(screen.queryByText("vainilla")).not.toBeInTheDocument();
    expect(screen.queryByText("provoleta")).not.toBeInTheDocument();
  });

  it("no ocupa lugar cuando no hay nada que mostrar", () => {
    const { container } = render(<WineAbout />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("las barras de estructura", () => {
  it("un 3 sobre 5 es 'Medio', no el extremo alto", () => {
    // El corte era `valor >= 3 ? alto : bajo`: un cuerpo de 3 se anunciaba
    // "Corpulento" mientras la lista de al lado decía "Cuerpo medio".
    render(<WineStructure structure={{ body: 3, acidity: 3, tannin: 3, sweetness: 1 }} />);

    expect(screen.getByText("Medio")).toBeInTheDocument();
    expect(screen.queryByText("Corpulento")).not.toBeInTheDocument();
  });

  it("los extremos siguen diciendo lo suyo", () => {
    render(<WineStructure structure={{ body: 5, acidity: 1, tannin: 4, sweetness: 1 }} />);

    expect(screen.getByText("Corpulento")).toBeInTheDocument();
    expect(screen.getByText("Suave")).toBeInTheDocument();
    expect(screen.getByText("Firmes")).toBeInTheDocument();
  });

  it("omite los taninos de un blanco en vez de dibujar una barra vacía", () => {
    render(<WineStructure structure={{ body: 2, acidity: 4, tannin: 1, sweetness: 1 }} />);
    expect(screen.queryByText("Taninos")).not.toBeInTheDocument();
  });
});
