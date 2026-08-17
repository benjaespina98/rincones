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
 * independientes— pero no por fuera: la diferencia se elegía con un botón chico
 * que ponía las botellas en cero, y después media app le hablaba a esa copa como
 * si estuviera en la cava ("En tu bodega desde el 12 de marzo").
 *
 * Estos tests fijan las dos mitades del arreglo: que la pregunta se haga de
 * frente al cargar, y que después nada afirme una tenencia que no existió.
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
  it("por defecto la botella es tuya y entra con stock", () => {
    const onConfirm = vi.fn();
    render(<ScanReview reading={LECTURA} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: /agregar a mi bodega/i }));
    expect(onConfirm.mock.calls[0][0].quantity).toBe(1);
  });

  it("elegir 'lo tomé afuera' guarda sin sumar ninguna botella", () => {
    const onConfirm = vi.fn();
    render(<ScanReview reading={LECTURA} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: /lo tomé afuera/i }));

    // El botón de guardar cambia de nombre: es lo que hace que la consecuencia
    // se lea ANTES de tocarlo, y no después en un aviso.
    const guardar = screen.getByRole("button", { name: /guardarlo como probado/i });
    fireEvent.click(guardar);
    expect(onConfirm.mock.calls[0][0].quantity).toBe(0);
  });

  it("con la botella afuera no se pregunta cuántas", () => {
    render(<ScanReview reading={LECTURA} onConfirm={vi.fn()} />);
    expect(screen.getByText(/¿cuántas botellas\?/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /lo tomé afuera/i }));
    expect(screen.queryByText(/¿cuántas botellas\?/i)).toBeNull();
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
