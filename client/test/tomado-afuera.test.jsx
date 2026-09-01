import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ScanReview from "../src/components/ScanReview";
import WineIdentity from "../src/components/WineIdentity";
import { nuncaEstuvoEnTuCava } from "../src/utils/cellarTime";

/**
 * ── LA BOTELLA QUE NUNCA FUE TUYA ───────────────────────────────────────────
 *
 * Son dos cargas distintas: "compré este vino" y "lo tomé en un restaurante y me
 * lo quiero acordar". La app las distinguía por dentro —stock y probado son ejes
 * independientes— pero no por fuera: había que elegir con un botón chico entre
 * "la tengo yo" y "la tomé afuera" ANTES de poder decir cuántas botellas, un
 * paso de más para lo mismo que el número ya iba a contestar. Ahora es un único
 * contador que arranca en cero: el cero ES "la tomé afuera", no un caso aparte.
 *
 * Estos tests fijan las dos mitades del arreglo: que el número por defecto no
 * afirme una tenencia que no existió, y que después nada la afirme tampoco.
 */

afterEach(cleanup);

const LECTURA = {
  source: "gemini",
  values: {
    winery: "Catena Zapata",
    line: "Saint Felicien",
    properName: "",
    varietal: "Malbec",
    vintage: "2019",
    region: "Luján de Cuyo, Mendoza",
    type: "red",
  },
  confidence: { line: 95, winery: 93, varietal: 92, vintage: 90, region: 88, type: 85 },
  serverIssues: [],
};

describe("al cargar: ¿es tuya o la tomaste afuera?", () => {
  it("por defecto arranca en cero: se guarda como probado, sin botellas", () => {
    const onConfirm = vi.fn();
    render(<ScanReview reading={LECTURA} onConfirm={onConfirm} />);

    // El botón ya nombra la consecuencia del cero: no hace falta elegir nada
    // aparte para llegar a "lo tomé".
    const guardar = screen.getByRole("button", { name: /guardarlo como probado/i });
    fireEvent.click(guardar);
    expect(onConfirm.mock.calls[0][0].quantity).toBe(0);
  });

  it("subir el contador a uno pasa a sumar la botella a la bodega", () => {
    const onConfirm = vi.fn();
    render(<ScanReview reading={LECTURA} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: /una botella más/i }));

    // El botón cambia de nombre solo, con el número: es lo que hace que la
    // consecuencia se lea ANTES de tocarlo, y no después en un aviso.
    const guardar = screen.getByRole("button", { name: /agregar a mi bodega/i });
    fireEvent.click(guardar);
    expect(onConfirm.mock.calls[0][0].quantity).toBe(1);
  });

  it("la frase de abajo del contador cambia con el número", () => {
    render(<ScanReview reading={LECTURA} onConfirm={vi.fn()} />);
    expect(screen.getByText(/queda anotado entre tus probados/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /una botella más/i }));
    expect(screen.queryByText(/queda anotado entre tus probados/i)).toBeNull();
    expect(screen.getByText(/entra a tu bodega, con stock/i)).toBeInTheDocument();
  });
});

describe("después: qué se puede afirmar sobre esa botella", () => {
  const TOMADO_AFUERA = {
    name: "Saint Felicien",
    winery: "Catena Zapata",
    type: "red",
    quantity: 0,
    tasted: true,
    lots: [],
    createdAt: "2026-03-12T18:00:00.000Z",
  };

  it("un vino que tomaste afuera nunca estuvo en tu cava", () => {
    expect(nuncaEstuvoEnTuCava(TOMADO_AFUERA)).toBe(true);
  });

  it("uno que tuviste y se te terminó, sí estuvo", () => {
    // El lote agotado no se borra nunca: es el registro de que esas botellas
    // existieron, y es lo que permite distinguir los dos casos sin un campo nuevo.
    expect(
      nuncaEstuvoEnTuCava({
        ...TOMADO_AFUERA,
        lots: [{ addedAt: "2025-01-01", quantity: 2, remaining: 0, depletedAt: "2026-01-01" }],
      })
    ).toBe(false);
  });

  it("uno con botellas en la cava, tampoco", () => {
    expect(nuncaEstuvoEnTuCava({ ...TOMADO_AFUERA, quantity: 3 })).toBe(false);
  });

  it("la ficha no dice 'en tu bodega desde' sobre una copa que tomaste afuera", () => {
    render(<WineIdentity wine={TOMADO_AFUERA} />);

    expect(screen.queryByText(/en tu bodega desde/i)).toBeNull();
    expect(screen.getByText(/lo tomaste afuera/i)).toBeInTheDocument();
  });

  it("y sobre uno que se te terminó habla en pasado", () => {
    render(
      <WineIdentity
        wine={{
          ...TOMADO_AFUERA,
          lots: [{ addedAt: "2025-01-01", quantity: 2, remaining: 0, depletedAt: "2026-01-01" }],
        }}
      />
    );

    expect(screen.getByText(/lo tuviste desde/i)).toBeInTheDocument();
    expect(screen.queryByText(/en tu bodega desde/i)).toBeNull();
  });
});
