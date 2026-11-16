import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, configure } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MomentsDiary from "../src/components/MomentsDiary";
import { getAllMoments } from "../src/services/wineApi";

vi.mock("../src/services/wineApi", () => ({ getAllMoments: vi.fn() }));

// Con la suite entera corriendo en paralelo el diario (carga perezosa) tardaba más del
// segundo por defecto en aparecer y el test fallaba sin que nada estuviera roto.
configure({ asyncUtilTimeout: 5000 });

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

    await waitFor(() => expect(screen.getByText(/tu diario/i)).toBeTruthy(), { timeout: 5000 });
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

/**
 * La lectura de conjunto que va arriba de la lista. Sale de los momentos ya
 * cargados —no cuesta una consulta— y contesta lo que una pila cronológica no
 * puede: cuántas noches van, cuál repetís y con quién.
 */
const momento = (props) => ({
  _id: Math.random().toString(36),
  consumedAt: "2026-07-01",
  wine: { _id: "w1", name: "Saint Felicien", type: "red" },
  enBodega: true,
  companions: "",
  ...props,
});

describe("el resumen del diario", () => {
  it("con menos de tres momentos no saca conclusiones", async () => {
    getAllMoments.mockResolvedValue([momento({}), momento({})]);
    const { container } = montar({ probados: 4 });

    await waitFor(() => expect(container.querySelector(".diary__list")).toBeTruthy());
    expect(container.querySelector(".diary__resumen")).toBeNull();
  });

  it("cuenta las noches del año, el vino que más repetiste y con quién", async () => {
    getAllMoments.mockResolvedValue([
      momento({ companions: "Sofi" }),
      momento({ companions: "Sofi" }),
      momento({ wine: { _id: "w2", name: "Pispi", type: "red" }, companions: "" }),
    ]);
    montar({ probados: 4 });

    await waitFor(() =>
      expect(screen.getByText(/3 noches anotadas en 2026/i)).toBeTruthy()
    );
    expect(screen.getByText(/el que más repetiste es Saint Felicien/i)).toBeTruthy();
    expect(screen.getByText(/casi siempre con Sofi/i)).toBeTruthy();
  });

  it("no inventa una costumbre con un solo caso", async () => {
    // Tres vinos distintos y tres compañías distintas: no hay nada que repetir,
    // así que sólo queda la cuenta de noches.
    getAllMoments.mockResolvedValue([
      momento({ wine: { _id: "a", name: "Uno" }, companions: "Ana" }),
      momento({ wine: { _id: "b", name: "Dos" }, companions: "Beto" }),
      momento({ wine: { _id: "c", name: "Tres" }, companions: "Cami" }),
    ]);
    montar({ probados: 4 });

    await waitFor(() => expect(screen.getByText(/3 noches anotadas/i)).toBeTruthy());
    expect(screen.queryByText(/el que más repetiste/i)).toBeNull();
    expect(screen.queryByText(/casi siempre con/i)).toBeNull();
  });
});
