import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useState } from "react";
import OpenBottleSheet from "../src/components/OpenBottleSheet";
import ConfirmModal from "../src/components/ConfirmModal";

/**
 * Los diálogos atrapan el foco: Tab no se escapa a la pantalla de atrás, Escape cierra y el foco
 * vuelve a quien abrió el diálogo. Antes OpenBottleSheet y ConfirmModal sólo tenían Escape.
 */
afterEach(cleanup);

const tab = (el, shiftKey = false) => fireEvent.keyDown(el, { key: "Tab", shiftKey });

describe("OpenBottleSheet", () => {
  const wine = { _id: "1", name: "Malbec Reserva", quantity: 3 };

  it("Tab desde el último control vuelve al primero y Shift+Tab desde el primero va al último", () => {
    render(
      <div>
        <button>Fondo</button>
        <OpenBottleSheet wine={wine} onConfirm={vi.fn()} onCancel={vi.fn()} />
      </div>
    );
    const dialogo = screen.getByRole("dialog");
    const controles = [...dialogo.querySelectorAll("button:not([disabled])")];
    const primero = controles[0];
    const ultimo = controles[controles.length - 1];
    ultimo.focus();
    tab(ultimo);
    expect(document.activeElement).toBe(primero);
    primero.focus();
    tab(primero, true);
    expect(document.activeElement).toBe(ultimo);
  });

  it("Escape cancela", () => {
    const onCancel = vi.fn();
    render(<OpenBottleSheet wine={wine} onConfirm={vi.fn()} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });

  it("al cerrar, el foco vuelve al botón que lo abrió", () => {
    function Caso() {
      const [abierto, setAbierto] = useState(false);
      return (
        <div>
          <button onClick={() => setAbierto(true)}>Abrir</button>
          {abierto && <OpenBottleSheet wine={wine} onConfirm={vi.fn()} onCancel={() => setAbierto(false)} />}
        </div>
      );
    }
    render(<Caso />);
    const abrir = screen.getByRole("button", { name: "Abrir" });
    abrir.focus();
    fireEvent.click(abrir);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(abrir);
  });
});

describe("ConfirmModal", () => {
  it("atrapa el foco y, siendo destructivo, arranca en Cancelar", () => {
    render(
      <ConfirmModal isOpen title="Eliminar" message="¿Seguro?" confirmText="Eliminar" cancelText="Cancelar" isDangerous onConfirm={vi.fn()} onCancel={vi.fn()} />
    );
    const cancelar = screen.getByRole("button", { name: "Cancelar" });
    const confirmar = screen.getByRole("button", { name: "Eliminar" });
    expect(document.activeElement).toBe(cancelar);
    confirmar.focus();
    tab(confirmar);
    expect(document.activeElement).toBe(cancelar);
  });
});
