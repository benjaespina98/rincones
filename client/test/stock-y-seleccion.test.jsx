import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import AddStockSheet from "../src/components/AddStockSheet";
import BulkEditSheet from "../src/components/BulkEditSheet";
import { camposDelLote } from "../src/utils/camposDelLote";
import { useLongPress } from "../src/hooks/useLongPress";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AddStockSheet (sumar botellas)", () => {
  const vino = { _id: "1", name: "Trumpeter", quantity: 0, tasted: true };

  it("sumar una por defecto, con el atajo de 6 y el total que va a haber", () => {
    const onConfirm = vi.fn();
    render(<AddStockSheet wine={vino} onConfirm={onConfirm} onCancel={vi.fn()} />);
    expect(screen.getByText(/vas a tener 1/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "6" }));
    expect(screen.getByText(/vas a tener 6/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /sumar 6 botellas/i }));
    expect(onConfirm).toHaveBeenCalledWith(6);
  });

  it("suma al stock que ya había y aclara que un vino ya tomado conserva su historial", () => {
    render(<AddStockSheet wine={{ ...vino, quantity: 2 }} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Una botella más" }));
    expect(screen.getByText(/vas a tener 4/)).toBeInTheDocument();
    expect(screen.getByText(/sigue figurando como ya tomado/i)).toBeInTheDocument();
  });

  it("no baja de una botella", () => {
    render(<AddStockSheet wine={vino} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Una botella menos" })).toBeDisabled();
  });

  it("con varios vinos dice cuántas botellas son en total", () => {
    render(<AddStockSheet wine={{ name: "Varios", quantity: 0 }} lote={4} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    expect(screen.getByText(/12 botellas en total/)).toBeInTheDocument();
    expect(screen.getByText(/a cada uno de los 4 vinos/i)).toBeInTheDocument();
  });
});

describe("camposDelLote / BulkEditSheet", () => {
  it("sólo viaja lo que se completó", () => {
    expect(camposDelLote({ type: "keep", region: "  ", cellarLocation: "" })).toEqual({});
    expect(camposDelLote({ type: "white", region: " Valle de Uco ", cellarLocation: "Cava 1" })).toEqual({
      type: "white",
      region: "Valle de Uco",
      cellarLocation: "Cava 1",
    });
    expect(camposDelLote()).toEqual({});
  });

  it("'Aplicar cambios' está apagado hasta que se complete algo y manda sólo eso", () => {
    const onConfirm = vi.fn();
    render(<BulkEditSheet cantidad={3} onConfirm={onConfirm} onCancel={vi.fn()} />);
    const aplicar = screen.getByRole("button", { name: /aplicar cambios/i });
    expect(aplicar).toBeDisabled();
    expect(screen.getByRole("heading", { name: /editar 3 vinos/i })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/valle de uco/i), { target: { value: "Salta" } });
    expect(aplicar).not.toBeDisabled();
    fireEvent.click(aplicar);
    expect(onConfirm).toHaveBeenCalledWith({ region: "Salta" });
  });
});

describe("useLongPress (mantener apretado)", () => {
  beforeEach(() => vi.useFakeTimers());

  const ev = (x = 0, y = 0) => ({ button: 0, clientX: x, clientY: y, preventDefault() {} });

  it("dispara después de mantener y la siguiente fueLarga() lo avisa una sola vez", () => {
    const onLong = vi.fn();
    const { result } = renderHook(() => useLongPress(onLong, { ms: 400 }));
    act(() => result.current.handlers.onPointerDown(ev()));
    act(() => vi.advanceTimersByTime(399));
    expect(onLong).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(2));
    expect(onLong).toHaveBeenCalledTimes(1);
    expect(result.current.fueLarga()).toBe(true);
    expect(result.current.fueLarga()).toBe(false);
  });

  it("un toque corto no dispara", () => {
    const onLong = vi.fn();
    const { result } = renderHook(() => useLongPress(onLong, { ms: 400 }));
    act(() => result.current.handlers.onPointerDown(ev()));
    act(() => vi.advanceTimersByTime(100));
    act(() => result.current.handlers.onPointerUp());
    act(() => vi.advanceTimersByTime(1000));
    expect(onLong).not.toHaveBeenCalled();
    expect(result.current.fueLarga()).toBe(false);
  });

  it("si el dedo se mueve (es un scroll) se cancela", () => {
    const onLong = vi.fn();
    const { result } = renderHook(() => useLongPress(onLong, { ms: 400, tolerancia: 10 }));
    act(() => result.current.handlers.onPointerDown(ev(0, 0)));
    act(() => result.current.handlers.onPointerMove(ev(0, 40)));
    act(() => vi.advanceTimersByTime(1000));
    expect(onLong).not.toHaveBeenCalled();
  });

  it("deshabilitado no dispara, y el botón derecho del mouse tampoco", () => {
    const onLong = vi.fn();
    const { result } = renderHook(() => useLongPress(onLong, { ms: 400, habilitado: false }));
    act(() => result.current.handlers.onPointerDown(ev()));
    act(() => vi.advanceTimersByTime(1000));
    expect(onLong).not.toHaveBeenCalled();

    const otro = renderHook(() => useLongPress(onLong, { ms: 400 }));
    act(() => otro.result.current.handlers.onPointerDown({ ...ev(), button: 2 }));
    act(() => vi.advanceTimersByTime(1000));
    expect(onLong).not.toHaveBeenCalled();
  });
});
