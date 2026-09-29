import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BottomSheet from "../src/components/BottomSheet";

/**
 * Lo que tiene que hacer un diálogo para ser un diálogo.
 *
 * ── POR QUÉ ESTO SE TESTEA Y LOS ESTILOS NO ─────────────────────────────────
 * Que la hoja se vea bien se mira; que el Tab no se escape del panel NO se
 * mira: hay que tabular hasta el final con el teclado y darse cuenta de que el
 * foco se fue a un botón que está debajo del velo. Es el tipo de cosa que se
 * rompe en una refactorización y que nadie nota hasta que alguien que navega
 * con teclado queda encerrado afuera de su propio diálogo.
 *
 * La versión anterior de `useSheet` declaraba en un comentario que NO atrapaba
 * el foco, justificándolo en que estas hojas son cortas. Estos tests existen
 * para que esa regresión no pueda volver en silencio.
 */

const abrir = (props = {}) =>
  render(
    <BottomSheet isOpen onClose={() => {}} title="Filtros" {...props}>
      <button type="button">Primero</button>
      <button type="button">Segundo</button>
    </BottomSheet>
  );

const enfocables = (panel) =>
  [...panel.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')]
    .filter((el) => !el.disabled);

const tab = ({ shift = false } = {}) =>
  fireEvent.keyDown(document, { key: "Tab", shiftKey: shift });

describe("BottomSheet", () => {
  it("se anuncia como diálogo modal y con su título", () => {
    abrir();
    const panel = screen.getByRole("dialog");
    expect(panel).toHaveAttribute("aria-modal", "true");
    // El título tiene que estar ATADO al panel, no sólo presente: sin
    // aria-labelledby el lector anuncia "diálogo" y nada más.
    const id = panel.getAttribute("aria-labelledby");
    expect(document.getElementById(id)).toHaveTextContent("Filtros");
  });

  it("el foco arranca adentro del panel", () => {
    abrir();
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  });

  it("desde el último control, Tab vuelve al primero", () => {
    abrir();
    const panel = screen.getByRole("dialog");
    const items = enfocables(panel);
    items[items.length - 1].focus();
    tab();
    expect(document.activeElement).toBe(items[0]);
  });

  it("desde el primero, Shift+Tab va al último", () => {
    abrir();
    const panel = screen.getByRole("dialog");
    const items = enfocables(panel);
    items[0].focus();
    tab({ shift: true });
    expect(document.activeElement).toBe(items[items.length - 1]);
  });

  it("si el foco se escapó del panel, la próxima tabulación lo trae de vuelta", () => {
    abrir();
    const panel = screen.getByRole("dialog");
    document.body.focus();
    tab();
    expect(panel.contains(document.activeElement)).toBe(true);
  });

  it("Escape cierra", () => {
    const onClose = vi.fn();
    abrir({ onClose });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("cerrada no renderiza nada", () => {
    render(
      <BottomSheet isOpen={false} onClose={() => {}} title="Filtros">
        <button type="button">Primero</button>
      </BottomSheet>
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
