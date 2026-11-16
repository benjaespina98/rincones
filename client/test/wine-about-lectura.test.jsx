import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import WineAbout from "../src/components/WineAbout";

const largo = "Un Malbec de altura, con fruta negra madura y notas de violeta. ".repeat(4);
const wine = { _id: "1", name: "Nicasia", winery: "Catena Zapata", varietal: "Malbec", type: "red" };

describe("WineAbout: la descripción se abre completa", () => {
  it("tocar el texto abre la lectura completa en una hoja", () => {
    render(<WineAbout info={{ summary: largo, known: true }} wine={wine} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Leer la descripción completa" }));
    const hoja = screen.getByRole("dialog");
    expect(hoja).toHaveTextContent("fruta negra madura");
  });

  it("«Leer todo» hace lo mismo", () => {
    render(<WineAbout info={{ summary: largo, known: true }} wine={wine} />);
    fireEvent.click(screen.getByRole("button", { name: /Leer todo/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("un resumen corto y sin más detalle no es tocable", () => {
    render(<WineAbout info={{ summary: "Un tinto fácil.", known: true }} wine={wine} />);
    expect(screen.queryByRole("button", { name: "Leer la descripción completa" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Leer todo/ })).toBeNull();
  });
});
