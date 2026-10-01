import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RespuestaAcciones from "../src/components/RespuestaAcciones";

/**
 * Las acciones de una respuesta: el pulgar sólo existe si la respuesta quedó
 * guardada (se apunta al mensaje por su id) y "otra opción" sólo en la última.
 */
const MSG = { id: "m2", mensajeId: "abc123", feedback: null };

const montar = (props = {}) => {
  const manejadores = { onPulgar: vi.fn(), onOtra: vi.fn() };
  render(<RespuestaAcciones mensaje={MSG} esUltima ocupado={false} {...manejadores} {...props} />);
  return manejadores;
};

describe("RespuestaAcciones", () => {
  it("con la respuesta guardada muestra los dos pulgares y 'Otra opción'", () => {
    montar();
    expect(screen.getByRole("button", { name: "Me sirvió" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No me sirvió" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /otra opción/i })).toBeInTheDocument();
  });

  it("sin id de mensaje (no se guardó) no hay pulgar: no tiene a qué apuntar", () => {
    montar({ mensaje: { id: "m2", mensajeId: null } });
    expect(screen.queryByRole("button", { name: "Me sirvió" })).toBeNull();
    expect(screen.getByRole("button", { name: /otra opción/i })).toBeInTheDocument();
  });

  it("una respuesta vieja tiene pulgar pero no 'Otra opción': cambiaría el pasado de la charla", () => {
    montar({ esUltima: false });
    expect(screen.getByRole("button", { name: "Me sirvió" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /otra opción/i })).toBeNull();
  });

  it("vieja y sin guardar: no hay nada que mostrar", () => {
    const { container } = render(
      <RespuestaAcciones mensaje={{ id: "x", mensajeId: null }} esUltima={false} onPulgar={() => {}} onOtra={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("el pulgar avisa con el mensaje y el valor", () => {
    const { onPulgar } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Me sirvió" }));
    fireEvent.click(screen.getByRole("button", { name: "No me sirvió" }));
    expect(onPulgar).toHaveBeenNthCalledWith(1, MSG, "up");
    expect(onPulgar).toHaveBeenNthCalledWith(2, MSG, "down");
  });

  it("el pulgar elegido se anuncia como presionado", () => {
    montar({ mensaje: { ...MSG, feedback: "down" } });
    expect(screen.getByRole("button", { name: "No me sirvió" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Me sirvió" })).toHaveAttribute("aria-pressed", "false");
  });

  it("'Otra opción' se deshabilita mientras hay una respuesta en camino", () => {
    const { onOtra } = montar({ ocupado: true });
    const boton = screen.getByRole("button", { name: /otra opción/i });
    expect(boton).toBeDisabled();
    fireEvent.click(boton);
    expect(onOtra).not.toHaveBeenCalled();
  });

  it("'Otra opción' avisa al tocarla", () => {
    const { onOtra } = montar();
    fireEvent.click(screen.getByRole("button", { name: /otra opción/i }));
    expect(onOtra).toHaveBeenCalledTimes(1);
  });
});
