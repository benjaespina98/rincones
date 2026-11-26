import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ScanReview from "../src/components/ScanReview";
import WineIdentity from "../src/components/WineIdentity";
import { nuncaEstuvoEnTuCava } from "../src/utils/cellarTime";

/**
 * ── LA BOTELLA QUE NUNCA FUE TUYA ───────────────────────────────────────────
 *
 * Son dos cargas distintas: comprar un vino, o haberlo tomado afuera. Se elige entre "Lo tengo" y "Ya lo tomé", a la vista.
 *
 * Estos tests fijan las dos mitades: que el valor por defecto no afirme otra cosa que lo habitual,
 * y que después nada afirme una tenencia ni una fecha que no existieron.
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
  // Arranca en UNA botella: casi todo el mundo escanea para guardar en su bodega.
  it("por defecto arranca en una: se guarda con stock", () => {
    const onConfirm = vi.fn();
    render(<ScanReview reading={LECTURA} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: /^guardar$/i }));
    expect(onConfirm.mock.calls[0][0].quantity).toBe(1);
  });

  it("«Ya lo tomé» lo guarda sin botellas, con el mismo botón Guardar", () => {
    const onConfirm = vi.fn();
    render(<ScanReview reading={LECTURA} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Ya lo tomé" }));
    fireEvent.click(screen.getByRole("button", { name: /^guardar$/i }));
    expect(onConfirm.mock.calls[0][0].quantity).toBe(0);
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
    // Sin fecha: la única disponible es la de la carga, que puede ser semanas posterior.
    expect(document.querySelector(".wine-id__since strong")).toBeNull();
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
