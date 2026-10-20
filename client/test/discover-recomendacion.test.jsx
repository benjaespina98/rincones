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

/* La precarga de la foto (Image aparte) no existe en jsdom: se simula. Por defecto "carga" al asignar
   el src; con `imagenes.modo = "nunca"` no responde, para ver el esqueleto. */
const imagenes = { modo: "carga" };
class ImagenFalsa {
  set src(valor) {
    this._src = valor;
    if (imagenes.modo === "carga") setTimeout(() => this.onload?.(), 0);
    else if (imagenes.modo === "error") setTimeout(() => this.onerror?.(), 0);
  }
  get src() {
    return this._src;
  }
}

beforeEach(() => {
  imagenes.modo = "carga";
  vi.stubGlobal("Image", ImagenFalsa);
  navigate.mockReset();
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const montar = async (lista) => {
  featured.lista = lista;
  render(
    <MemoryRouter>
      <DiscoverPage />
    </MemoryRouter>
  );
};

const nombreRecomendado = async () => (await screen.findByRole("heading", { level: 2, name: /^Vino [a-z]$/ }, { timeout: 4000 })).textContent;

describe("Descubrí: recomienda con foto primero", () => {
  it("entra por uno con foto aunque haya otros sin foto en el set (repetido: el sorteo es al azar)", async () => {
    for (let i = 0; i < 8; i += 1) {
      cleanup();
      await montar([vino("a"), vino("b", FOTO("b")), vino("c", FOTO("c")), vino("d", FOTO("d")), vino("e", "  ")]);
      const nombre = await nombreRecomendado();
      expect(["Vino b", "Vino c", "Vino d"]).toContain(nombre);
    }
  }, 20000);

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

describe("Descubrí: la tarjeta aparece entera", () => {
  it("mientras la foto no cargó se ve el esqueleto y no el texto del vino", async () => {
    imagenes.modo = "nunca";
    await montar([vino("b", FOTO("b")), vino("c", FOTO("c"))]);
    expect(await screen.findByRole("status", { name: /cargando la recomendación/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: /^Vino [a-z]$/ })).toBeNull();
  });

  it("cuando la foto carga aparece la tarjeta y el esqueleto se va", async () => {
    await montar([vino("b", FOTO("b")), vino("c", FOTO("c"))]);
    await nombreRecomendado();
    expect(screen.queryByRole("status", { name: /cargando la recomendación/i })).toBeNull();
  });

  it("si la foto falla la tarjeta aparece igual (con la botella genérica)", async () => {
    imagenes.modo = "error";
    await montar([vino("b", FOTO("b"))]);
    expect(await nombreRecomendado()).toBe("Vino b");
  });

  it("un vino sin foto no espera nada: aparece de una", async () => {
    imagenes.modo = "nunca";
    await montar([vino("a")]);
    expect(await nombreRecomendado()).toBe("Vino a");
  });

  it("sin ícono delante del motivo, con la frase de maridaje y el botón 'Quiero probarlo'", async () => {
    await montar([vino("b", FOTO("b"))]);
    await nombreRecomendado();
    expect(document.querySelector(".spotlight__eyebrow .icon")).toBeNull();
    expect(screen.getByText(/^Va con carnes rojas a la parrilla/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /quiero probarlo/i })).toBeInTheDocument();
  });
});
