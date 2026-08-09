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
    fireEvent.change(screen.getByPlaceholderText(/lo que dice grande/i), {
      target: { value: "Cuvée Exceptionnelle" },
    });

    expect(screen.getByRole("button", { name: /agregar a mi bodega/i })).not.toBeDisabled();
  });

  /**
   * ── EL NOMBRE ES UN SOLO CAMPO ────────────────────────────────────────────
   * Adentro son dos —línea y nombre propio— y la distinción la necesita la
   * deduplicación. Pero es nuestra, no de quien tiene la botella en la mano:
   * preguntarle en cuál de los dos va "Pispi" es pedirle que entienda nuestro
   * modelo de datos para poder guardar un vino.
   */
  it("el nombre se pide una sola vez, no dividido en línea y nombre propio", () => {
    const sinNombre = lectura(
      { winery: "Bodegas Salentein", varietal: "Blend", type: "sparkling" },
      { winery: 95, varietal: 88, type: 80 }
    );

    render(<ScanReview reading={sinNombre} onConfirm={vi.fn()} />);

    expect(screen.queryByPlaceholderText("Línea")).toBeNull();
    expect(screen.queryByPlaceholderText("Nombre propio")).toBeNull();
    expect(screen.getByPlaceholderText(/lo que dice grande/i)).toBeTruthy();
  });

  it("lo que se escribe en ese campo llega como línea, y el nombre visible sale de ahí", () => {
    const onConfirm = vi.fn();
    const sinNombre = lectura(
      { winery: "Mosquita Muerta", varietal: "Blend", type: "red" },
      { winery: 95, varietal: 88, type: 80 }
    );

    render(<ScanReview reading={sinNombre} onConfirm={onConfirm} />);
    fireEvent.change(screen.getByPlaceholderText(/lo que dice grande/i), {
      target: { value: "Pispi" },
    });
    fireEvent.click(screen.getByRole("button", { name: /agregar a mi bodega/i }));

    const draft = onConfirm.mock.calls[0][0];
    expect(draft.line).toBe("Pispi");
    expect(draft.name).toBe("Pispi");
    // Y el servidor se entera de que lo escribió la persona, no el modelo.
    expect(draft.identEditedFields).toContain("line");
  });

  it("una lectura respetada por el modelo cae al nombre propio, no a la línea", () => {
    const onConfirm = vi.fn();
    const conNombrePropio = lectura(
      {
        winery: "Catena Zapata",
        properName: "Angélica Zapata",
        varietal: "Malbec",
        type: "red",
      },
      { name: 60, winery: 94, varietal: 92 }
    );

    render(<ScanReview reading={conNombrePropio} onConfirm={onConfirm} />);
    fireEvent.change(screen.getByPlaceholderText(/lo que dice grande/i), {
      target: { value: "Angélica Zapata Alluvial" },
    });
    fireEvent.click(screen.getByRole("button", { name: /agregar a mi bodega/i }));

    const draft = onConfirm.mock.calls[0][0];
    expect(draft.properName).toBe("Angélica Zapata Alluvial");
    expect(draft.line).toBe("");
  });

  /**
   * Norton, El Enemigo, Achaval Ferrer, Durigutti, Chandon: hay 25 filas en el
   * catálogo curado donde el nombre coincide con la bodega. Sin una salida, un
   * vino así que todavía no esté en el catálogo no se podía guardar por más que
   * los dos campos estuvieran bien escritos.
   */
  it("se puede confirmar que el vino se llama igual que su bodega", () => {
    const onConfirm = vi.fn();
    const igual = lectura(
      { winery: "Pispi", line: "Pispi", varietal: "Blend", type: "red" },
      { line: 97, winery: 96, varietal: 90 }
    );

    render(<ScanReview reading={igual} onConfirm={onConfirm} />);
    expect(screen.getByRole("button", { name: /agregar a mi bodega/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /se llama igual que la bodega/i }));

    expect(screen.queryByText(/no lo pudimos leer bien/i)).toBeNull();
    const guardar = screen.getByRole("button", { name: /agregar a mi bodega/i });
    expect(guardar).not.toBeDisabled();

    fireEvent.click(guardar);
    // Es la evidencia que le permite al servidor publicarlo igual.
    expect(onConfirm.mock.calls[0][0].identSameNameConfirmed).toBe(true);
  });

  /**
   * Antes esto frenaba el guardado, y era doble castigo: el vino no tenía nada
   * mal, sólo se había leído con poca luz. Y la confianza ya no cambia si entra
   * al catálogo público — eso lo decide la identidad (communityWines.service.js).
   */
  it("una lectura floja no frena nada: no hay nada que corregir", () => {
    const onConfirm = vi.fn();
    const floja = lectura(
      { winery: "Mosquita Muerta", line: "Pispi", varietal: "Blend", type: "red" },
      { line: 35, winery: 40, varietal: 30 }
    );

    render(<ScanReview reading={floja} onConfirm={onConfirm} />);

    const guardar = screen.getByRole("button", { name: /agregar a mi bodega/i });
    expect(guardar).not.toBeDisabled();

    fireEvent.click(guardar);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    // La confianza baja viaja igual: el servidor la usa para NO marcarlo como
    // verificado, que es donde sigue viviendo la exigencia.
    expect(onConfirm.mock.calls[0][0].identConfidence).toMatchObject({ line: 35 });
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
