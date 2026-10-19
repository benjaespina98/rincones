import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Si el vino que escaneás ya está en tu bodega, el servidor le suma las botellas (`merged`) en vez
 * de crear otro. Ese vino tiene historial: "Deshacer" borrándolo se llevaría puntaje, notas y
 * momentos. En ese caso el aviso cuenta lo que pasó y NO ofrece borrar.
 */
const { createWine, deleteWine, toast } = vi.hoisted(() => ({
  createWine: vi.fn(),
  deleteWine: vi.fn(),
  toast: { addToast: vi.fn(), removeToast: vi.fn(), showSuccess: vi.fn(), showError: vi.fn() },
}));

vi.mock("../src/context/ToastContext", () => ({ useToast: () => toast }));
vi.mock("../src/services/wineApi", () => ({ createWine, deleteWine }));
vi.mock("../src/services/wishApi", () => ({ createWish: vi.fn(), deleteWish: vi.fn() }));
vi.mock("../src/services/analyticsApi", () => ({ trackEvent: vi.fn() }));
vi.mock("../src/components/LabelScanner", () => ({ default: () => null }));

const { default: ScanWinePage } = await import("../src/pages/ScanWinePage");

beforeEach(() => {
  createWine.mockReset();
  deleteWine.mockReset();
  toast.addToast.mockReset();
});
afterEach(cleanup);

const guardar = async () => {
  render(
    <MemoryRouter initialEntries={[{ pathname: "/agregar", state: { wish: { name: "Norton Reserva", winery: "Norton", type: "red" } } }]}>
      <ScanWinePage />
    </MemoryRouter>
  );
  const boton = await waitFor(() => {
    const b = document.querySelector(".scan-review__save");
    expect(b).not.toBeNull();
    return b;
  });
  boton.click();
  await waitFor(() => expect(createWine).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(toast.addToast).toHaveBeenCalled());
  return toast.addToast.mock.calls[0];
};

describe("guardar un vino que ya tenías", () => {
  it("avisa cuántas botellas se sumaron y no ofrece Deshacer", async () => {
    createWine.mockResolvedValue({ wine: { _id: "w1", name: "Norton Reserva" }, merged: true, added: 2 });
    const [mensaje, , , accion] = await guardar();
    expect(mensaje).toMatch(/Ya tenías "Norton Reserva": sumamos 2 botellas/);
    expect(accion).toBeUndefined();
  });

  it("un vino nuevo sí ofrece Deshacer", async () => {
    createWine.mockResolvedValue({ wine: { _id: "w2", name: "Norton Reserva" }, merged: false, added: 0 });
    const [mensaje, , , accion] = await guardar();
    expect(mensaje).toMatch(/agregado a tu bodega/);
    expect(accion.label).toBe("Deshacer");
  });
});
