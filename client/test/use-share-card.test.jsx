import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

/**
 * `useShareCard` es la orquestación: decide entre compartir de verdad y
 * descargar, y sabe distinguir "cancelaste el menú" de "algo falló de
 * verdad". Dibujar el canvas de por medio (`buildShareCardFile`) se mockea
 * acá — es la parte sin DOM real, y ya la prueba `share-card.test.js` por su
 * cuenta — para que esto se pruebe sin necesitar un canvas de verdad, que
 * jsdom no sabe renderizar.
 */
const archivoFalso = new File(["contenido"], "rincones-vino.jpg", { type: "image/jpeg" });
const buildShareCardFileSpy = vi.fn(() => Promise.resolve(archivoFalso));

vi.mock("../src/utils/shareCard", () => ({
  buildShareCardFile: (...args) => buildShareCardFileSpy(...args),
}));

const { useShareCard } = await import("../src/hooks/useShareCard.js");

const wine = { name: "Saint Felicien", winery: "Catena Zapata" };

describe("useShareCard", () => {
  let shareSpy;
  let canShareSpy;
  let createObjectURLSpy;
  let revokeObjectURLSpy;
  let clickSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    shareSpy = vi.fn(() => Promise.resolve());
    canShareSpy = vi.fn(() => true);
    // jsdom no trae Web Share API: se define acá, como haría un navegador que sí la tiene.
    navigator.share = shareSpy;
    navigator.canShare = canShareSpy;

    createObjectURLSpy = vi.fn(() => "blob:mock-url");
    revokeObjectURLSpy = vi.fn();
    global.URL.createObjectURL = createObjectURLSpy;
    global.URL.revokeObjectURL = revokeObjectURLSpy;

    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    delete navigator.share;
    delete navigator.canShare;
    clickSpy.mockRestore();
  });

  test("con Web Share disponible, comparte el archivo generado", async () => {
    const { result } = renderHook(() => useShareCard());

    let resultado;
    await act(async () => {
      resultado = await result.current.shareCard(wine);
    });

    expect(resultado).toBe("shared");
    expect(buildShareCardFileSpy).toHaveBeenCalledWith(wine, null);
    expect(canShareSpy).toHaveBeenCalledWith({ files: [archivoFalso] });
    expect(shareSpy).toHaveBeenCalledTimes(1);
    expect(shareSpy.mock.calls[0][0].files).toEqual([archivoFalso]);
    // El plan B no se toca cuando el plan A funcionó.
    expect(createObjectURLSpy).not.toHaveBeenCalled();
  });

  test("cerrar el menú de compartir sin elegir nada no cae al plan B", async () => {
    const abort = new Error("cancelado");
    abort.name = "AbortError";
    shareSpy.mockRejectedValue(abort);

    const { result } = renderHook(() => useShareCard());
    let resultado;
    await act(async () => {
      resultado = await result.current.shareCard(wine);
    });

    expect(resultado).toBe("cancelled");
    expect(createObjectURLSpy).not.toHaveBeenCalled();
  });

  test("si share() falla por otra razón, descarga el archivo", async () => {
    shareSpy.mockRejectedValue(new Error("no se pudo"));

    const { result } = renderHook(() => useShareCard());
    let resultado;
    await act(async () => {
      resultado = await result.current.shareCard(wine);
    });

    expect(resultado).toBe("downloaded");
    expect(createObjectURLSpy).toHaveBeenCalledWith(archivoFalso);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  test("sin Web Share (o sin poder compartir ESTE archivo), va derecho a la descarga", async () => {
    canShareSpy.mockReturnValue(false);

    const { result } = renderHook(() => useShareCard());
    let resultado;
    await act(async () => {
      resultado = await result.current.shareCard(wine);
    });

    expect(resultado).toBe("downloaded");
    expect(shareSpy).not.toHaveBeenCalled();
    expect(createObjectURLSpy).toHaveBeenCalledWith(archivoFalso);
  });

  test("si dibujar la ficha falla, no revienta: avisa 'error'", async () => {
    buildShareCardFileSpy.mockRejectedValueOnce(new Error("sin canvas"));

    const { result } = renderHook(() => useShareCard());
    let resultado;
    await act(async () => {
      resultado = await result.current.shareCard(wine);
    });

    expect(resultado).toBe("error");
    expect(shareSpy).not.toHaveBeenCalled();
  });

  test("pasa la cata (moment) cuando se comparte una en particular", async () => {
    const moment = { rating: 4, notes: "Buenísimo" };
    const { result } = renderHook(() => useShareCard());

    await act(async () => {
      await result.current.shareCard(wine, moment);
    });

    expect(buildShareCardFileSpy).toHaveBeenCalledWith(wine, moment);
  });

  test("marca `sharing` mientras genera y lo apaga al terminar", async () => {
    let resolverBuild;
    buildShareCardFileSpy.mockReturnValueOnce(new Promise((r) => { resolverBuild = r; }));

    const { result } = renderHook(() => useShareCard());
    expect(result.current.sharing).toBe(false);

    let promesa;
    act(() => {
      promesa = result.current.shareCard(wine);
    });
    expect(result.current.sharing).toBe(true);

    await act(async () => {
      resolverBuild(archivoFalso);
      await promesa;
    });
    expect(result.current.sharing).toBe(false);
  });
});
