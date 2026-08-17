import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MomentsDiary from "../src/components/MomentsDiary";
import { getAllMoments } from "../src/services/wineApi";

vi.mock("../src/services/wineApi", () => ({ getAllMoments: vi.fn() }));

/**
 * El diario vacío: cuándo invita y cuándo se calla.
 *
 * El diario es lo que distingue a Rincones de una planilla de inventario, y era
 * invisible hasta que alguien lo usaba por primera vez — o sea que sólo lo
 * descubría quien ya lo conocía. Pero tampoco corresponde ofrecerlo en un perfil
 * recién creado, donde no hay ninguna noche que anotar todavía.
 *
 * La regla que fija este test: se invita SÓLO a quien ya tomó vinos y no
 * escribió ninguno. Ahí la ausencia no es "todavía no empecé", es "no sabía que
 * podía".
 */

const montar = (props) =>
  render(
    <MemoryRouter>
      <MomentsDiary {...props} />
    </MemoryRouter>
  );

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("el diario sin momentos", () => {
  it("no ocupa lugar en un perfil que todavía no probó ningún vino", async () => {
    getAllMoments.mockResolvedValue([]);
    const { container } = montar({ probados: 0 });

    await waitFor(() => expect(getAllMoments).toHaveBeenCalled());
    expect(container.querySelector(".diary")).toBeNull();
  });

  it("invita a quien ya tomó vinos y no anotó ninguna noche", async () => {
    getAllMoments.mockResolvedValue([]);
    montar({ probados: 3 });

    await waitFor(() => expect(screen.getByText(/tu diario/i)).toBeTruthy());
    // El número sale de lo que la persona realmente hizo, no de una frase
    // genérica: es lo que hace que la invitación hable de su bodega.
    expect(screen.getByText(/3 vinos/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /vino que ya tomaste/i })).toBeTruthy();
  });

  it("con un solo vino probado habla en singular", async () => {
    getAllMoments.mockResolvedValue([]);
    montar({ probados: 1 });

    // Con el texto completo: "un vino" suelto aparece también en el botón de
    // abajo, y el test tiene que apuntar a la frase que cambia de número.
    await waitFor(() => expect(screen.getByText(/Ya probaste un vino/i)).toBeTruthy());
  });

  it("y dice que es privado, igual que el diario con contenido", async () => {
    getAllMoments.mockResolvedValue([]);
    montar({ probados: 2 });

    await waitFor(() => expect(screen.getByText(/sólo vos/i)).toBeTruthy());
  });
});
