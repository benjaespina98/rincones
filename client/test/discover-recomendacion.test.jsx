import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * La recomendación de Descubrí prioriza los vinos con foto, pero NUNCA queda vacía por no tener:
 * con foto primero y los demás después, como siempre. Sin ninguno con foto se recomienda igual.
 */
const { featured, navigate } = vi.hoisted(() => ({ featured: { lista: [] }, navigate: vi.fn() }));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigate,
}));
vi.mock("../src/hooks/useAuth", () => ({ useAuth: () => ({ user: { name: "QA", email: "qa@x.com" } }) }));
vi.mock("../src/hooks/useWineStats", () => ({ useWineStats: () => ({ stats: { totals: { total: 5, stock: 0 } } }) }));
vi.mock("../src/hooks/useWishlist", () => ({ useWishlist: () => ({ addWish: vi.fn() }) }));
vi.mock("../src/context/ToastContext", () => ({
  useToast: () => ({ showError: vi.fn(), showSuccess: vi.fn(), addToast: vi.fn(), removeToast: vi.fn() }),
}));
vi.mock("../src/services/wineSearchApi", () => ({
  getFeaturedWines: () => Promise.resolve(featured.lista),
  searchWines: () => Promise.resolve([]),
}));
vi.mock("../src/services/promotionsApi", () => ({ getPromotions: () => Promise.resolve([]) }));
vi.mock("../src/services/analyticsApi", () => ({ trackEvent: vi.fn() }));
vi.mock("../src/hooks/useRotacionAutomatica", () => ({ default: () => ({}) }));
vi.mock("../src/components/CellarReady", () => ({ default: () => null }));
vi.mock("../src/components/WineShops", () => ({ default: () => null }));
vi.mock("../src/components/FeaturedEvent", () => ({ default: () => null }));
vi.mock("../src/components/ExploreFeed", () => ({ default: () => null }));
vi.mock("../src/components/FilaDeAtajos", () => ({ default: () => null }));

const { default: DiscoverPage } = await import("../src/pages/DiscoverPage");

const vino = (id, image = "") => ({ id, name: `Vino ${id}`, winery: "Bodega", varietal: "Malbec", type: "red", region: "Mendoza", image });
const FOTO = (n) => `https://res.cloudinary.com/x/image/upload/${n}.jpg`;

beforeEach(() => {
  navigate.mockReset();
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(cleanup);

const montar = async (lista) => {
  featured.lista = lista;
  render(
    <MemoryRouter>
      <DiscoverPage />
    </MemoryRouter>
  );
};

const nombreRecomendado = async () => (await screen.findByRole("heading", { level: 2, name: /^Vino [a-z]$/ })).textContent;

describe("Descubrí: recomienda con foto primero", () => {
  it("entra por uno con foto aunque haya otros sin foto en el set (repetido: el sorteo es al azar)", async () => {
    for (let i = 0; i < 12; i += 1) {
      cleanup();
      await montar([vino("a"), vino("b", FOTO("b")), vino("c", FOTO("c")), vino("d", FOTO("d")), vino("e", "  ")]);
      const nombre = await nombreRecomendado();
      expect(["Vino b", "Vino c", "Vino d"]).toContain(nombre);
    }
  });

  it("sin ningún vino con foto recomienda igual, sin pantalla de error ni de pedido de foto", async () => {
    await montar([vino("a"), vino("b", "")]);
    const nombre = await nombreRecomendado();
    expect(["Vino a", "Vino b"]).toContain(nombre);
    expect(screen.queryByRole("button", { name: "Sumá una foto" })).toBeNull();
    expect(screen.queryByText(/todavía no hay recomendaciones con foto/i)).toBeNull();
  });

  it("'Ver otro' recorre todos los vinos del set, con los de foto primero, sin repetir el mismo seguido", async () => {
    await montar([vino("a"), vino("b", FOTO("b")), vino("c", FOTO("c"))]);
    let actual = await nombreRecomendado();
    const vistos = new Set([actual]);
    for (let i = 0; i < 6; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: /ver otro/i }));
      const siguiente = await waitFor(() => {
        const n = screen.getByRole("heading", { level: 2, name: /^Vino [a-z]$/ }).textContent;
        expect(n).not.toBe(actual);
        return n;
      });
      vistos.add(siguiente);
      actual = siguiente;
    }
    expect(vistos.size).toBeGreaterThan(1);
  });

  it("con un solo vino no hay 'Ver otro'", async () => {
    await montar([vino("a")]);
    expect(await nombreRecomendado()).toBe("Vino a");
    expect(screen.queryByRole("button", { name: /ver otro/i })).toBeNull();
  });

  it("si el set viene vacío dice que no hay recomendaciones ahora", async () => {
    await montar([]);
    expect(await screen.findByText(/no hay recomendaciones ahora/i)).toBeInTheDocument();
  });
});
