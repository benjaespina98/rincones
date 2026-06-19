import React from "react";
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("../src/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

const { useAuth } = await import("../src/hooks/useAuth.js");
const { default: PrivateRoute } = await import("../src/components/PrivateRoute.jsx");

const renderWithRoutes = (ui, initialPath) =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route path="/profile" element={ui} />
      </Routes>
    </MemoryRouter>
  );

describe("route guards", () => {
  test("PrivateRoute redirects anonymous users to login", () => {
    useAuth.mockReturnValue({ loading: false, user: null });

    renderWithRoutes(<PrivateRoute><div>Secret content</div></PrivateRoute>, "/profile");

    expect(screen.getByText("Login page")).toBeInTheDocument();
  });

  test("PrivateRoute renders children when authorized", () => {
    useAuth.mockReturnValue({ loading: false, user: { id: "1" } });

    renderWithRoutes(<PrivateRoute><div>Secret content</div></PrivateRoute>, "/profile");

    expect(screen.getByText("Secret content")).toBeInTheDocument();
  });
});
