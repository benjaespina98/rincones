import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ScanReview from "../src/components/ScanReview";
import { checkCoherence, identificationVerdict } from "../src/utils/wineValidation";

/**
 * Cuándo la revisión deja guardar y cuándo pide que la mires.
 *
 * El equilibrio es todo el punto: una lectura buena tiene que seguir siendo un
 * toque —si cada escaneo se vuelve un formulario, la gente deja de escanear— y
 * una mala no puede pasar en silencio, porque desde ahí llega al catálogo que
 * consulta todo el mundo.
 */

const lectura = (values, confidence, extra = {}) => ({
  source: "gemini",
  values: {
    winery: "", line: "", properName: "", varietal: "",
    vintage: "", region: "", type: "unknown",
    ...values,
  },
  confidence,
  serverIssues: [],
  ...extra,
});

const BUENA = lectura(
  {
    winery: "Catena Zapata",
    line: "Saint Felicien",
    varietal: "Malbec",
    vintage: "2019",
    region: "Luján de Cuyo, Mendoza",
    type: "red",
  },
  { line: 95, winery: 93, varietal: 92, vintage: 90, region: 88, type: 85 }
);

describe("la regla, sin pantalla de por medio", () => {
  it("una lectura buena se puede publicar", () => {
    expect(
      identificationVerdict({
        values: BUENA.values,
        confidence: BUENA.confidence,
        source: "gemini",
      })
    ).toBe("trusted");
  });

  it("el nombre igual a la bodega se detecta", () => {
    // El caso Pispi tal como llega desde la revisión: `properName` vacío, la
    // línea con lo que en realidad es el nombre, y la bodega repitiéndolo.
    expect(
      checkCoherence({ line: "Pispi", properName: "", winery: "Pispi" })
    ).toContain("nombre-es-bodega");
  });

  it("una uva desconocida se detecta", () => {
    expect(
      checkCoherence({ line: "Reserva", winery: "Trapiche", varietal: "Blen" })
    ).toContain("varietal-desconocido");
  });
});

describe("ScanReview", () => {
  it("una lectura buena guarda de un toque, sin avisos", () => {
    const onConfirm = vi.fn();
    render(<ScanReview reading={BUENA} onConfirm={onConfirm} />);

    expect(screen.queryByText(/no lo pudimos leer bien/i)).toBeNull();
    expect(screen.queryByText(/revisá esto antes de guardar/i)).toBeNull();

    const guardar = screen.getByRole("button", { name: /agregar a mi bodega/i });
    expect(guardar).not.toBeDisabled();

    fireEvent.click(guardar);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("manda la evidencia que el servidor necesita para decidir", () => {
    const onConfirm = vi.fn();
    render(<ScanReview reading={BUENA} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: /agregar a mi bodega/i }));

    const draft = onConfirm.mock.calls[0][0];
    expect(draft.identSource).toBe("scan");
    expect(draft.identConfidence).toMatchObject({ line: 95, winery: 93 });
    expect(draft.identEditedFields).toEqual([]);
    // El nombre visible es la línea, sin la uva y sin la bodega.
    expect(draft.name).toBe("Saint Felicien");
  });

  it("con el nombre igual a la bodega no deja guardar", () => {
    const onConfirm = vi.fn();
    const rota = lectura(
      { winery: "Pispi", line: "Pispi", varietal: "Blend", type: "red" },
      { line: 97, winery: 96, varietal: 90 }
    );

    render(<ScanReview reading={rota} onConfirm={onConfirm} />);

    expect(screen.getByText(/no lo pudimos leer bien/i)).toBeTruthy();
    const guardar = screen.getByRole("button", { name: /agregar a mi bodega/i });
    expect(guardar).toBeDisabled();

    fireEvent.click(guardar);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("corregir la bodega desbloquea el guardado, sin pedir nada más", () => {
    // Lo importante es que alcance con arreglar LO SEÑALADO. Si además hubiera
    // que completar región, cosecha y tipo, el aviso dejaría de leerse y la
    // gente buscaría la forma de saltearlo.
    const onConfirm = vi.fn();
    const rota = lectura(
      { winery: "Pispi", line: "Pispi", varietal: "Blend", type: "red" },
      { line: 97, winery: 96, varietal: 90 }
    );

    render(<ScanReview reading={rota} onConfirm={onConfirm} />);

    const bodega = screen.getByPlaceholderText("Bodega");
    fireEvent.change(bodega, { target: { value: "Mosquita Muerta" } });

    expect(screen.queryByText(/no lo pudimos leer bien/i)).toBeNull();

    const guardar = screen.getByRole("button", { name: /agregar a mi bodega/i });
    expect(guardar).not.toBeDisabled();

    fireEvent.click(guardar);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const draft = onConfirm.mock.calls[0][0];
    expect(draft.winery).toBe("Mosquita Muerta");
    expect(draft.name).toBe("Pispi");
    expect(draft.identEditedFields).toContain("winery");
  });

  it("sin nombre pide escribirlo antes de guardar", () => {
    // Es el caso que apareció al sacar el fallback a la bodega: una etiqueta de
    // la que sólo se leyó quién la hace.
    const onConfirm = vi.fn();
    const sinNombre = lectura(
      { winery: "Bodegas Salentein", varietal: "Blend", type: "sparkling" },
      { winery: 95, varietal: 88, type: 80 }
    );

    render(<ScanReview reading={sinNombre} onConfirm={onConfirm} />);

    expect(screen.getByText(/no pudimos leer cómo se llama/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /agregar a mi bodega/i })).toBeDisabled();

    // El campo para arreglarlo tiene que estar a la vista, no detrás de "editar
    // todos los datos": un aviso sin el campo al lado es un callejón sin salida.
    fireEvent.change(screen.getByPlaceholderText("Línea"), {
      target: { value: "Cuvée Exceptionnelle" },
    });

    expect(screen.getByRole("button", { name: /agregar a mi bodega/i })).not.toBeDisabled();
  });

  it("una uva rara se muestra editable en vez de esconderse en un chip", () => {
    const conUvaRara = lectura(
      { winery: "Trapiche", line: "Reserva", varietal: "Xyzzy", type: "red" },
      { line: 92, winery: 94, varietal: 91 }
    );

    render(<ScanReview reading={conUvaRara} onConfirm={vi.fn()} />);

    expect(screen.getByText(/esa uva no nos suena/i)).toBeTruthy();
    // Aunque el modelo dijo 91 de confianza, el campo se abre igual.
    expect(screen.getByPlaceholderText("Uva")).toBeTruthy();
    // Y no bloquea: es raro, no imposible.
    expect(screen.getByRole("button", { name: /agregar a mi bodega/i })).not.toBeDisabled();
  });
});
