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

describe("deshacer una edición en lote", () => {
  it("guarda lo que cada vino tenía antes, sólo de los campos que se tocan", async () => {
    const { instantaneaPrevia } = await import("../src/utils/deshacerLote");
    const vinos = [
      { _id: "1", type: "red", region: "Salta", cellar: { location: "Cava 1" } },
      { _id: "2", type: "white", region: "", cellar: {} },
      { _id: "3", type: "red", region: "Mendoza" },
    ];
    const foto = instantaneaPrevia(vinos, ["1", "2"], { region: "Valle de Uco", cellarLocation: "Heladera" });
    expect(foto).toEqual({
      1: { region: "Salta", cellarLocation: "Cava 1" },
      2: { region: "", cellarLocation: "" },
    });
    expect(foto).not.toHaveProperty("3");
  });

  it("cada vino recupera lo SUYO (no un valor común) y el tipo vacío cae a unknown", async () => {
    const { instantaneaPrevia } = await import("../src/utils/deshacerLote");
    const foto = instantaneaPrevia([{ _id: "1", type: "red" }, { _id: "2" }], ["1", "2"], { type: "white" });
    expect(foto[1].type).toBe("red");
    expect(foto[2].type).toBe("unknown");
  });

  it("tolera ids que ya no existen y entradas que no son listas", async () => {
    const { instantaneaPrevia } = await import("../src/utils/deshacerLote");
    expect(instantaneaPrevia([{ _id: "1", type: "red" }], ["9"], { type: "white" })).toEqual({});
    expect(instantaneaPrevia(null, ["1"], { type: "white" })).toEqual({});
    expect(instantaneaPrevia([], null, null)).toEqual({});
  });
});

describe("recorrerDeUno (operaciones en lote)", () => {
  it("aplica a cada uno en orden y separa los que salieron bien de los que fallaron", async () => {
    const { recorrerDeUno } = await import("../src/utils/enLote");
    const orden = [];
    const r = await recorrerDeUno(["a", "b", "c", "d"], async (id) => {
      orden.push(id);
      if (id === "b" || id === "d") throw new Error("falló");
    });
    expect(orden).toEqual(["a", "b", "c", "d"]);
    expect(r.exitosos).toEqual(["a", "c"]);
    expect(r.fallidos).toEqual(["b", "d"]);
    expect(r).toMatchObject({ ok: 2, total: 4 });
  });

  it("sin ids, o con algo que no es una lista, no hace nada", async () => {
    const { recorrerDeUno } = await import("../src/utils/enLote");
    const fn = vi.fn();
    expect(await recorrerDeUno([], fn)).toMatchObject({ ok: 0, total: 0 });
    expect(await recorrerDeUno(null, fn)).toMatchObject({ ok: 0, total: 0 });
    expect(fn).not.toHaveBeenCalled();
  });

  it("si falla todo, ok es 0 (la selección no se cierra)", async () => {
    const { recorrerDeUno } = await import("../src/utils/enLote");
    const r = await recorrerDeUno(["a", "b"], async () => {
      throw new Error("x");
    });
    expect(r).toMatchObject({ ok: 0, total: 2, fallidos: ["a", "b"] });
  });
});

describe("BulkEditSheet: lista de regiones", () => {
  it("ofrece las regiones recibidas para elegir (evita escribirlas distinto)", () => {
    render(<BulkEditSheet cantidad={2} regiones={["Salta", "Valle de Uco"]} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const lista = document.getElementById("bulk-edit-regiones");
    expect([...lista.querySelectorAll("option")].map((o) => o.value)).toEqual(["Salta", "Valle de Uco"]);
    expect(screen.getByPlaceholderText(/valle de uco/i).getAttribute("list")).toBe("bulk-edit-regiones");
  });
});
