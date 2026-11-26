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
    expect(document.querySelector(".scan-review__issues")).toBeNull();

    const guardar = screen.getByRole("button", { name: /^guardar$/i });
    expect(guardar).not.toBeDisabled();

    fireEvent.click(guardar);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("manda la evidencia que el servidor necesita para decidir", () => {
    const onConfirm = vi.fn();
    render(<ScanReview reading={BUENA} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: /^guardar$/i }));

    const draft = onConfirm.mock.calls[0][0];
    expect(draft.identSource).toBe("scan");
    expect(draft.identConfidence).toMatchObject({ line: 95, winery: 93 });
    expect(draft.identEditedFields).toEqual([]);
    // El nombre visible es la línea, sin la uva y sin la bodega.
    expect(draft.name).toBe("Saint Felicien");
  });

  /**
   * ── EL ESCANEO AVISA, PERO NO FRENA ─────────────────────────────────────────
   * Estas pruebas fijaban lo contrario: que una lectura dudosa APAGABA el botón
   * de guardar hasta corregirla. La decisión de producto se dio vuelta a
   * propósito —priorizar que la botella entre a la bodega siempre que haya con
   * qué nombrarla, y que lo que salió mal se corrija después editando el vino ya
   * guardado, no antes de guardarlo (ver `bloqueado` en ScanReview.jsx)—.
   *
   * Lo que sigue siendo cierto, y es lo que se prueba ahora: el problema se
   * SEÑALA, el campo para arreglarlo está a la vista, y corregirlo hace
   * desaparecer el aviso. El único caso sin salida es no tener nombre, porque
   * ahí todavía no hay ninguna botella que agregar.
   */
  it("con el nombre igual a la bodega no pregunta nada y guarda", () => {
    const onConfirm = vi.fn();
    const rota = lectura(
      { winery: "Pispi", line: "Pispi", varietal: "Blend", type: "red" },
      { line: 97, winery: 96, varietal: 90 }
    );

    render(<ScanReview reading={rota} onConfirm={onConfirm} />);

    expect(document.querySelector(".scan-review__issues")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^guardar$/i }));
    expect(onConfirm.mock.calls[0][0].name).toBe("Pispi");
    // Nadie confirmó nada: el servidor sigue sin publicarlo al catálogo compartido.
    expect(onConfirm.mock.calls[0][0].identSameNameConfirmed).toBeUndefined();
  });

  it("corregir la bodega no cambia el nombre leído y queda anotado como editado", () => {
    const onConfirm = vi.fn();
    const rota = lectura(
      { winery: "Pispi", line: "Pispi", varietal: "Blend", type: "red" },
      { line: 97, winery: 96, varietal: 90 }
    );

    render(<ScanReview reading={rota} onConfirm={onConfirm} />);
    fireEvent.change(screen.getByPlaceholderText("Bodega"), { target: { value: "Mosquita Muerta" } });
    fireEvent.click(screen.getByRole("button", { name: /^guardar$/i }));

    const draft = onConfirm.mock.calls[0][0];
    expect(draft.winery).toBe("Mosquita Muerta");
    expect(draft.name).toBe("Pispi");
    expect(draft.identEditedFields).toContain("winery");
  });

  /**
   * ── SIN NOMBRE LEGIBLE, SE COMPLETA SOLO ──────────────────────────────────
   * Pedirle a la persona que escriba es la última opción.
   */
  it("si sólo se leyó la bodega, el nombre es la bodega y se guarda de un toque", () => {
    const onConfirm = vi.fn();
    const sinNombre = lectura(
      { winery: "Finca Humanao" },
      { winery: 95 },
      { serverIssues: ["sin-nombre"] }
    );

    render(<ScanReview reading={sinNombre} onConfirm={onConfirm} />);

    expect(screen.getByPlaceholderText(/lo que dice grande/i)).toHaveValue("Finca Humanao");
    expect(document.querySelector(".scan-review__issues")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^guardar$/i }));
    expect(onConfirm.mock.calls[0][0].name).toBe("Finca Humanao");
  });

  it("si sólo se leyó la uva, el vino se guarda con la uva como nombre", () => {
    const onConfirm = vi.fn();
    render(<ScanReview reading={lectura({ varietal: "Malbec" }, { varietal: 90 })} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: /^guardar$/i }));
    expect(onConfirm.mock.calls[0][0].name).toBe("Malbec");
  });

  it("se puede escribir un nombre de dos palabras: el espacio no se pierde al tipear", () => {
    const onConfirm = vi.fn();
    render(<ScanReview reading={lectura({ winery: "Salentein" }, { winery: 95 })} onConfirm={onConfirm} />);
    const campo = screen.getByPlaceholderText(/lo que dice grande/i);

    fireEvent.change(campo, { target: { value: "Finca " } });
    expect(campo).toHaveValue("Finca ");
    fireEvent.change(campo, { target: { value: "Finca Humanao" } });
    fireEvent.click(screen.getByRole("button", { name: /^guardar$/i }));

    expect(onConfirm.mock.calls[0][0].name).toBe("Finca Humanao");
  });

  it("borrar el nombre deja el campo vacío para reescribirlo, sin que vuelva la bodega", () => {
    render(<ScanReview reading={lectura({ winery: "Salentein" }, { winery: 95 })} onConfirm={vi.fn()} />);
    const campo = screen.getByPlaceholderText(/lo que dice grande/i);
    fireEvent.change(campo, { target: { value: "" } });
    expect(campo).toHaveValue("");
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
    fireEvent.click(screen.getByRole("button", { name: /^guardar$/i }));

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
    fireEvent.click(screen.getByRole("button", { name: /^guardar$/i }));

    const draft = onConfirm.mock.calls[0][0];
    expect(draft.properName).toBe("Angélica Zapata Alluvial");
    expect(draft.line).toBe("");
  });

  /**
   * "No se pudo identificar" es la última salida: sólo sin ningún dato, o con texto dudoso del OCR.
   */
  it("una lectura floja pero con datos muestra la ficha marcada y deja guardar", () => {
    const floja = lectura(
      { winery: "Mosquita Muerta", line: "Pispi", varietal: "Blend", type: "red" },
      { line: 35, winery: 40, varietal: 30 }
    );
    render(<ScanReview reading={floja} onConfirm={vi.fn()} />);

    expect(screen.queryByText(/no se pudo identificar el vino/i)).toBeNull();
    expect(document.querySelector(".scan-review__marca")).not.toBeNull();
    expect(screen.getByRole("button", { name: /^guardar$/i })).not.toBeDisabled();
  });

  it("sin ningún dato pide reintentar o cargar a mano", () => {
    const onRescan = vi.fn();
    const onManual = vi.fn();
    render(<ScanReview reading={lectura({}, {})} onRescan={onRescan} onManual={onManual} />);

    expect(screen.getByText(/no se pudo identificar el vino/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^guardar$/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /intentar nuevamente/i }));
    expect(onRescan).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /cargar a mano/i }));
    expect(onManual).toHaveBeenCalledTimes(1);
  });

  it("el texto dudoso del OCR no se ofrece como vino; se puede insistir y completarlo", () => {
    const onConfirm = vi.fn();
    const ocr = lectura({ properName: "lj aa" }, { name: 30 }, { source: "ocr" });
    render(<ScanReview reading={ocr} onConfirm={onConfirm} />);

    expect(screen.getByText(/no se pudo identificar el vino/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /completar los datos a mano/i }));
    fireEvent.change(screen.getByPlaceholderText(/lo que dice grande/i), {
      target: { value: "Pispi Reserva" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^guardar$/i }));

    const draft = onConfirm.mock.calls[0][0];
    expect(draft.name).toBe("Pispi Reserva");
    expect(draft.identEditedFields).toContain("properName");
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
    expect(screen.getByRole("button", { name: /^guardar$/i })).not.toBeDisabled();
    // Con un dato que no cierra la fila de la uva queda marcada para revisar y el vino no se
    // anuncia como verificado.
    expect(screen.getByPlaceholderText("Uva").closest("label").textContent).toMatch(/Revisá/);
    expect(screen.queryByText(/verificado/i)).toBeNull();
  });

  /**
   * ── EL TRAMO DEL MEDIO DE LA IDENTIFICACIÓN ───────────────────────────────
   * Cuando el servidor encuentra un candidato bueno pero no seguro, NO toca los
   * datos de la lectura: manda el vino aparte y la pantalla pregunta. Aceptar
   * tiene que ser un toque que complete todo, y tiene que contar como un dato
   * puesto por la persona —que es lo que es: alguien mirando la botella.
   */
  it("cuando la app duda, ofrece el vino y aceptarlo completa la ficha", () => {
    const onConfirm = vi.fn();
    const dudosa = lectura(
      { winery: "Familia Zuccardi", line: "Serie Q", varietal: "Malbec", type: "red" },
      { line: 70, winery: 90, varietal: 88 }
    );

    render(
      <ScanReview
        reading={dudosa}
        onConfirm={onConfirm}
        verification={{
          status: "sugerido",
          source: "catalogo-ar",
          name: "",
          mismatches: [],
          candidate: {
            name: "Zuccardi Serie A",
            winery: "Familia Zuccardi",
            varietal: "Malbec",
            region: "Valle de Uco, Mendoza",
            type: "red",
          },
          alternative: null,
        }}
      />
    );

    expect(screen.getByText(/¿es este vino\?/i)).toBeTruthy();
    // Hasta que se conteste, la lectura queda como estaba: la app no cambia el
    // vino por su cuenta.
    expect(screen.getByText("Serie Q")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /sí, es ese/i }));
    fireEvent.click(screen.getByRole("button", { name: /^guardar$/i }));

    const draft = onConfirm.mock.calls[0][0];
    expect(draft.name).toBe("Zuccardi Serie A");
    expect(draft.region).toBe("Valle de Uco, Mendoza");
    // Confirmar mirando la botella vale como dato tipeado: es la señal más
    // fuerte que tiene el servidor para decidir si esto puede publicarse.
    expect(draft.identEditedFields).toContain("line");
  });

  /**
   * Aceptar el candidato mueve el nombre a la LÍNEA. Lo que se edite después
   * tiene que ir al mismo campo: si no, el nombre nuevo queda en el nombre
   * propio y la línea conserva el del candidato — dos campos con dos vinos
   * distintos, y la deduplicación mira la línea primero, así que el vino se
   * guardaría con un nombre que ya no es el que dice la pantalla.
   */
  it("después de aceptar, editar el nombre no deja dos vinos en el mismo vino", () => {
    const onConfirm = vi.fn();
    // La lectura trae NOMBRE PROPIO, que es el caso donde el destino cambia.
    const conNombrePropio = lectura(
      { winery: "Catena Zapata", properName: "Angélica Zapta", varietal: "Malbec", type: "red" },
      { name: 70, winery: 92, varietal: 90 }
    );

    render(
      <ScanReview
        reading={conNombrePropio}
        onConfirm={onConfirm}
        verification={{
          status: "sugerido",
          candidate: { name: "Angélica Zapata", winery: "Catena Zapata", varietal: "Malbec" },
          alternative: null,
          mismatches: [],
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /sí, es ese/i }));
    // Aceptado, el nombre pasa a ser un dato confirmado; para corregirlo se escribe en su fila.
    fireEvent.change(screen.getByPlaceholderText(/lo que dice grande/i), {
      target: { value: "Angélica Zapata Alluvial" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^guardar$/i }));

    const draft = onConfirm.mock.calls[0][0];
    expect(draft.name).toBe("Angélica Zapata Alluvial");
    expect(draft.line).toBe("Angélica Zapata Alluvial");
    expect(draft.properName).toBe("");
  });

  it("se puede rechazar el candidato y seguir con lo que dice la etiqueta", () => {
    const onConfirm = vi.fn();
    const dudosa = lectura(
      { winery: "Familia Zuccardi", line: "Serie Q", varietal: "Malbec", type: "red" },
      { line: 70, winery: 90, varietal: 88 }
    );

    render(
      <ScanReview
        reading={dudosa}
        onConfirm={onConfirm}
        verification={{
          status: "sugerido",
          candidate: { name: "Zuccardi Serie A", winery: "Familia Zuccardi", varietal: "Malbec" },
          alternative: null,
          mismatches: [],
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /no, es otro/i }));

    // La pregunta se va —contestar que no es una respuesta— y el vino sigue
    // siendo el que se leyó.
    expect(screen.queryByText(/¿es este vino\?/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^guardar$/i }));
    expect(onConfirm.mock.calls[0][0].name).toBe("Serie Q");
  });

  it("una lectura sin nada raro no pregunta ni marca nada", () => {
    render(<ScanReview reading={BUENA} onConfirm={vi.fn()} />);
    expect(screen.queryByText(/¿es este vino\?/i)).toBeNull();
    expect(document.querySelector(".scan-review__marca")).toBeNull();
    expect(document.querySelector(".scan-review__issues")).toBeNull();
  });
});

