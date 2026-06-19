import React from "react";
import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const loginSpy = vi.fn(() => Promise.resolve({ id: "u1", email: "test@example.com", role: "user" }));
const showErrorSpy = vi.fn();
const showSuccessSpy = vi.fn();

vi.mock("../src/hooks/useAuth", () => ({
  useAuth: () => ({ login: loginSpy }),
}));

vi.mock("../src/context/ToastContext", () => ({
  useToast: () => ({ showError: showErrorSpy, showSuccess: showSuccessSpy }),
}));

const { default: LoginPage } = await import("../src/pages/LoginPage.jsx");

describe("LoginPage", () => {
  test("submits credentials and navigates to home on success", async () => {
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/" element={<div>Home page</div>} />
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "Secret123" } });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    await waitFor(() => expect(screen.getByText("Home page")).toBeInTheDocument());
    expect(loginSpy).toHaveBeenCalledWith("test@example.com", "Secret123");
    expect(showSuccessSpy).toHaveBeenCalledWith("¡Bienvenido de vuelta!");
  });
});
