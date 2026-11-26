import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const auth = vi.hoisted(() => ({ user: null }));
vi.mock("../src/hooks/useAuth", () => ({ useAuth: () => ({ user: auth.user, logout: vi.fn(), refreshUser: vi.fn() }) }));
vi.mock("../src/context/ToastContext", () => ({ useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }) }));

import VerifyRequiredPage from "../src/pages/VerifyRequiredPage";

const montar = () =>
  render(
    <MemoryRouter initialEntries={["/verificar-email"]}>
      <Routes>
        <Route path="/verificar-email" element={<VerifyRequiredPage />} />
        <Route path="/" element={<p>adentro</p>} />
      </Routes>
    </MemoryRouter>
  );

describe("pantalla de verificación", () => {
  it("con el email ya confirmado sale sola", () => {
    auth.user = { email: "a@example.test", emailVerified: true };
    montar();
    expect(screen.getByText("adentro")).toBeInTheDocument();
  });

  it("sin confirmar se queda", () => {
    auth.user = { email: "a@example.test", emailVerified: false };
    montar();
    expect(screen.getByText("Confirmá tu email")).toBeInTheDocument();
  });
});