describe("lo que sí se sigue señalando, y lo que no desmonta la ficha", () => {
  it("una uva que contradice el tipo avisa y deja guardar", () => {
    const r = lectura({ winery: "Catena", line: "Alamos", varietal: "Malbec", type: "white" }, { line: 95, winery: 95, varietal: 95 });
    render(<ScanReview reading={r} onConfirm={vi.fn()} />);
    expect(screen.getByText(/la uva y el tipo no coinciden/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^guardar$/i })).not.toBeDisabled();
  });

  it("del servidor se muestra el aviso de la uva y no el de nombre igual a la bodega", () => {
    const r = lectura({ winery: "Pispi", line: "Pispi" }, { line: 95, winery: 95 }, { serverIssues: ["nombre-es-bodega", "varietal-desconocido"] });
    render(<ScanReview reading={r} onConfirm={vi.fn()} />);
    expect(document.querySelectorAll(".scan-review__issues li")).toHaveLength(1);
  });

  it("borrar la bodega para reescribirla no reemplaza la ficha", () => {
    render(<ScanReview reading={lectura({ winery: "Salentein" }, { winery: 95 })} onConfirm={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Bodega"), { target: { value: "" } });
    expect(screen.queryByText(/no se pudo identificar/i)).toBeNull();
    expect(screen.getByPlaceholderText("Bodega")).toBeTruthy();
  });

  it("borrar el nombre no deja guardada la mitad que no se ve", () => {
    const onConfirm = vi.fn();
    const r = lectura({ winery: "Catena", line: "Alamos", properName: "Seleccion" }, { line: 95, name: 95, winery: 95 });
    render(<ScanReview reading={r} onConfirm={onConfirm} />);
    fireEvent.change(screen.getByPlaceholderText(/lo que dice grande/i), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /^guardar$/i }));
    expect(onConfirm.mock.calls[0][0].name).toBe("Catena");
  });

  it("«Quiero probarlo» usa la bodega cuando no se leyó el nombre", () => {
    const onWish = vi.fn();
    render(<ScanReview reading={lectura({ winery: "Salentein" }, { winery: 95 })} onWish={onWish} />);
    fireEvent.click(screen.getByRole("button", { name: /quiero probarlo/i }));
    expect(onWish.mock.calls[0][0].name).toBe("Salentein");
  });
});
