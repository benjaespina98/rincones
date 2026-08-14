import React from "react";
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("../src/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

const { useAuth } = await import("../src/hooks/useAuth.js");
const { default: AppGate } = await import("../src/components/AppGate.jsx");

const renderWithRoutes = (ui, initialPath) =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/verificar-email" element={<div>Verify page</div>} />
        <Route path="/fecha-nacimiento" element={<div>Birthdate page</div>} />
        <Route path="/onboarding" element={<div>Onboarding page</div>} />
        <Route path="/bodega" element={ui} />
      </Routes>
    </MemoryRouter>
  );

/**
 * `AppGate` va DENTRO de `PrivateRoute`: acá probamos sólo los pasos
 * verificación/fecha de nacimiento/onboarding, no el de sesión (eso ya lo
 * cubre route-guards.test.jsx).
 */
describe("AppGate", () => {
  test("cuenta sin verificar nunca ve el contenido: va a /verificar-email", () => {
    useAuth.mockReturnValue({ user: { emailVerified: false, hasBirthDate: true, onboarded: true } });

    renderWithRoutes(<AppGate><div>Bodega</div></AppGate>, "/bodega");

    expect(screen.getByText("Verify page")).toBeInTheDocument();
    expect(screen.queryByText("Bodega")).toBeNull();
  });

  test("verificada pero sin fecha de nacimiento (cuenta de Google) va a /fecha-nacimiento", () => {
    useAuth.mockReturnValue({ user: { emailVerified: true, hasBirthDate: false, onboarded: true } });

    renderWithRoutes(<AppGate><div>Bodega</div></AppGate>, "/bodega");

    expect(screen.getByText("Birthdate page")).toBeInTheDocument();
    expect(screen.queryByText("Bodega")).toBeNull();
  });

  test("con fecha de nacimiento pero sin onboarding va a /onboarding", () => {
    useAuth.mockReturnValue({ user: { emailVerified: true, hasBirthDate: true, onboarded: false } });

    renderWithRoutes(<AppGate><div>Bodega</div></AppGate>, "/bodega");

    expect(screen.getByText("Onboarding page")).toBeInTheDocument();
    expect(screen.queryByText("Bodega")).toBeNull();
  });

  test("verificada, con fecha de nacimiento y onboardeada: entra directo", () => {
    useAuth.mockReturnValue({ user: { emailVerified: true, hasBirthDate: true, onboarded: true } });

    renderWithRoutes(<AppGate><div>Bodega</div></AppGate>, "/bodega");

    expect(screen.getByText("Bodega")).toBeInTheDocument();
  });
});
