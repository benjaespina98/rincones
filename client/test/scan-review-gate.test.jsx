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

    const guardar = screen.getByRole("button", { name: /agregar a mi bodega|guardarlo como probado/i });
    expect(guardar).not.toBeDisabled();

    fireEvent.click(guardar);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("manda la evidencia que el servidor necesita para decidir", () => {
    const onConfirm = vi.fn();
    render(<ScanReview reading={BUENA} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: /agregar a mi bodega|guardarlo como probado/i }));

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
  it("con el nombre igual a la bodega avisa, pero deja guardar igual", () => {
    const onConfirm = vi.fn();
    const rota = lectura(
      { winery: "Pispi", line: "Pispi", varietal: "Blend", type: "red" },
      { line: 97, winery: 96, varietal: 90 }
    );

    render(<ScanReview reading={rota} onConfirm={onConfirm} />);

    // El problema se dice: nombre y bodega salieron iguales, y eso casi siempre
    // es un error de lectura.
    expect(screen.getByText(/revisá esto antes de guardar/i)).toBeTruthy();

    // Pero no se frena: hay nombre, así que hay botella que agregar.
    const guardar = screen.getByRole("button", { name: /agregar a mi bodega|guardarlo como probado/i });
    expect(guardar).not.toBeDisabled();

    fireEvent.click(guardar);
    expect(onConfirm).toHaveBeenCalledTimes(1);
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

    // Corregir lo señalado hace desaparecer el aviso: es lo que confirma que el
    // aviso hablaba de ESE campo y no de un estado difuso de "algo anda mal".
    expect(screen.queryByText(/revisá esto antes de guardar/i)).toBeNull();

    const guardar = screen.getByRole("button", { name: /agregar a mi bodega|guardarlo como probado/i });
    expect(guardar).not.toBeDisabled();

    fireEvent.click(guardar);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const draft = onConfirm.mock.calls[0][0];
    expect(draft.winery).toBe("Mosquita Muerta");
    expect(draft.name).toBe("Pispi");
    expect(draft.identEditedFields).toContain("winery");
  });

  it("sin nombre lo señala y deja el campo a mano para escribirlo", () => {
    // Es el caso que apareció al sacar el fallback a la bodega: una etiqueta de
    // la que sólo se leyó quién la hace.
    //
    // El botón ya no se apaga —el escaneo no frena— y la validación del nombre
    // vacío la hace ScanWinePage al confirmar, con un error que dice qué falta
    // ("Escribí la línea o el nombre del vino"). Lo que le toca a esta pantalla,
    // y es lo que se prueba, es señalar el problema y tener el campo al lado.
    const onConfirm = vi.fn();
    const sinNombre = lectura(
      { winery: "Bodegas Salentein", varietal: "Blend", type: "sparkling" },
      { winery: 95, varietal: 88, type: 80 }
    );

    render(<ScanReview reading={sinNombre} onConfirm={onConfirm} />);

    expect(screen.getByText(/no pudimos leer cómo se llama/i)).toBeTruthy();

    // El campo para arreglarlo tiene que estar a la vista, no detrás de "editar
    // todos los datos": un aviso sin el campo al lado es un callejón sin salida.
    const campo = screen.getByPlaceholderText(/lo que dice grande/i);
    fireEvent.change(campo, { target: { value: "Cuvée Exceptionnelle" } });

    // Y una vez escrito, el aviso se va: hablaba de ese campo.
    expect(screen.queryByText(/no pudimos leer cómo se llama/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /agregar a mi bodega|guardarlo como probado/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0].name).toBe("Cuvée Exceptionnelle");
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
    fireEvent.click(screen.getByRole("button", { name: /agregar a mi bodega|guardarlo como probado/i }));

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
    fireEvent.click(screen.getByRole("button", { name: /agregar a mi bodega|guardarlo como probado/i }));

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
    // Se avisa, porque nombre = bodega casi siempre es un error de lectura…
    expect(screen.getByText(/revisá esto antes de guardar/i)).toBeTruthy();

    // …y confirmarlo saca el aviso, que es la salida para Norton y compañía.
    fireEvent.click(screen.getByRole("button", { name: /se llama igual que la bodega/i }));

    expect(screen.queryByText(/revisá esto antes de guardar/i)).toBeNull();
    const guardar = screen.getByRole("button", { name: /agregar a mi bodega|guardarlo como probado/i });
    expect(guardar).not.toBeDisabled();

    fireEvent.click(guardar);
    // Es la evidencia que le permite al servidor publicarlo igual.
    expect(onConfirm.mock.calls[0][0].identSameNameConfirmed).toBe(true);
  });

  /**
   * ── DECISIÓN ACTUALIZADA ─────────────────────────────────────────────────
   * Antes una lectura floja no frenaba nada: no había ningún campo puntual que
   * corregir, y el catálogo público de todos modos decide por identidad, no
   * por confianza. Pero eso dejaba pasar en silencio justo el caso que hay que
   * frenar — "no sabemos qué es esto" — con el mismo botón de siempre. Ahora
   * una confianza de nombre por debajo del umbral (`CONFIDENCE.REVIEW`, el
   * mismo que ya usa el servidor) muestra el estado de baja confianza en vez
   * del formulario, con salida a reintentar, buscar a mano, o — si la persona
   * de verdad quiere— completar los datos ella misma.
   */
  it("una lectura floja no ofrece guardar de un toque: pide reintentar o cargar a mano", () => {
    const onConfirm = vi.fn();
    const onRescan = vi.fn();
    const onManual = vi.fn();
    const floja = lectura(
      { winery: "Mosquita Muerta", line: "Pispi", varietal: "Blend", type: "red" },
      { line: 35, winery: 40, varietal: 30 }
    );

    render(<ScanReview reading={floja} onConfirm={onConfirm} onRescan={onRescan} onManual={onManual} />);

    expect(screen.getByText(/no se pudo identificar el vino/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /agregar a mi bodega|guardarlo como probado/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /intentar nuevamente/i }));
    expect(onRescan).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /buscar manualmente/i }));
    expect(onManual).toHaveBeenCalledTimes(1);
  });

  it("desde una lectura floja, se puede insistir y completar los datos a mano", () => {
    const onConfirm = vi.fn();
    const floja = lectura(
      { winery: "Mosquita Muerta", line: "Pispi", varietal: "Blend", type: "red" },
      { line: 35, winery: 40, varietal: 30 }
    );

    render(<ScanReview reading={floja} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: /completar los datos a mano/i }));

    // Insistir abre el formulario de siempre. Ya no arranca bloqueado —el
    // escaneo no frena— pero sigue siendo el mismo formulario editable, que es
    // lo que la salida promete.
    const guardar = screen.getByRole("button", { name: /agregar a mi bodega|guardarlo como probado/i });
    expect(guardar).not.toBeDisabled();

    // Un valor DISTINTO del que ya tenía el campo: si se deja el mismo texto,
    // React no dispara el cambio (no hay nada que actualizar) y el test no
    // prueba nada.
    fireEvent.change(screen.getByPlaceholderText(/lo que dice grande/i), {
      target: { value: "Pispi Reserva" },
    });

    fireEvent.click(guardar);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    // Lo que se escribió a mano es lo que se guarda, y queda anotado como
    // editado para que el servidor sepa que no es una lectura cruda.
    const draft = onConfirm.mock.calls[0][0];
    expect(draft.name).toBe("Pispi Reserva");
    expect(draft.identEditedFields).toContain("line");
  });

  it("una identificación con problemas (no sólo floja) muestra el formulario, no el estado de 'sin identificar'", () => {
    // Distingue las dos causas de "doubtful": acá SÍ hay un campo puntual que
    // señalar (varietal desconocido más nombre=bodega), así que corresponde
    // seguir mostrando el aviso de siempre con el campo al lado, no el panel
    // de "no pudimos identificarlo".
    const onConfirm = vi.fn();
    const rota = lectura(
      { winery: "Pispi", line: "Pispi", varietal: "Blend", type: "red" },
      { line: 97, winery: 96, varietal: 90 }
    );

    render(<ScanReview reading={rota} onConfirm={onConfirm} />);
    expect(screen.queryByText(/no pudimos identificar el vino con suficiente seguridad/i)).toBeNull();
    expect(screen.getByText(/revisá esto antes de guardar/i)).toBeTruthy();
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
    expect(screen.getByRole("button", { name: /agregar a mi bodega|guardarlo como probado/i })).not.toBeDisabled();
    // Con un dato que no cierra, el veredicto es "unverified" (media
    // confianza): se pide una confirmación, no se anuncia como resuelto.
    expect(screen.getByText(/¿este es tu vino\?/i)).toBeTruthy();
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
    fireEvent.click(screen.getByRole("button", { name: /agregar a mi bodega|guardarlo como probado/i }));

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
    // Aceptado, el nombre pasa a ser un dato confirmado y se muestra como chip:
    // para corregirlo hay que abrir todos los campos, que es el mismo camino que
    // haría una persona.
    fireEvent.click(screen.getByRole("button", { name: /editar todos los datos/i }));
    fireEvent.change(screen.getByPlaceholderText(/lo que dice grande/i), {
      target: { value: "Angélica Zapata Alluvial" },
    });
    fireEvent.click(screen.getByRole("button", { name: /agregar a mi bodega|guardarlo como probado/i }));

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
    fireEvent.click(screen.getByRole("button", { name: /agregar a mi bodega|guardarlo como probado/i }));
    expect(onConfirm.mock.calls[0][0].name).toBe("Serie Q");
  });

  it("una lectura sin nada raro se anuncia como encontrada, no como una pregunta", () => {
    render(<ScanReview reading={BUENA} onConfirm={vi.fn()} />);
    expect(screen.getByText(/vino encontrado/i)).toBeTruthy();
    expect(screen.queryByText(/¿este es tu vino\?/i)).toBeNull();
  });
});
