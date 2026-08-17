import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CellarReady from "../src/components/CellarReady";
import { getCellarReady } from "../src/services/wineApi";

vi.mock("../src/services/wineApi", () => ({ getCellarReady: vi.fn() }));

/**
 * "Listos para abrir": la única sección de la home que habla de vinos que YA
 * tenés.
 *
 * Lo que se fija acá es lo que la hace barata y silenciosa, que es la condición
 * para que pueda vivir en la home: no pide nada cuando no puede haber nada, y si
 * el pedido falla desaparece en vez de ensuciar la pantalla principal.
 */

/**
 * La cosecha es lo que permite calcular la ventana, y va a propósito: la
 * tarjeta NO usa el `cellarStatus` que manda el servidor —que dice "Último año
 * óptimo", las palabras viejas— sino el mismo `getCellarStatus` del cliente que
 * usa la ficha del vino. Un Malbec 2019 da la ventana 2022 – 2029.
 */
const UN_VINO = [
  {
    _id: "w1",
    name: "Saint Felicien",
    winery: "Catena Zapata",
    varietal: "Malbec",
    type: "red",
    vintage: 2019,
    quantity: 2,
    cellarStatus: { status: "peak", label: "Óptimo — quedan 3 años" },
  },
];

const montar = (props) =>
  render(
    <MemoryRouter>
      <CellarReady {...props} />
    </MemoryRouter>
  );

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("Listos para abrir", () => {
  it("no pide nada si no tenés botellas", () => {
    montar({ enabled: false });
    expect(getCellarReady).not.toHaveBeenCalled();
    expect(screen.queryByText(/listos para abrir/i)).toBeNull();
  });

  it("muestra tus vinos en su punto, con la ventana y cuántas te quedan", async () => {
    getCellarReady.mockResolvedValue(UN_VINO);
    montar({ enabled: true });

    await waitFor(() => expect(screen.getByText(/listos para abrir/i)).toBeTruthy());
    expect(screen.getByText("Saint Felicien")).toBeTruthy();
    // La ventana calculada por el cliente, la misma que muestra la ficha del
    // vino. Si esto empieza a fallar es porque las dos mitades de la app
    // volvieron a contar la guarda de dos maneras distintas.
    expect(screen.getByText("2022 – 2029")).toBeTruthy();
    expect(screen.getByText("2 botellas")).toBeTruthy();
    expect(screen.queryByText(/óptimo/i)).toBeNull();
  });

  it("con una sola botella lo dice con palabras, no con un número", async () => {
    getCellarReady.mockResolvedValue([{ ...UN_VINO[0], quantity: 1 }]);
    montar({ enabled: true });

    await waitFor(() => expect(screen.getByText("última botella")).toBeTruthy());
  });

  it("si no hay nada en su punto, la sección no existe", async () => {
    getCellarReady.mockResolvedValue([]);
    montar({ enabled: true });

    await waitFor(() => expect(getCellarReady).toHaveBeenCalled());
    expect(screen.queryByText(/listos para abrir/i)).toBeNull();
  });

  it("si el pedido falla, la home sigue como si nada", async () => {
    getCellarReady.mockRejectedValue(new Error("red caída"));
    montar({ enabled: true });

    await waitFor(() => expect(getCellarReady).toHaveBeenCalled());
    expect(screen.queryByText(/listos para abrir/i)).toBeNull();
    // Y sobre todo: ningún cartel de error. Es una sección de más sobre una
    // pantalla que ya funciona.
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
