import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { getSuggestedWines } from "../src/services/wineApi";
import EstaNocheSheet from "../src/components/EstaNocheSheet";
import { OCASIONES, motivoDe, sinResultado } from "../src/utils/estaNoche";

vi.mock("../src/services/wineApi", () => ({ getSuggestedWines: vi.fn() }));
const sugeridos = getSuggestedWines;
vi.mock("../src/services/analyticsApi", () => ({ trackEvent: vi.fn() }));

const vino = (over = {}) => ({
  _id: "v1",
  name: "Malbec Reserva",
  winery: "Catena",
  type: "red",
  varietal: "Malbec",
  quantity: 2,
  matchReason: "",
  ...over,
});

const abrir = () =>
  render(
    <MemoryRouter>
      <EstaNocheSheet isOpen onClose={() => {}} />
    </MemoryRouter>
  );

beforeEach(() => {
  sugeridos.mockReset();
});

describe("utils/estaNoche", () => {
  it("cada ocasión pide una cosa sola: ganas o comida", () => {
    for (const o of OCASIONES) {
      expect(Object.keys(o.pedido)).toHaveLength(1);
      expect(["mood", "food"]).toContain(Object.keys(o.pedido)[0]);
    }
  });

  it("el motivo del server manda; sin motivo se nombra la ocasión", () => {
    const asado = OCASIONES.find((o) => o.id === "asado");
    const liviano = OCASIONES.find((o) => o.id === "liviano");
    expect(motivoDe(vino({ matchReason: "Está en su punto" }), asado)).toBe("Está en su punto");
    expect(motivoDe(vino(), asado)).toBe("Va con asado");
    expect(motivoDe(vino(), liviano)).toBe("Algo liviano");
  });

  it("el mensaje vacío distingue comida de ganas", () => {
    expect(sinResultado(OCASIONES.find((o) => o.id === "pescado"))).toContain("pescado");
    expect(sinResultado(OCASIONES.find((o) => o.id === "cuerpo"))).toBe("No tenés botellas para eso ahora.");
  });
});

describe("EstaNocheSheet", () => {
  it("no pide nada hasta que se elige una ocasión", () => {
    abrir();
    expect(sugeridos).not.toHaveBeenCalled();
    expect(screen.getAllByRole("button", { name: /liviano|cuerpo|brindar|asado/i }).length).toBeGreaterThan(0);
  });

  it("elegir una ocasión manda ese pedido y muestra una botella", async () => {
    sugeridos.mockResolvedValue([vino()]);
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Asado" }));
    expect(sugeridos).toHaveBeenCalledWith({ food: "asado" });
    expect(await screen.findByText("Malbec Reserva")).toBeInTheDocument();
    expect(screen.getByText("Va con asado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver vino" })).toBeInTheDocument();
    // Con una sola botella no hay «Otra».
    expect(screen.queryByRole("button", { name: /Otra/ })).toBeNull();
  });

  it("«Otra» recorre las sugerencias y vuelve al principio", async () => {
    sugeridos.mockResolvedValue([vino({ _id: "a", name: "Uno" }), vino({ _id: "b", name: "Dos" })]);
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Con cuerpo" }));
    expect(await screen.findByText("Uno")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Otra \(1\/2\)/ }));
    expect(screen.getByText("Dos")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Otra \(2\/2\)/ }));
    expect(screen.getByText("Uno")).toBeInTheDocument();
  });

  it("sin botellas para esa ocasión lo dice", async () => {
    sugeridos.mockResolvedValue([]);
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Pescado" }));
    await waitFor(() => expect(screen.getByText(/No tenés botellas que vayan con pescado/)).toBeInTheDocument());
  });

  it("si el pedido falla, avisa y no deja nada colgado", async () => {
    sugeridos.mockRejectedValue(new Error("red"));
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Pizza" }));
    expect(await screen.findByText(/No pudimos buscar ahora/)).toBeInTheDocument();
  });
});
