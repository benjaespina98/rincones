import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const api = vi.hoisted(() => ({
  listarConversaciones: vi.fn(),
  borrarConversacion: vi.fn(),
  borrarTodasLasConversaciones: vi.fn(),
}));
const toast = vi.hoisted(() => ({ showError: vi.fn() }));

vi.mock("../src/services/sommelierApi", () => api);
vi.mock("../src/context/ToastContext", () => ({ useToast: () => toast }));

import SommelierChats from "../src/components/SommelierChats";

/**
 * El panel de conversaciones del Sommelier.
 *
 * Lo que se prueba es lo que no se ve mirando: que el menú "⋯" no cierre el
 * cajón entero con un solo Escape, que borrar pregunte antes y que, si lo que
 * se borra es la charla abierta, la pantalla se entere. En jsdom no hay
 * `matchMedia`, así que el panel se comporta como en un teléfono (cajón modal).
 */

const hoy = new Date().toISOString();
const CHARLAS = [
  { id: "a", title: "¿Qué tomo con un asado?", updatedAt: hoy },
  { id: "b", title: "Maridaje para pastas", updatedAt: hoy },
];

const abrir = (props = {}) => {
  const handlers = {
    onClose: vi.fn(),
    onAbrir: vi.fn(),
    onNueva: vi.fn(),
    onBorrada: vi.fn(),
    onBorradasTodas: vi.fn(),
  };
  const utils = render(
    <SommelierChats abierto activoId={null} version="1" {...handlers} {...props} />
  );
  return { ...utils, ...handlers };
};

beforeEach(() => {
  api.listarConversaciones.mockReset().mockResolvedValue(CHARLAS);
  api.borrarConversacion.mockReset().mockResolvedValue(true);
  api.borrarTodasLasConversaciones.mockReset().mockResolvedValue(2);
  toast.showError.mockReset();
});

