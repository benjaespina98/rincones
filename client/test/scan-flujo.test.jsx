import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ScanReview from "../src/components/ScanReview";
import LabelScanner from "../src/components/LabelScanner";

/**
 * El flujo de escaneo:
 *  · Escanear va directo a la captura, sin una pantalla informativa antes;
 *  · sin permiso de cámara, un estado corto con "Elegir de la galería";
 *  · la confirmación es una lista con un único botón primario ("Guardar") y marca con un punto de
 *    acento lo que el modelo no pudo leer o leyó con poca seguridad.
 */
const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigate,
}));
vi.mock("../src/context/ToastContext", () => ({
  useToast: () => ({ addToast: vi.fn(), removeToast: vi.fn(), showSuccess: vi.fn(), showError: vi.fn() }),
}));
vi.mock("../src/services/wineApi", () => ({ createWine: vi.fn(), deleteWine: vi.fn() }));
vi.mock("../src/services/wishApi", () => ({ createWish: vi.fn(), deleteWish: vi.fn() }));
vi.mock("../src/services/analyticsApi", () => ({ trackEvent: vi.fn() }));
vi.mock("../src/components/LabelScanner", async (importOriginal) => {
  const real = await importOriginal();
  return { default: real.default };
});

afterEach(() => {
  cleanup();
  navigate.mockReset();
});

