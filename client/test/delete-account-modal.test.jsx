import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DeleteAccountModal from "../src/components/DeleteAccountModal";

/**
 * La baja de cuenta es la única acción de la app que no se puede deshacer, así
 * que lo que se prueba acá es el candado, no el aspecto: que el botón no se
 * habilite sin el email, que un fallo del servidor se vea adentro del modal y
 * que no se pueda cancelar a mitad de un borrado.
 */

const EMAIL = "persona@ejemplo.com";

const abrir = (props = {}) =>
  render(
    <DeleteAccountModal
      isOpen
      email={EMAIL}
      onConfirm={() => Promise.resolve()}
      onCancel={() => {}}
      {...props}
    />
  );

const campoEmail = () => screen.getByLabelText("Para confirmar, escribí tu email");
const botonEliminar = () => screen.getByRole("button", { name: /eliminar cuenta|eliminando/i });

describe("DeleteAccountModal", () => {
  it("no renderiza nada cerrado", () => {
    abrir({ isOpen: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("se anuncia como diálogo modal, con título y con el aviso asociado", () => {
    abrir();
    const dialogo = screen.getByRole("dialog");
    expect(dialogo).toHaveAttribute("aria-modal", "true");
    expect(dialogo).toHaveAccessibleName("¿Eliminar tu cuenta?");
    expect(dialogo).toHaveAccessibleDescription(/no se puede deshacer/i);
  });

  it("lista cada cosa que se borra y muestra el email entero para copiarlo", () => {
    abrir();
    for (const item of ["Tu bodega y tus guardados", "Tus momentos", "Tus reseñas", "Tus consultas al Sommelier"]) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }
    // Entero y como texto: no como placeholder, que se corta y desaparece.
    expect(screen.getByText(EMAIL)).toBeInTheDocument();
  });

  it("el botón está deshabilitado hasta que el email coincide, sin importar mayúsculas ni espacios", () => {
    abrir();
    expect(botonEliminar()).toBeDisabled();

    fireEvent.change(campoEmail(), { target: { value: "otra@ejemplo.com" } });
    expect(botonEliminar()).toBeDisabled();

    fireEvent.change(campoEmail(), { target: { value: `  ${EMAIL.toUpperCase()} ` } });
    expect(botonEliminar()).toBeEnabled();
  });

  it("confirma con el email escrito y la contraseña, sin tocar el original", async () => {
    const onConfirm = vi.fn(() => Promise.resolve());
    abrir({ onConfirm });
    fireEvent.change(campoEmail(), { target: { value: ` ${EMAIL} ` } });
    fireEvent.change(screen.getByLabelText("Tu contraseña"), { target: { value: "secreta" } });
    fireEvent.click(botonEliminar());

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith({ confirmEmail: EMAIL, password: "secreta" });
  });

  it("si el servidor rechaza, el error se ve adentro y el modal se puede volver a usar", async () => {
    const onConfirm = vi.fn(() =>
      Promise.reject({ response: { data: { message: "Contraseña incorrecta" } } })
    );
    abrir({ onConfirm });
    fireEvent.change(campoEmail(), { target: { value: EMAIL } });
    fireEvent.click(botonEliminar());

    expect(await screen.findByRole("alert")).toHaveTextContent("Contraseña incorrecta");
    expect(botonEliminar()).toBeEnabled();
  });

  it("mientras borra no se puede cancelar: ni con el botón ni con Escape", async () => {
    const onCancel = vi.fn();
    let terminar;
    const onConfirm = vi.fn(() => new Promise((resolve) => (terminar = resolve)));
    abrir({ onConfirm, onCancel });
    fireEvent.change(campoEmail(), { target: { value: EMAIL } });
    fireEvent.click(botonEliminar());

    await waitFor(() => expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
    terminar();
  });

  it("Escape cancela cuando no se está borrando", () => {
    const onCancel = vi.fn();
    abrir({ onCancel });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("ofrece llevarse los datos antes y avisa mientras prepara el archivo", () => {
    const onExport = vi.fn();
    const { rerender } = abrir({ onExport });
    fireEvent.click(screen.getByRole("button", { name: "Descargar mis datos antes" }));
    expect(onExport).toHaveBeenCalledTimes(1);

    rerender(
      <DeleteAccountModal
        isOpen
        email={EMAIL}
        onConfirm={() => {}}
        onCancel={() => {}}
        onExport={onExport}
        exporting
      />
    );
    expect(screen.getByRole("button", { name: "Preparando el archivo…" })).toBeDisabled();
  });

  it("sin onExport no muestra el botón de descarga", () => {
    abrir();
    expect(screen.queryByRole("button", { name: /descargar/i })).toBeNull();
  });
});
