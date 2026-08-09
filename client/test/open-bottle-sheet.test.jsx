import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import OpenBottleSheet from "../src/components/OpenBottleSheet";

/**
 * "Abrí una botella": cuántas, y qué implica.
 *
 * Las dos cosas que se prueban acá son las dos que faltaban. Que se pueda elegir
 * la cantidad —abrir tres en un asado eran tres toques con tres avisos, y sólo
 * el último "Deshacer" servía— y que las tres consecuencias estén dichas ANTES
 * de confirmar, porque estaban escritas en un comentario del código y en un
 * `title=` que en un teléfono no existe.
 */

afterEach(cleanup);

const vino = { _id: "w1", name: "Perro Callejero", varietal: "Malbec", quantity: 5, tasted: false };

describe("OpenBottleSheet", () => {
  it("dice las tres cosas que van a pasar", () => {
    render(<OpenBottleSheet wine={vino} onConfirm={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText(/se descuenta de tu stock/i)).toBeInTheDocument();
    expect(screen.getByText(/queda marcado como probado/i)).toBeInTheDocument();
    expect(screen.getByText(/se registra el consumo/i)).toBeInTheDocument();
  });

  it("arranca en una botella y confirma esa cantidad", () => {
    const onConfirm = vi.fn();
    render(<OpenBottleSheet wine={vino} onConfirm={onConfirm} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Abrí una botella" }));
    expect(onConfirm).toHaveBeenCalledWith(1);
  });

  it("permite abrir varias y lo dice en el botón", () => {
    const onConfirm = vi.fn();
    render(<OpenBottleSheet wine={vino} onConfirm={onConfirm} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Una botella más" }));
    fireEvent.click(screen.getByRole("button", { name: "Una botella más" }));

    const confirmar = screen.getByRole("button", { name: "Abrí 3 botellas" });
    fireEvent.click(confirmar);
    expect(onConfirm).toHaveBeenCalledWith(3);
  });

  it("cuenta cuántas quedan, para no tener que ir a contarlas", () => {
    render(<OpenBottleSheet wine={vino} onConfirm={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText(/te quedan 4/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Una botella más" }));
    expect(screen.getByText(/te quedan 3/i)).toBeInTheDocument();
  });

  it("no deja abrir más botellas de las que tenés", () => {
    render(
      <OpenBottleSheet
        wine={{ ...vino, quantity: 2 }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const mas = screen.getByRole("button", { name: "Una botella más" });
    fireEvent.click(mas);
    expect(mas).toBeDisabled();
    expect(screen.getByText(/no te queda ninguna/i)).toBeInTheDocument();
  });

  it("con el vino ya probado no promete marcarlo de nuevo", () => {
    render(
      <OpenBottleSheet
        wine={{ ...vino, tasted: true }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText(/ya figura como probado/i)).toBeInTheDocument();
    expect(screen.queryByText(/queda marcado como probado/i)).toBeNull();
  });

  it("se puede salir con Escape", () => {
    const onCancel = vi.fn();
    render(<OpenBottleSheet wine={vino} onConfirm={vi.fn()} onCancel={onCancel} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });
});
