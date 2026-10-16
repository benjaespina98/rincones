import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * "Cargar a mano" mandaba `type: "click"`: el botón tenía `onClick={startManual}`, y React le
 * pasa el EVENTO como primer argumento, que `startManual` leía como el vino `previo`
 * (`previo?.type` → "click"). El server lo rechazaba y nadie podía agregar un vino a mano.
 * Estos tests ejercitan el toque real y no la función suelta: es lo que el bug rompía.
 */
const { createWine, toast } = vi.hoisted(() => ({
  createWine: vi.fn(),
  toast: { addToast: vi.fn(), removeToast: vi.fn(), showSuccess: vi.fn(), showError: vi.fn() },
}));

vi.mock("../src/context/ToastContext", () => ({ useToast: () => toast }));
vi.mock("../src/services/wineApi", () => ({ createWine, deleteWine: vi.fn() }));
vi.mock("../src/services/wishApi", () => ({ createWish: vi.fn(), deleteWish: vi.fn() }));
vi.mock("../src/services/analyticsApi", () => ({ trackEvent: vi.fn() }));
vi.mock("../src/components/LabelScanner", () => ({ default: () => null }));

const { default: ScanWinePage } = await import("../src/pages/ScanWinePage");

beforeEach(() => {
  createWine.mockReset();
  createWine.mockResolvedValue({ wine: { _id: "w1", name: "X" } });
});
afterEach(cleanup);

const montar = (state) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: "/agregar", state }]}>
      <ScanWinePage />
    </MemoryRouter>
  );

const confirmar = async () => {
  const principal = await waitFor(() => {
    const b = document.querySelector(".scan-review__save");
    expect(b).not.toBeNull();
    return b;
  });
  fireEvent.click(principal);
  await waitFor(() => expect(createWine).toHaveBeenCalledTimes(1));
  return createWine.mock.calls[0][0];
};

describe("Cargar a mano manda un tipo del vocabulario", () => {
  it("el toque en 'Cargar a mano' no cuela el evento como tipo", async () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: /cargar a mano/i }));
    const nombre = await waitFor(() => {
      const el = screen.queryByPlaceholderText("Lo que dice grande en la etiqueta");
      expect(el).not.toBeNull();
      return el;
    });
    fireEvent.change(nombre, { target: { value: "QA Manual" } });
    const payload = await confirmar();
    expect(payload.type).toBe("unknown");
    expect(payload.type).not.toBe("click");
  });

  it("'Ya lo tengo' con un tipo basura cae a unknown", async () => {
    montar({ wish: { name: "A", winery: "B", type: "click" } });
    const payload = await confirmar();
    expect(payload.type).toBe("unknown");
  });

  it("'Ya lo tengo' conserva un tipo válido", async () => {
    montar({ wish: { name: "A", winery: "B", type: "red" } });
    const payload = await confirmar();
    expect(payload.type).toBe("red");
  });
});
