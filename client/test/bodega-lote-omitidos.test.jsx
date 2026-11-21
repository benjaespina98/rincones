import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Acción en lote sobre la selección de Mi Bodega.
 *
 * El server procesa un máximo por pedido y avisa cuántos dejó afuera (`omitidos`). Lo que se fija
 * acá es lo que ve la persona: los que quedaron afuera siguen elegidos para repetir, el aviso es
 * de error (sin un "éxito" contradictorio al lado), los botones quedan habilitados y el singular
 * se dice en singular. Y un vino ya borrado desde otro dispositivo no queda fantasma en pantalla.
 */
const { api, toast } = vi.hoisted(() => ({
  api: {
    getWines: vi.fn(),
    bulkWines: vi.fn(),
    getWishes: vi.fn(),
  },
  toast: { addToast: vi.fn(), removeToast: vi.fn(), showSuccess: vi.fn(), showError: vi.fn() },
}));

vi.mock("../src/context/ToastContext", () => ({ useToast: () => toast }));
vi.mock("../src/services/wineApi", async (importOriginal) => ({
  ...(await importOriginal()),
  getWines: (...a) => api.getWines(...a),
  bulkWines: (...a) => api.bulkWines(...a),
}));
vi.mock("../src/services/wishApi", async (importOriginal) => ({
  ...(await importOriginal()),
  getWishes: (...a) => api.getWishes(...a),
}));
vi.mock("../src/services/analyticsApi", () => ({ trackEvent: vi.fn() }));

const { default: BodyPage } = await import("../src/pages/BodyPage");
const { limpiarCacheDeBodega } = await import("../src/hooks/useWineCollection");
const { limpiarCacheDeDeseos } = await import("../src/hooks/useWishlist");

const vino = (_id, name) => ({ _id, name, quantity: 2, tasted: false, favorite: false, type: "red" });
const A = vino("a", "Alfa");
const B = vino("b", "Beta");
const C = vino("c", "Gamma");

beforeEach(() => {
  limpiarCacheDeBodega();
  limpiarCacheDeDeseos();
  localStorage.clear();
  Object.values(api).forEach((f) => f.mockReset());
  Object.values(toast).forEach((f) => f.mockReset());
  api.getWines.mockResolvedValue([A, B, C]);
  api.getWishes.mockResolvedValue([]);
});
afterEach(cleanup);

const filaDe = (nombre) =>
  screen.getAllByRole("button").find((b) => b.classList.contains("wine-row__main") && b.textContent.includes(nombre));

const montarYSeleccionarTodos = async () => {
  render(
    <MemoryRouter>
      <BodyPage />
    </MemoryRouter>
  );
  fireEvent.click(await screen.findByRole("button", { name: /seleccionar/i }));
  fireEvent.click(screen.getByRole("button", { name: "Todos" }));
  expect(screen.getByText("3 elegidos")).toBeTruthy();
};

const eliminarSeleccion = async (etiqueta) => {
  fireEvent.click(screen.getByRole("button", { name: etiqueta }));
  const dialogo = await screen.findByRole("dialog");
  fireEvent.click(within(dialogo).getByRole("button", { name: "Eliminar" }));
};

describe("eliminar en lote con omitidos", () => {
  it("2 de 3 procesados y 1 omitido: queda elegido sólo el omitido, hay error y los botones andan", async () => {
    api.bulkWines.mockResolvedValue({ affected: 2, ids: ["a", "b"], omitidos: 1 });
    await montarYSeleccionarTodos();

    await eliminarSeleccion("Eliminar 3");

    await waitFor(() => expect(api.bulkWines).toHaveBeenCalledTimes(1));
    expect(api.bulkWines.mock.calls[0][1]).toBe("delete");
    await waitFor(() => expect(toast.showError).toHaveBeenCalledTimes(1));
    expect(toast.showError.mock.calls[0][0]).toMatch(/Quedó 1 vino sin tocar/);
    expect(toast.showSuccess).toHaveBeenCalledWith("2 vinos eliminados");

    // Los borrados salieron de la lista; el omitido sigue y sigue elegido.
    await waitFor(() => expect(filaDe("Alfa")).toBeUndefined());
    expect(filaDe("Beta")).toBeUndefined();
    expect(filaDe("Gamma").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("1 elegido")).toBeTruthy();

    // Nada quedó trabado: se puede repetir la acción.
    const eliminar = screen.getByRole("button", { name: "Eliminar" });
    expect(eliminar.disabled).toBe(false);
    expect(screen.getByRole("button", { name: "Ninguno" }).disabled).toBe(false);
  });

  it("con 0 procesados y omitidos > 0 no hay un «0 vinos eliminados» de éxito junto al error", async () => {
    api.bulkWines.mockResolvedValue({ affected: 0, ids: [], omitidos: 3 });
    await montarYSeleccionarTodos();

    await eliminarSeleccion("Eliminar 3");

    await waitFor(() => expect(toast.showError).toHaveBeenCalledTimes(1));
    expect(toast.showError.mock.calls[0][0]).toMatch(/Quedaron 3 vinos sin tocar/);
    expect(toast.showSuccess).not.toHaveBeenCalled();
    expect(screen.getByText("3 elegidos")).toBeTruthy();
  });

  it("omitidos === 0 sale de la selección y avisa el éxito", async () => {
    api.bulkWines.mockResolvedValue({ affected: 3, ids: ["a", "b", "c"], omitidos: 0 });
    await montarYSeleccionarTodos();

    await eliminarSeleccion("Eliminar 3");

    await waitFor(() => expect(toast.showSuccess).toHaveBeenCalledWith("3 vinos eliminados"));
    expect(toast.showError).not.toHaveBeenCalled();
    // Fuera del modo selección: vuelve «Seleccionar» y no hay barra de acciones.
    await waitFor(() => expect(screen.queryByRole("group", { name: /acciones sobre lo seleccionado/i })).toBeNull());
  });

  it("singular: un solo vino se dice «1 vino eliminado»", async () => {
    api.bulkWines.mockResolvedValue({ affected: 1, ids: ["a"], omitidos: 0 });
    render(
      <MemoryRouter>
        <BodyPage />
      </MemoryRouter>
    );
    fireEvent.click(await screen.findByRole("button", { name: /seleccionar/i }));
    fireEvent.click(filaDe("Alfa"));
    expect(screen.getByText("1 elegido")).toBeTruthy();

    await eliminarSeleccion("Eliminar");

    await waitFor(() => expect(toast.showSuccess).toHaveBeenCalledWith("1 vino eliminado"));
  });

  it("un vino que ya no existe (no vuelve en ids ni en omitidos) también sale de la lista", async () => {
    // Se borró en otro dispositivo: el server procesa a y b, y c no está.
    api.bulkWines.mockResolvedValue({ affected: 2, ids: ["a", "b"], omitidos: 0 });
    await montarYSeleccionarTodos();

    await eliminarSeleccion("Eliminar 3");

    await waitFor(() => expect(toast.showSuccess).toHaveBeenCalledWith("2 vinos eliminados"));
    await waitFor(() => expect(filaDe("Gamma")).toBeUndefined());
    expect(filaDe("Alfa")).toBeUndefined();
  });
});
