import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, renderHook, act } from "@testing-library/react";

const { createWine, deleteWine, updateWine, toasts } = vi.hoisted(() => ({
  createWine: vi.fn(),
  deleteWine: vi.fn(),
  updateWine: vi.fn(async () => ({})),
  toasts: { addToast: vi.fn(() => "t1"), removeToast: vi.fn(), showSuccess: vi.fn(), showError: vi.fn() },
}));

vi.mock("../src/services/wineApi", () => ({ createWine, deleteWine, updateWine }));
const { getWishes, deleteWish, createWish } = vi.hoisted(() => ({ getWishes: vi.fn(async () => []), deleteWish: vi.fn(async () => ({})), createWish: vi.fn(async () => ({})) }));
vi.mock("../src/services/wishApi", () => ({ getWishes, deleteWish, createWish }));
vi.mock("../src/services/analyticsApi", () => ({ trackEvent: vi.fn() }));
vi.mock("../src/context/ToastContext", () => ({ useToast: () => toasts }));

const { catalogWineToPayload } = await import("../src/utils/catalogWine");
const { default: AddToCellarSheet } = await import("../src/components/AddToCellarSheet");
const { useAddToCellar } = await import("../src/hooks/useAddToCellar");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const VINO = { id: "c1", name: "Alamos", winery: "Catena Zapata", region: "Mendoza", varietal: "Malbec", type: "red", image: "https://res.cloudinary.com/x/a.jpg" };

describe("catalogWineToPayload", () => {
  it("arma el alta con los datos del catálogo: sin cosecha inventada y con la cantidad elegida", () => {
    const p = catalogWineToPayload(VINO, 3);
    expect(p).toMatchObject({ name: "Alamos", winery: "Catena Zapata", varietal: "Malbec", type: "red", vintage: "", quantity: 3, tasted: false });
    expect(p.image).toBe(VINO.image);
    expect(p.identification.source).toBe("manual");
    expect(p.identification.matchedFrom).toBe("busqueda-catalogo");
  });

  it("con cero botellas entra ya probado", () => {
    const p = catalogWineToPayload(VINO, 0);
    expect(p.quantity).toBe(0);
    expect(p.tasted).toBe(true);
  });

  it("no manda fotos embebidas (data:) ni cantidades fuera de rango", () => {
    expect(catalogWineToPayload({ ...VINO, image: "data:image/jpeg;base64,AAAA" }, 1).image).toBe("");
    expect(catalogWineToPayload({ ...VINO, image: "http://x.com/a.jpg" }, 1).image).toBe("");
    expect(catalogWineToPayload(VINO, 5000).quantity).toBe(999);
    expect(catalogWineToPayload(VINO, -2).quantity).toBe(0);
  });
});

