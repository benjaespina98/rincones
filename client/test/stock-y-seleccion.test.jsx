import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import AddStockSheet from "../src/components/AddStockSheet";
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

  it("una pulsación larga sin click posterior no se traga el próximo toque (no queda pegada)", () => {
    const onLong = vi.fn();
    const { result } = renderHook(() => useLongPress(onLong, { ms: 400 }));
    act(() => result.current.handlers.onPointerDown(ev()));
    act(() => vi.advanceTimersByTime(500));
    expect(onLong).toHaveBeenCalledTimes(1);
    // El click nunca llegó (pointercancel). El siguiente toque, corto, empieza limpio.
    act(() => result.current.handlers.onPointerCancel());
    act(() => result.current.handlers.onPointerDown(ev()));
    act(() => result.current.handlers.onPointerUp());
    expect(result.current.fueLarga()).toBe(false);
  });

  it("el menú contextual sólo se suprime durante una pulsación larga", () => {
    const { result } = renderHook(() => useLongPress(vi.fn(), { ms: 400 }));
    const evento = { preventDefault: vi.fn() };
    result.current.handlers.onContextMenu(evento);
    expect(evento.preventDefault).not.toHaveBeenCalled();
    act(() => result.current.handlers.onPointerDown(ev()));
    result.current.handlers.onContextMenu(evento);
    expect(evento.preventDefault).toHaveBeenCalledTimes(1);
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
