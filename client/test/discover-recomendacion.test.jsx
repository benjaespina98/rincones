import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * La recomendación de Descubrí prioriza los vinos con foto, pero NUNCA queda vacía por no tener:
 * con foto primero y los demás después, como siempre. Sin ninguno con foto se recomienda igual.
 */
const { featured, navigate } = vi.hoisted(() => ({ featured: { lista: [], llamadas: [] }, navigate: vi.fn() }));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigate,
}));
vi.mock("../src/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u-qa", name: "QA", email: "qa@x.com" } }) }));
vi.mock("../src/hooks/useWineStats", () => ({ useWineStats: () => ({ stats: { totals: { total: 5, stock: 0 } } }) }));
vi.mock("../src/hooks/useWishlist", () => ({ useWishlist: () => ({ addWish: vi.fn() }) }));
vi.mock("../src/context/ToastContext", () => ({
  useToast: () => ({ showError: vi.fn(), showSuccess: vi.fn(), addToast: vi.fn(), removeToast: vi.fn() }),
}));
vi.mock("../src/services/wineSearchApi", () => ({
  getFeaturedWines: (...args) => {
    featured.llamadas.push(args);
    return Promise.resolve(featured.lista);
  },
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
  featured.llamadas = [];
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

describe("Descubrí: la tarjeta no espera ninguna foto", () => {
  it("aparece apenas llegan los datos aunque la foto del vino nunca cargue", async () => {
    imagenes.modo = "nunca";
    await montar([vino("b", FOTO("b")), vino("c", FOTO("c"))]);
    const nombre = await nombreRecomendado();
    expect(["Vino b", "Vino c"]).toContain(nombre);
    expect(screen.queryByRole("status", { name: /cargando la recomendación/i })).toBeNull();
  });

  it("dibuja la botella del vino y no usa la foto de otra persona", async () => {
    await montar([vino("b", FOTO("b"))]);
    await nombreRecomendado();
    const arte = document.querySelector(".spotlight__art");
    expect(arte.querySelector("img")).toBeNull();
    expect(arte.querySelector("svg")).not.toBeNull();
  });

  it("el esqueleto sólo está mientras llegan los datos", async () => {
    await montar([vino("a")]);
    expect(screen.getByRole("status", { name: /cargando la recomendación/i })).toBeInTheDocument();
    await nombreRecomendado();
    expect(screen.queryByRole("status", { name: /cargando la recomendación/i })).toBeNull();
  });

  it("sin ícono delante del rótulo, sin maridaje y con el botón 'Quiero probarlo'", async () => {
    await montar([vino("b", FOTO("b"))]);
    await nombreRecomendado();
    expect(document.querySelector(".spotlight__eyebrow .icon")).toBeNull();
    expect(document.querySelector(".spotlight__pairing")).toBeNull();
    expect(screen.getByRole("button", { name: /quiero probarlo/i })).toBeInTheDocument();
  });
});

describe("Descubrí: el set de la tarjeta es de una persona", () => {
  it("lo pide con el id de quien está usando la app, para que el caché no se mezcle entre personas", async () => {
    await montar([vino("a")]);
    await nombreRecomendado();
    expect(featured.llamadas.length).toBeGreaterThanOrEqual(1);
    expect(featured.llamadas.every((args) => args[0] === "u-qa")).toBe(true);
  });
});

describe("Descubrí: el porqué de la recomendación", () => {
  const conMotivo = (motivo) => ({ ...vino("a"), motivo });

  it("el rótulo dice para quién es y los motivos salen como chips, sin porcentaje", async () => {
    await montar([
      conMotivo({ modo: "afinidad", coincidencia: 92, razones: ["Como tomás Malbec, te recomiendo este vino"], motivos: ["Tomaste Malbec", "Mendoza aparece seguido en lo que tomás"] }),
    ]);
    await nombreRecomendado();
    expect(document.querySelector(".spotlight__eyebrow").textContent).toBe("Para vos");
    const chips = [...document.querySelectorAll(".spotlight__motivo")].map((c) => c.textContent);
    expect(chips).toEqual(["Tomaste Malbec", "Mendoza aparece seguido en lo que tomás"]);
    expect(screen.getByRole("list", { name: /por qué te lo sugerimos/i })).toBeInTheDocument();
    // El porcentaje no era una probabilidad: no se muestra aunque el server lo mande.
    expect(document.querySelector(".spotlight__match")).toBeNull();
    expect(screen.queryByText(/92/)).toBeNull();
    expect(screen.queryByRole("img", { name: /coincide/i })).toBeNull();
  });

  it("un descubrimiento se rotula como tal", async () => {
    await montar([conMotivo({ modo: "descubrimiento", coincidencia: null, razones: [], motivos: ["Una uva nueva para vos: Tannat"] })]);
    await nombreRecomendado();
    expect(document.querySelector(".spotlight__eyebrow").textContent).toBe("Para descubrir");
    expect([...document.querySelectorAll(".spotlight__motivo")].map((c) => c.textContent)).toEqual(["Una uva nueva para vos: Tannat"]);
  });

  it("un set viejo en caché (de antes de los motivos) no rompe y tampoco muestra el porcentaje", async () => {
    await montar([conMotivo({ modo: "afinidad", coincidencia: 92, razones: ["Tomás Malbec (3 en tu bodega)"] })]);
    await nombreRecomendado();
    expect(document.querySelector(".spotlight__eyebrow").textContent).toBe("Para vos");
    expect(document.querySelector(".spotlight__match")).toBeNull();
    expect(screen.queryByText(/92/)).toBeNull();
  });
});
