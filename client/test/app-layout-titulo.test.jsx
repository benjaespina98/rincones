import React from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../src/hooks/useAuth", () => ({
  useAuth: () => ({ user: { name: "QA", email: "qa@example.com", role: "user" } }),
}));

const { default: AppLayout } = await import("../src/components/AppLayout.jsx");

/**
 * El título grande sube a la fila del avatar sólo en las pestañas (ver AppLayout.css). La
 * decisión se toma en el JSX con una clase en el shell; la regla de CSS que la usa depende
 * de `:has()`, que jsdom no evalúa, así que eso se mide en la app corriendo. Acá se fija lo
 * que sí se puede: QUÉ pantallas llevan la clase.
 */
const renderEn = (ruta) =>
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <AppLayout pageTitle="Título">
        <p>contenido</p>
      </AppLayout>
    </MemoryRouter>
  );

describe("AppLayout: título en la fila del avatar", () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
  });

  test.each(["/bodega", "/sommelier", "/"])("la pestaña %s lleva la clase y no tiene botón de volver", (ruta) => {
    const { container } = renderEn(ruta);
    expect(container.querySelector(".app-layout")).toHaveClass("app-layout--titulo-en-barra");
    expect(screen.queryByRole("button", { name: "Volver" })).toBeNull();
  });

  test("una subpantalla (la ficha de un vino) NO lleva la clase y sí tiene botón de volver", () => {
    const { container } = renderEn("/vino/abc123");
    expect(container.querySelector(".app-layout")).not.toHaveClass("app-layout--titulo-en-barra");
    expect(screen.getByRole("button", { name: "Volver" })).toBeInTheDocument();
  });

  test("el título de la pantalla sigue siendo el h1 real, no un eco decorativo", () => {
    renderEn("/bodega");
    expect(screen.getByRole("heading", { level: 1, name: "Título" })).toBeInTheDocument();
  });
});
