import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * La recomendación de Descubrí sólo usa vinos con foto. Sin foto no hay recomendación: se dice, y
 * se ofrece sumar una. Si la foto de la que se está mostrando no carga, se descarta (nunca queda
 * la botella genérica como si fuera una sugerencia). Y con un solo vino con foto no se ofrece
 * "Ver otro".
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

describe("Descubrí: recomendación sólo con foto", () => {
  it("nunca muestra un vino sin foto, aunque venga en el set", async () => {
    await montar([vino("a"), vino("b", FOTO("b")), vino("c", FOTO("c")), vino("d", FOTO("d")), vino("e", "  ")]);
    const nombre = await nombreRecomendado();
    expect(["Vino b", "Vino c", "Vino d"]).toContain(nombre);
  });

  it("'Ver otro' recorre sólo los que tienen foto y nunca repite el mismo", async () => {
    await montar([vino("a"), vino("b", FOTO("b")), vino("c", FOTO("c")), vino("d", FOTO("d"))]);
    let actual = await nombreRecomendado();
    const vistos = new Set([actual]);
    for (let i = 0; i < 6; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: /ver otro/i }));
      const siguiente = await waitFor(() => {
        const n = screen.getByRole("heading", { level: 2, name: /^Vino [a-z]$/ }).textContent;
        expect(n).not.toBe(actual);
        return n;
      });
      expect(["Vino b", "Vino c", "Vino d"]).toContain(siguiente);
      vistos.add(siguiente);
      actual = siguiente;
    }
    expect(vistos.has("Vino a")).toBe(false);
  });

  it("con un solo vino con foto no hay 'Ver otro'", async () => {
    await montar([vino("a"), vino("b", FOTO("b"))]);
    expect(await nombreRecomendado()).toBe("Vino b");
    expect(screen.queryByRole("button", { name: /ver otro/i })).toBeNull();
  });

  it("sin ningún vino con foto no recomienda y ofrece sumar una", async () => {
    await montar([vino("a"), vino("b", "")]);
    const accion = await screen.findByRole("button", { name: "Sumá una foto" });
    expect(screen.queryByRole("heading", { level: 2, name: /^Vino [a-z]$/ })).toBeNull();
    fireEvent.click(accion);
    expect(navigate).toHaveBeenCalledWith("/agregar", expect.objectContaining({ state: expect.objectContaining({ modo: "camara" }) }));
  });

  it("si la foto del recomendado no carga, se descarta y no queda la botella genérica", async () => {
    await montar([vino("b", FOTO("b")), vino("c", FOTO("c"))]);
    const primero = await nombreRecomendado();
    fireEvent.error(document.querySelector(".spotlight__art img"));
    const otro = await waitFor(() => {
      const n = screen.getByRole("heading", { level: 2, name: /^Vino [a-z]$/ }).textContent;
      expect(n).not.toBe(primero);
      return n;
    });
    expect(["Vino b", "Vino c"]).toContain(otro);
    // Ya queda uno solo: no se ofrece "Ver otro".
    expect(screen.queryByRole("button", { name: /ver otro/i })).toBeNull();
  });

  it("si la foto del único recomendado no carga, no queda ninguna recomendación", async () => {
    await montar([vino("b", FOTO("b"))]);
    await nombreRecomendado();
    fireEvent.error(document.querySelector(".spotlight__art img"));
    expect(await screen.findByRole("button", { name: "Sumá una foto" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: /^Vino [a-z]$/ })).toBeNull();
  });
});
