import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PieDeLaApp from "../src/components/PieDeLaApp";

vi.mock("../src/services/analyticsApi", () => ({ trackEvent: vi.fn() }));

describe("pie de la app", () => {
  it("el crédito lleva a Instagram en pestaña nueva, sin opener", () => {
    render(<PieDeLaApp />);
    const credito = screen.getByRole("link", { name: "200ok.dev en Instagram" });
    expect(credito).toHaveAttribute("href", "https://www.instagram.com/200ok.dev/");
    expect(credito).toHaveAttribute("target", "_blank");
    expect(credito.getAttribute("rel")).toMatch(/noopener/);
  });

  it("dice 'made by' en inglés y muestra el logo con su alt, cargado perezoso", () => {
    render(<PieDeLaApp />);
    expect(screen.getByText("made by")).toBeInTheDocument();
    const logo = screen.getByAltText("200ok.dev");
    expect(logo).toHaveAttribute("src", "/200ok-logo.svg");
    expect(logo).toHaveAttribute("loading", "lazy");
  });

  it("incluye el enlace del café", () => {
    render(<PieDeLaApp />);
    expect(screen.getByRole("link", { name: /invitame un café/i })).toBeInTheDocument();
  });
});