const css = (f) => readFileSync(resolve(process.cwd(), f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const LECTURA = (extra = {}) => ({
  source: "gemini",
  values: { winery: "Catena Zapata", line: "Saint Felicien", properName: "", varietal: "Malbec", vintage: "2019", region: "Mendoza", type: "red" },
  confidence: { line: 95, winery: 93, varietal: 92, vintage: 90, region: 88, type: 85 },
  serverIssues: [],
  ...extra,
});

describe("ir directo a la captura", () => {
  it("la pantalla del escáner no tiene el texto informativo de antes", async () => {
    const { default: ScanWinePage } = await import("../src/pages/ScanWinePage");
    render(
      <MemoryRouter initialEntries={["/agregar"]}>
        <ScanWinePage />
      </MemoryRouter>
    );
    expect(screen.queryByText(/sumá un vino a tu bodega/i)).toBeNull();
    expect(screen.queryByText(/sacá una foto y lo agregamos solo/i)).toBeNull();
    // Está el escáner: sin cámara en jsdom, su estado corto con la salida de la galería.
    expect(screen.getByRole("button", { name: /elegir de la galería/i })).toBeInTheDocument();
  });
});

describe("sin permiso de cámara", () => {
  it("dice qué pasó en una línea y ofrece Elegir de la galería, sin consejos", () => {
    render(<LabelScanner onCapture={vi.fn()} onCancel={vi.fn()} onManual={vi.fn()} />);
    expect(screen.getByText(/no pudimos abrir la cámara/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /elegir de la galería/i })).toBeInTheDocument();
    expect(screen.queryByText(/acercate hasta que se lea/i)).toBeNull();
    expect(screen.queryByText(/evitá el reflejo/i)).toBeNull();
  });

  it("Cargar a mano sigue a un toque", () => {
    const onManual = vi.fn();
    render(<LabelScanner onCapture={vi.fn()} onManual={onManual} />);
    fireEvent.click(screen.getByRole("button", { name: /cargar a mano/i }));
    expect(onManual).toHaveBeenCalledTimes(1);
  });
});

describe("la confirmación", () => {
  it("lista los datos en orden: nombre, bodega, uva, cosecha, región, tipo y botellas", () => {
    render(<ScanReview reading={LECTURA()} photo="data:image/jpeg;base64,AAAA" onConfirm={vi.fn()} onRescan={vi.fn()} onCancel={vi.fn()} />);
    const rotulos = [...document.querySelectorAll(".scan-review__list .scan-review__rowlabel")].map((e) =>
      e.textContent.replace(/(Revisá|No se leyó)$/, "").replace(/i$/, "").trim()
    );
    expect(rotulos.slice(0, 7).map((t) => t.replace(/\s+/g, " "))).toEqual([
      "Nombre del vino",
      "Bodega",
      "Uva",
      "Cosecha",
      "Región",
      "Tipo",
      "Botellas",
    ]);
  });

  it("tiene un único botón primario, Guardar, y 'Escanear otra' como secundario", () => {
    const onRescan = vi.fn();
    render(<ScanReview reading={LECTURA()} onConfirm={vi.fn()} onRescan={onRescan} onCancel={vi.fn()} />);
    expect(document.querySelectorAll(".scan-review__save")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /^guardar$/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /escanear otra/i }));
    expect(onRescan).toHaveBeenCalledTimes(1);
  });

  it("en la carga a mano el secundario es Cancelar", () => {
    const onCancel = vi.fn();
    render(<ScanReview reading={{ ...LECTURA(), source: "manual" }} onConfirm={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /^cancelar$/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /escanear otra/i })).toBeNull();
  });

  it("marca con un punto de acento lo que no se leyó o se leyó con poca seguridad", () => {
    const lectura = LECTURA({
      values: { winery: "Catena Zapata", line: "Saint Felicien", properName: "", varietal: "", vintage: "2019", region: "Mendoza", type: "red" },
      confidence: { line: 95, winery: 93, varietal: 0, vintage: 40, region: 88, type: 85 },
    });
    render(<ScanReview reading={lectura} onConfirm={vi.fn()} onRescan={vi.fn()} />);
    const marcas = (placeholder) => screen.getByPlaceholderText(placeholder).closest("label").querySelector(".scan-review__marca")?.textContent;
    expect(marcas("Uva")).toBe("No se leyó");
    expect(marcas("Cosecha")).toBe("Revisá");
    expect(marcas("Bodega")).toBeUndefined();
  });

  it("la marca se va cuando la persona toca el campo", () => {
    const lectura = LECTURA({ confidence: { line: 95, winery: 93, varietal: 40, vintage: 90, region: 88, type: 85 } });
    render(<ScanReview reading={lectura} onConfirm={vi.fn()} onRescan={vi.fn()} />);
    const input = screen.getByPlaceholderText("Uva");
    expect(input.closest("label").querySelector(".scan-review__marca")).not.toBeNull();
    fireEvent.change(input, { target: { value: "Cabernet Sauvignon" } });
    expect(input.closest("label").querySelector(".scan-review__marca")).toBeNull();
  });

  it("el tipo se puede cambiar y viaja al guardar", () => {
    const onConfirm = vi.fn();
    render(<ScanReview reading={LECTURA()} onConfirm={onConfirm} onRescan={vi.fn()} />);
    fireEvent.change(document.querySelector(".scan-review__row select"), { target: { value: "white" } });
    fireEvent.click(screen.getByRole("button", { name: /^guardar$/i }));
    expect(onConfirm.mock.calls[0][0].type).toBe("white");
  });

  it("los campos siguen ahí mientras se escribe (no se desmontan ni pierden el foco)", () => {
    render(<ScanReview reading={LECTURA({ confidence: { line: 95, winery: 40, varietal: 92, vintage: 90, region: 88, type: 85 } })} onConfirm={vi.fn()} onRescan={vi.fn()} />);
    const input = screen.getByPlaceholderText("Bodega");
    input.focus();
    fireEvent.change(input, { target: { value: "Catena" } });
    expect(screen.getByPlaceholderText("Bodega")).toBe(input);
    expect(document.activeElement).toBe(input);
  });
});

describe("estilos de la confirmación", () => {
  it("los inputs son de 16px (iOS no hace zoom) y los controles de la barra miden 48", () => {
    const hoja = css("src/components/ScanReview.css");
    expect(hoja).toMatch(/\.scan-review__row input,\s*\.scan-review__row select\s*\{[^}]*font-size:\s*16px/);
    expect(hoja).toMatch(/\.scan-review__save,\s*\.scan-review__secondary\s*\{[^}]*min-height:\s*48px/);
  });

  it("la barra de Guardar queda fija arriba de la navegación", () => {
    expect(css("src/components/ScanReview.css")).toMatch(/\.scan-review__bar\s*\{[^}]*position:\s*sticky/);
  });

  it("el visor tiene margen lateral (antes iba pegado a los bordes)", () => {
    expect(css("src/pages/ScanWinePage.css")).toMatch(/\.scanner-shell\s*\{[^}]*padding:[^;]*var\(--page-pad-x\)/);
  });
});