describe("AddToCellarSheet", () => {
  it("por defecto agrega una botella y deja elegir cuántas", () => {
    const onConfirm = vi.fn();
    render(<AddToCellarSheet wine={VINO} onConfirm={onConfirm} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "6" }));
    fireEvent.click(screen.getByRole("button", { name: "Agregar 6 botellas" }));
    expect(onConfirm).toHaveBeenCalledWith(6);
  });

  it("'lo tomé afuera' confirma con cero botellas", () => {
    const onConfirm = vi.fn();
    render(<AddToCellarSheet wine={VINO} onConfirm={onConfirm} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Ya lo tomé" }));
    expect(screen.queryByRole("button", { name: "Una botella más" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onConfirm).toHaveBeenCalledWith(0);
  });

  it("no renderiza sin vino", () => {
    const { container } = render(<AddToCellarSheet wine={null} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(container.textContent).toBe("");
  });
});

describe("useAddToCellar", () => {
  it("agrega, avisa con Deshacer y le cuenta a la pantalla que ahora es tuyo", async () => {
    createWine.mockResolvedValue({ wine: { _id: "w1", name: "Alamos" }, merged: false, added: 1 });
    const alAgregar = vi.fn();
    const { result } = renderHook(() => useAddToCellar({ alAgregar }));
    act(() => result.current.abrir(VINO));
    expect(result.current.vino).toBe(VINO);
    await act(async () => {
      await result.current.confirmar(2);
    });
    expect(createWine).toHaveBeenCalledTimes(1);
    expect(createWine.mock.calls[0][0]).toMatchObject({ name: "Alamos", quantity: 2 });
    expect(alAgregar).toHaveBeenCalledWith(VINO, { quantity: 2, merged: false });
    expect(toasts.addToast.mock.calls[0][0]).toMatch(/agregado a tu bodega/);
    expect(toasts.addToast.mock.calls[0][3].label).toBe("Deshacer");
    expect(result.current.vino).toBeNull();
  });

  it("si estaba guardado para probar, lo saca de Guardados", async () => {
    createWine.mockResolvedValue({ wine: { _id: "w1", name: "Alamos" }, merged: false, added: 1 });
    getWishes.mockResolvedValue([
      { _id: "d1", name: "ÁLAMOS", winery: "catena zapata" },
      { _id: "d2", name: "Otro", winery: "Catena Zapata" },
    ]);
    const { result } = renderHook(() => useAddToCellar({}));
    act(() => result.current.abrir(VINO));
    await act(async () => {
      await result.current.confirmar(1);
    });
    await vi.waitFor(() => expect(deleteWish).toHaveBeenCalledTimes(1));
    expect(deleteWish).toHaveBeenCalledWith("d1");
  });

  it("un deseo con corazón y notas no los pierde al pasar a la bodega: el vino los hereda", async () => {
    createWine.mockResolvedValue({ wine: { _id: "w1", name: "Alamos", favorite: false, notes: "" }, merged: false, added: 1 });
    getWishes.mockResolvedValue([{ _id: "d1", name: "Alamos", winery: "Catena Zapata", favorite: true, notes: "para el cumple" }]);
    const { result } = renderHook(() => useAddToCellar({}));
    act(() => result.current.abrir(VINO));
    await act(async () => {
      await result.current.confirmar(1);
    });
    await vi.waitFor(() => expect(updateWine).toHaveBeenCalledTimes(1));
    expect(updateWine).toHaveBeenCalledWith("w1", { favorite: true, notes: "para el cumple" });
  });

  it("si el vino ya tenía notas, las del deseo no las pisan", async () => {
    createWine.mockResolvedValue({ wine: { _id: "w1", name: "Alamos", favorite: true, notes: "las mías" }, merged: true, added: 1 });
    getWishes.mockResolvedValue([{ _id: "d1", name: "Alamos", winery: "Catena Zapata", favorite: true, notes: "del deseo" }]);
    const { result } = renderHook(() => useAddToCellar({}));
    act(() => result.current.abrir(VINO));
    await act(async () => {
      await result.current.confirmar(1);
    });
    await vi.waitFor(() => expect(deleteWish).toHaveBeenCalled());
    expect(updateWine).not.toHaveBeenCalled();
  });

  it("deshacer un alta que vino de un deseo devuelve el deseo: no se pierden las dos cosas", async () => {
    createWine.mockResolvedValue({ wine: { _id: "w1", name: "Alamos" }, merged: false, added: 1 });
    deleteWine.mockResolvedValue({});
    getWishes.mockResolvedValue([{ _id: "d1", name: "Alamos", winery: "Catena Zapata", favorite: true, notes: "para el cumple", priority: 1, source: "manual" }]);
    const { result } = renderHook(() => useAddToCellar({}));
    act(() => result.current.abrir(VINO));
    await act(async () => {
      await result.current.confirmar(1);
    });
    await vi.waitFor(() => expect(deleteWish).toHaveBeenCalledWith("d1"));
    await act(async () => {
      await toasts.addToast.mock.calls[0][3].onClick();
    });
    expect(deleteWine).toHaveBeenCalledWith("w1");
    expect(createWish).toHaveBeenCalledTimes(1);
    expect(createWish.mock.calls[0][0]).toMatchObject({ name: "Alamos", winery: "Catena Zapata", favorite: true, notes: "para el cumple" });
  });

  it("deshacer un alta que NO venía de un deseo no inventa ninguno", async () => {
    createWine.mockResolvedValue({ wine: { _id: "w1", name: "Alamos" }, merged: false, added: 1 });
    deleteWine.mockResolvedValue({});
    getWishes.mockResolvedValue([]);
    const { result } = renderHook(() => useAddToCellar({}));
    act(() => result.current.abrir(VINO));
    await act(async () => {
      await result.current.confirmar(1);
    });
    await act(async () => {
      await toasts.addToast.mock.calls[0][3].onClick();
    });
    expect(createWish).not.toHaveBeenCalled();
  });

  it("si ya lo tenías suma botellas y no ofrece borrarlo", async () => {
    createWine.mockResolvedValue({ wine: { _id: "w1", name: "Alamos" }, merged: true, added: 2 });
    const { result } = renderHook(() => useAddToCellar({}));
    act(() => result.current.abrir(VINO));
    await act(async () => {
      await result.current.confirmar(2);
    });
    expect(toasts.addToast.mock.calls[0][0]).toMatch(/Ya tenías "Alamos": sumamos 2 botellas/);
    expect(toasts.addToast.mock.calls[0][3]).toBeUndefined();
  });

  it("si falla avisa y deja la hoja abierta para reintentar", async () => {
    createWine.mockRejectedValue(new Error("boom"));
    const alAgregar = vi.fn();
    const { result } = renderHook(() => useAddToCellar({ alAgregar }));
    act(() => result.current.abrir(VINO));
    await act(async () => {
      await result.current.confirmar(1);
    });
    expect(toasts.showError).toHaveBeenCalled();
    expect(alAgregar).not.toHaveBeenCalled();
    expect(result.current.vino).toBe(VINO);
  });
});
