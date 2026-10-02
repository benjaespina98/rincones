import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const trackEvent = vi.fn();
vi.mock("../src/services/analyticsApi", () => ({ trackEvent: (...a) => trackEvent(...a) }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  trackEvent.mockClear();
});

const cargar = async () => (await import("../src/components/CafecitoLink")).default;

describe("enlace 'Invitame un café'", () => {
  it("apunta a Cafecito y abre en pestaña nueva sin filtrar opener ni referrer", async () => {
    const CafecitoLink = await cargar();
    render(<CafecitoLink />);
    const enlace = screen.getByRole("link", { name: /invitame un café/i });
    expect(enlace).toHaveAttribute("href", "https://cafecito.app/200okdev");
    expect(enlace).toHaveAttribute("target", "_blank");
    expect(enlace.getAttribute("rel")).toMatch(/noopener/);
    expect(enlace.getAttribute("rel")).toMatch(/noreferrer/);
  });

  it("el clic se registra como un evento, sin datos adicionales", async () => {
    const CafecitoLink = await cargar();
    render(<CafecitoLink />);
    fireEvent.click(screen.getByRole("link", { name: /invitame un café/i }));
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith("cafecito_click");
  });

  it("con la URL vacía no se muestra nada", async () => {
    vi.stubEnv("VITE_CAFECITO_URL", "");
    const CafecitoLink = await cargar();
    const { container } = render(<CafecitoLink />);
    expect(container).toBeEmptyDOMElement();
  });

  it("la URL se puede cambiar por variable de entorno", async () => {
    vi.stubEnv("VITE_CAFECITO_URL", "https://cafecito.app/otro");
    const CafecitoLink = await cargar();
    render(<CafecitoLink />);
    expect(screen.getByRole("link", { name: /invitame un café/i })).toHaveAttribute("href", "https://cafecito.app/otro");
  });
});