describe("SommelierChats", () => {
  it("cerrado, en el teléfono, no dibuja nada ni pide nada al servidor", () => {
    abrir({ abierto: false });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.listarConversaciones).not.toHaveBeenCalled();
  });

  it("abierto se anuncia como diálogo, agrupa por fecha y dice cuánto duran", async () => {
    abrir();
    const panel = await screen.findByRole("dialog", { name: "Tus conversaciones" });
    expect(panel).toHaveAttribute("aria-modal", "true");
    expect(await screen.findByText("Hoy")).toBeInTheDocument();
    expect(screen.getByText("¿Qué tomo con un asado?")).toBeInTheDocument();
    expect(screen.getByText(/45 días/)).toBeInTheDocument();
  });

  it("tocar una conversación la abre; la activa queda marcada", async () => {
    const { onAbrir } = abrir({ activoId: "b" });
    fireEvent.click(await screen.findByText("¿Qué tomo con un asado?"));
    expect(onAbrir).toHaveBeenCalledWith("a");
    expect(screen.getByText("Maridaje para pastas").closest("button")).toHaveAttribute(
      "aria-current",
      "true"
    );
  });

  it("'Nueva conversación' avisa y, en el teléfono, cierra el cajón", async () => {
    const { onNueva, onClose } = abrir();
    fireEvent.click(await screen.findByRole("button", { name: /nueva conversación/i }));
    expect(onNueva).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("cada fila tiene su menú '⋯', con 'Borrar'", async () => {
    abrir();
    const mas = await screen.findByRole("button", {
      name: 'Opciones de la conversación "¿Qué tomo con un asado?"',
    });
    expect(mas).toHaveAttribute("aria-haspopup", "menu");
    expect(mas).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(mas);
    expect(mas).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitem", { name: "Borrar" })).toBeInTheDocument();
  });

  it("Escape cierra el menú y NO el cajón entero", async () => {
    const { onClose } = abrir();
    fireEvent.click(
      await screen.findByRole("button", { name: /Opciones de la conversación "¿Qué tomo/ })
    );
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    // Un segundo Escape, ya sin menú, sí cierra el cajón.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("borrar pregunta primero, y recién al confirmar borra, saca la fila y avisa", async () => {
    const { onBorrada } = abrir();
    fireEvent.click(
      await screen.findByRole("button", { name: /Opciones de la conversación "¿Qué tomo/ })
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Borrar" }));

    // Todavía no se borró nada: se pregunta.
    expect(api.borrarConversacion).not.toHaveBeenCalled();
    const confirmacion = screen.getByText("¿Borrar esta conversación?").closest(".confirm-modal");
    fireEvent.click(within(confirmacion).getByRole("button", { name: "Borrar" }));

    await waitFor(() => expect(api.borrarConversacion).toHaveBeenCalledWith("a"));
    await waitFor(() => expect(onBorrada).toHaveBeenCalledWith("a"));
    expect(screen.queryByText("¿Qué tomo con un asado?")).toBeNull();
    expect(screen.getByText("Maridaje para pastas")).toBeInTheDocument();
  });

  it("cancelar el diálogo no borra nada", async () => {
    const { onBorrada } = abrir();
    fireEvent.click(
      await screen.findByRole("button", { name: /Opciones de la conversación "¿Qué tomo/ })
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Borrar" }));
    const confirmacion = screen.getByText("¿Borrar esta conversación?").closest(".confirm-modal");
    fireEvent.click(within(confirmacion).getByRole("button", { name: "Cancelar" }));

    expect(api.borrarConversacion).not.toHaveBeenCalled();
    expect(onBorrada).not.toHaveBeenCalled();
    expect(screen.getByText("¿Qué tomo con un asado?")).toBeInTheDocument();
  });

  it("si el borrado falla, avisa y vuelve a traer la lista real", async () => {
    api.borrarConversacion.mockRejectedValue(new Error("red"));
    const { onBorrada } = abrir();
    fireEvent.click(
      await screen.findByRole("button", { name: /Opciones de la conversación "¿Qué tomo/ })
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Borrar" }));
    const confirmacion = screen.getByText("¿Borrar esta conversación?").closest(".confirm-modal");
    fireEvent.click(within(confirmacion).getByRole("button", { name: "Borrar" }));

    await waitFor(() => expect(toast.showError).toHaveBeenCalled());
    expect(onBorrada).not.toHaveBeenCalled();
    // Se pidió de nuevo (carga inicial + recarga tras el fallo): la fila vuelve.
    await waitFor(() => expect(api.listarConversaciones).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("¿Qué tomo con un asado?")).toBeInTheDocument();
  });

  it("sin conversaciones muestra el estado vacío", async () => {
    api.listarConversaciones.mockResolvedValue([]);
    abrir();
    expect(await screen.findByText("Todavía no hay conversaciones")).toBeInTheDocument();
  });

  it("si la lista no carga, ofrece reintentar", async () => {
    api.listarConversaciones.mockRejectedValueOnce(new Error("red"));
    abrir();
    expect(await screen.findByText("No pudimos traer tus conversaciones")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(await screen.findByText("¿Qué tomo con un asado?")).toBeInTheDocument();
  });

  it("un refresco que falla no tira abajo la lista que ya se estaba viendo", async () => {
    const { rerender } = abrir();
    expect(await screen.findByText("¿Qué tomo con un asado?")).toBeInTheDocument();

    api.listarConversaciones.mockRejectedValue(new Error("red"));
    rerender(
      <SommelierChats
        abierto
        activoId={null}
        version="2"
        onClose={() => {}}
        onAbrir={() => {}}
        onNueva={() => {}}
        onBorrada={() => {}}
      />
    );
    await waitFor(() => expect(api.listarConversaciones).toHaveBeenCalledTimes(2));
    expect(screen.getByText("¿Qué tomo con un asado?")).toBeInTheDocument();
    expect(screen.queryByText("No pudimos traer tus conversaciones")).toBeNull();
  });

  describe("borrar todo el historial", () => {
    const abrirDialogo = async () => {
      fireEvent.click(await screen.findByRole("button", { name: /borrar todo el historial/i }));
      return screen.getByText("¿Borrar todo el historial?").closest(".confirm-modal");
    };

    it("el botón está, y pregunta cuántas se van antes de borrar nada", async () => {
      abrir();
      const dialogo = await abrirDialogo();
      expect(within(dialogo).getByText(/Se van 2 conversaciones/)).toBeInTheDocument();
      expect(api.borrarTodasLasConversaciones).not.toHaveBeenCalled();
    });

    it("al confirmar vacía la lista, llama a la API y avisa a la pantalla", async () => {
      const { onBorradasTodas } = abrir();
      const dialogo = await abrirDialogo();
      fireEvent.click(within(dialogo).getByRole("button", { name: "Borrar todo" }));

      await waitFor(() => expect(api.borrarTodasLasConversaciones).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(onBorradasTodas).toHaveBeenCalledTimes(1));
      expect(screen.queryByText("¿Qué tomo con un asado?")).toBeNull();
      expect(await screen.findByText("Todavía no hay conversaciones")).toBeInTheDocument();
    });

    it("cancelar no borra nada", async () => {
      const { onBorradasTodas } = abrir();
      const dialogo = await abrirDialogo();
      fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));

      expect(api.borrarTodasLasConversaciones).not.toHaveBeenCalled();
      expect(onBorradasTodas).not.toHaveBeenCalled();
      expect(screen.getByText("¿Qué tomo con un asado?")).toBeInTheDocument();
    });

    it("si falla, avisa, no le dice a la pantalla que reinicie y vuelve a traer la lista real", async () => {
      api.borrarTodasLasConversaciones.mockRejectedValue(new Error("red"));
      const { onBorradasTodas } = abrir();
      const dialogo = await abrirDialogo();
      fireEvent.click(within(dialogo).getByRole("button", { name: "Borrar todo" }));

      await waitFor(() => expect(toast.showError).toHaveBeenCalled());
      expect(onBorradasTodas).not.toHaveBeenCalled();
      await waitFor(() => expect(api.listarConversaciones).toHaveBeenCalledTimes(2));
      expect(await screen.findByText("¿Qué tomo con un asado?")).toBeInTheDocument();
    });

    it("sin conversaciones no hay nada que borrar: el botón no aparece", async () => {
      api.listarConversaciones.mockResolvedValue([]);
      abrir();
      await screen.findByText("Todavía no hay conversaciones");
      expect(screen.queryByRole("button", { name: /borrar todo el historial/i })).toBeNull();
    });
  });
});
