import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ScanReview from "../src/components/ScanReview";

/**
 * A dónde va un vino escaneado.
 *
 * Lo que casi todo el mundo hace al escanear una etiqueta es guardar esa botella en su
 * bodega, así que eso es lo que tiene que pasar de un toque y por defecto. Antes el control
 * de botellas arrancaba en cero y el botón principal decía "Anotarlo como ya tomado": lo
 * contrario de lo que se viene a hacer.
 *
 * Las otras tres salidas siguen estando, pero son chicas y no son el camino por defecto:
 *   · bajar las botellas a cero → "lo probé y no es mío" (un restaurante, lo de alguien);
 *   · "Solo consultar"          → ver la información sin guardar nada;
 *   · "Quiero probarlo"         → a la lista de deseos.
 */
const LECTURA = {
  source: "gemini",
  values: {
    winery: "Catena Zapata",
    line: "Saint Felicien",
    properName: "",
    varietal: "Malbec",
    vintage: "2019",
    region: "Luján de Cuyo, Mendoza",
    type: "red",
  },
  confidence: { line: 95, winery: 93, varietal: 92, vintage: 90, region: 88, type: 85 },
  serverIssues: [],
};

const montar = (props = {}) => {
  const manejadores = { onConfirm: vi.fn(), onWish: vi.fn(), onConsult: vi.fn() };
  render(<ScanReview reading={LECTURA} {...manejadores} {...props} />);
  return manejadores;
};

const principal = () => document.querySelector(".scan-review__save");

describe("el destino por defecto es TU BODEGA", () => {
  it("el botón principal dice 'Agregar a mi bodega' y nunca 'ya tomado'", () => {
    montar();
    expect(principal()).toHaveTextContent("Agregar a mi bodega");
    expect(screen.queryByText(/anotarlo como ya tomado/i)).toBeNull();
  });

  it("de un toque guarda UNA botella (con stock), no cero", () => {
    const { onConfirm } = montar();
    fireEvent.click(principal());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0].quantity).toBe(1);
  });

  it("la consecuencia dice que entra con stock", () => {
    montar();
    expect(screen.getByText("Entra a tu bodega, con stock.")).toBeInTheDocument();
  });

  it("los atajos de media docena y de una caja suman botellas", () => {
    const { onConfirm } = montar();
    fireEvent.click(screen.getByRole("button", { name: "6" }));
    expect(principal()).toHaveTextContent("Agregar 6 botellas");
    fireEvent.click(screen.getByRole("button", { name: "12" }));
    fireEvent.click(principal());
    expect(onConfirm.mock.calls[0][0].quantity).toBe(12);
  });
});

describe("bajar las botellas a cero: lo probé y no es mío", () => {
  it("el botón pasa a 'Anotarlo como ya tomado' y la consecuencia lo dice", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: /una botella menos/i }));
    expect(principal()).toHaveTextContent("Anotarlo como ya tomado");
    expect(screen.getByText(/queda en «ya tomados», no suma stock/i)).toBeInTheDocument();
  });

  it("guarda con cero botellas", () => {
    const { onConfirm } = montar();
    fireEvent.click(screen.getByRole("button", { name: /una botella menos/i }));
    fireEvent.click(principal());
    expect(onConfirm.mock.calls[0][0].quantity).toBe(0);
  });

  it("no baja de cero", () => {
    montar();
    const menos = screen.getByRole("button", { name: /una botella menos/i });
    fireEvent.click(menos);
    expect(menos).toBeDisabled();
  });
});

describe("'Solo consultar': ver el vino sin guardar nada", () => {
  it("abre la consulta con los datos del vino y NO guarda", () => {
    const { onConsult, onConfirm, onWish } = montar();
    fireEvent.click(screen.getByRole("button", { name: /solo consultar/i }));

    expect(onConsult).toHaveBeenCalledTimes(1);
    expect(onConsult.mock.calls[0][0]).toMatchObject({
      name: "Saint Felicien",
      winery: "Catena Zapata",
      varietal: "Malbec",
      vintage: "2019",
      type: "red",
    });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onWish).not.toHaveBeenCalled();
  });

  it("no se ofrece si la pantalla no sabe consultar", () => {
    montar({ onConsult: undefined });
    expect(screen.getByRole("button", { name: /solo consultar/i })).toBeDisabled();
  });
});

describe("'Quiero probarlo': a la lista de deseos", () => {
  it("va a la lista y NO guarda en la bodega", () => {
    const { onWish, onConfirm, onConsult } = montar();
    fireEvent.click(screen.getByRole("button", { name: /quiero probarlo/i }));
    expect(onWish).toHaveBeenCalledTimes(1);
    expect(onWish.mock.calls[0][0].name).toBe("Saint Felicien");
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onConsult).not.toHaveBeenCalled();
  });
});

describe("las salidas secundarias son chicas y están juntas", () => {
  it("'Solo consultar' y 'Quiero probarlo' comparten una fila, aparte del botón principal", () => {
    montar();
    const fila = document.querySelector(".scan-review__otras");
    expect(fila).toBeTruthy();
    expect(fila.querySelectorAll("button")).toHaveLength(2);
    expect(fila.contains(principal())).toBe(false);
  });
});
