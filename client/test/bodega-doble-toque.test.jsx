import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within, act, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Doble toque en el stepper de una fila de Mi Bodega.
 *
 * Dos toques seguidos salen antes de que React repinte, así que el `disabled` del botón no
 * alcanza: los dos verían la fila libre y se descontarían dos botellas con un solo gesto. El
 * bloqueo vive en un ref por fila. Acá se dispara el doble toque de verdad (dos clicks síncronos).
 *
 * Nota: el «−» del stepper es «Abrir una botella» y llama a `openBottle`; `adjustWineStock` lo
 * llama el «+» (sumar). Los dos pasan por el mismo bloqueo y se prueban los dos.
 */
const { api, toast } = vi.hoisted(() => ({
  api: {
    getWines: vi.fn(),
    getWishes: vi.fn(),
    adjustWineStock: vi.fn(),
    openBottle: vi.fn(),
  },
  toast: { addToast: vi.fn(), removeToast: vi.fn(), showSuccess: vi.fn(), showError: vi.fn() },
}));

vi.mock("../src/context/ToastContext", () => ({ useToast: () => toast }));
vi.mock("../src/services/wineApi", async (importOriginal) => ({
  ...(await importOriginal()),
  getWines: (...a) => api.getWines(...a),
  adjustWineStock: (...a) => api.adjustWineStock(...a),
  openBottle: (...a) => api.openBottle(...a),
}));
vi.mock("../src/services/wishApi", async (importOriginal) => ({
  ...(await importOriginal()),
  getWishes: (...a) => api.getWishes(...a),
}));
vi.mock("../src/services/analyticsApi", () => ({ trackEvent: vi.fn() }));

const { default: BodyPage } = await import("../src/pages/BodyPage");
const { limpiarCacheDeBodega } = await import("../src/hooks/useWineCollection");
const { limpiarCacheDeDeseos } = await import("../src/hooks/useWishlist");

const vino = (_id, name) => ({ _id, name, quantity: 3, tasted: false, favorite: false, type: "red" });
const A = vino("a", "Alfa");
const B = vino("b", "Beta");

beforeEach(() => {
  limpiarCacheDeBodega();
  limpiarCacheDeDeseos();
  localStorage.clear();
  Object.values(api).forEach((f) => f.mockReset());
  Object.values(toast).forEach((f) => f.mockReset());
  api.getWines.mockResolvedValue([A, B]);
  api.getWishes.mockResolvedValue([]);
});
afterEach(cleanup);

const montar = async () => {
  render(
    <MemoryRouter>
      <BodyPage />
    </MemoryRouter>
  );
  await screen.findByRole("group", { name: /Botellas de Alfa/ });
};

const stepperDe = (nombre) => within(screen.getByRole("group", { name: new RegExp(`Botellas de ${nombre}`) }));

describe("doble toque en el stepper", () => {
  it("dos clicks síncronos en «−» de la misma fila abren una sola botella; otra fila sí puede", async () => {
    api.openBottle.mockReturnValue(new Promise(() => {})); // sigue en vuelo
    await montar();

    const menos = stepperDe("Alfa").getByRole("button", { name: "Abrir una botella" });
    fireEvent.click(menos);
    fireEvent.click(menos);
    expect(api.openBottle).toHaveBeenCalledTimes(1);

    // Otra fila no está bloqueada.
    fireEvent.click(stepperDe("Beta").getByRole("button", { name: "Abrir una botella" }));
    expect(api.openBottle).toHaveBeenCalledTimes(2);
    expect(api.openBottle.mock.calls[1][0]).toBe("b");
  });

  it("dos clicks síncronos en «+» de la misma fila ajustan el stock una sola vez; otra fila sí puede", async () => {
    api.adjustWineStock.mockReturnValue(new Promise(() => {}));
    await montar();

    const mas = stepperDe("Alfa").getByRole("button", { name: "Sumar una botella" });
    fireEvent.click(mas);
    fireEvent.click(mas);
    expect(api.adjustWineStock).toHaveBeenCalledTimes(1);

    fireEvent.click(stepperDe("Beta").getByRole("button", { name: "Sumar una botella" }));
    expect(api.adjustWineStock).toHaveBeenCalledTimes(2);
    expect(api.adjustWineStock.mock.calls[1][0]).toBe("b");
  });

  it("un 409 muestra el mensaje del server, recarga y libera la fila para reintentar", async () => {
    api.adjustWineStock.mockRejectedValueOnce({
      response: { status: 409, data: { message: "El stock cambió en otro dispositivo" } },
    });
    await montar();
    expect(api.getWines).toHaveBeenCalledTimes(1);

    fireEvent.click(stepperDe("Alfa").getByRole("button", { name: "Sumar una botella" }));

    await waitFor(() => expect(toast.showError).toHaveBeenCalledWith("El stock cambió en otro dispositivo"));
    // Recarga: la fila que se veía quedó vieja.
    await waitFor(() => expect(api.getWines).toHaveBeenCalledTimes(2));

    // El ref se liberó: un nuevo toque llega al server.
    api.adjustWineStock.mockResolvedValueOnce({ ...A, quantity: 4 });
    await act(async () => {
      fireEvent.click(stepperDe("Alfa").getByRole("button", { name: "Sumar una botella" }));
    });
    expect(api.adjustWineStock).toHaveBeenCalledTimes(2);
  });
});
