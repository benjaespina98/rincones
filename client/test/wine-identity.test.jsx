import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import WineIdentity from "../src/components/WineIdentity";
import { getCellarStatus } from "../src/utils/cellarStatus";

/**
 * La ficha de datos de un vino, y la lectura de guarda que reemplazó a
 * "Esperá 2 años".
 *
 * Vale un test porque las dos cosas que arregla son de interfaz y no de datos:
 *  - la BODEGA tiene que estar visible y con su rótulo (era el dato que más ubica
 *    un vino y el único que faltaba en la tira de chips);
 *  - la guarda tiene que decir un AÑO, no una cuenta de años. "Esperá 2 años" no
 *    dice de qué habla ni contra qué se mide, y encima envejece mal: el mismo texto
 *    ya es falso al año siguiente.
 */

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Fija el año para que los textos con año no dependan de cuándo se corre el test. */
const enElAño = (año) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${año}-06-15T12:00:00Z`));
};

describe("la lectura de guarda", () => {
  it("dice el año a partir del cual conviene tomarlo, no cuántos años faltan", () => {
    enElAño(2026);
    // Malbec 2025: ventana típica 2028–2035.
    const guarda = getCellarStatus({ vintage: 2025, type: "red", varietal: "Malbec" });

    expect(guarda.status).toBe("early");
    expect(guarda.label).toBe("Mejor a partir de 2028");
    // Lo que reemplazó: un número sin referencia.
    expect(guarda.label).not.toMatch(/Esperá/);
    // Y al lado, la ventana entera: dos años se leen de un vistazo, la frase que
    // había antes ("le faltan 2 años para su mejor momento") era un renglón para
    // decir lo mismo.
    expect(guarda.detail).toBe("2028 – 2035");
  });

  it("cuando está listo lo dice sin pedir cuentas mentales", () => {
    enElAño(2030);
    const guarda = getCellarStatus({ vintage: 2025, type: "red", varietal: "Malbec" });
    expect(guarda.status).toBe("peak");
    expect(guarda.label).toBe("Listo para tomar");
    expect(guarda.detail).toBe("2028 – 2035");
  });

  it("las fechas que cargó el usuario pisan la estimación", () => {
    enElAño(2026);
    const guarda = getCellarStatus({
      vintage: 2025,
      type: "red",
      varietal: "Malbec",
      cellar: { drinkFrom: 2026, drinkUntil: 2027 },
    });
    expect(guarda.status).toBe("peak");
    expect(guarda.source).toBe("manual");
  });

  it("sin cosecha no inventa una ventana", () => {
    expect(getCellarStatus({ type: "red", varietal: "Malbec" }).label).toBe("");
  });
});

describe("WineIdentity", () => {
  it("muestra la bodega con su rótulo", () => {
    render(
      <WineIdentity
        wine={{ name: "Portillo", winery: "Bodegas Salentein", varietal: "Malbec", vintage: 2025, type: "red" }}
      />
    );

    expect(screen.getByText("Bodega")).toBeInTheDocument();
    expect(screen.getByText("Bodegas Salentein")).toBeInTheDocument();
    expect(screen.getByText("Malbec")).toBeInTheDocument();
    expect(screen.getByText("2025")).toBeInTheDocument();
  });

  it("cuando falta la bodega deja el hueco a la vista y ofrece completarla", () => {
    // Es uno de los dos campos que se muestran vacíos: sin la bodega la ficha
    // está incompleta, y esconderlo haría que el usuario nunca se enterara.
    // Se le pone cosecha para que el único hueco sea el de la bodega — con los
    // dos vacíos hay dos botones "Completar", que es correcto pero no es lo que
    // esta prueba mira.
    const onEdit = vi.fn();
    render(
      <WineIdentity wine={{ name: "Un vino escaneado", vintage: 2021, type: "red" }} onEdit={onEdit} />
    );

    expect(screen.getByText("Bodega")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Completar" })).toBeInTheDocument();
  });

  it("muestra la bodega aunque el vino se llame igual que ella", () => {
    // Antes se ocultaba por no repetir el dato. Se cambió a propósito: hay
    // decenas de vinos cuyo nombre ES el de su bodega (Norton, El Enemigo,
    // Durigutti), y ocultarla hacía que completar ese campo a mano no se viera
    // reflejado en ningún lado — la persona editaba, guardaba, y la ficha seguía
    // mostrando "—". Confirmar un dato dos veces vale más que un campo que
    // parece no haberse guardado.
    render(<WineIdentity wine={{ name: "Rutini", winery: "Rutini", vintage: 2020, type: "red" }} />);

    expect(screen.getByText("Bodega")).toBeInTheDocument();
    expect(screen.getByText("Rutini")).toBeInTheDocument();
  });
});

/**
 * ── CUÁNDO SE DICE "CUÁNDO TOMARLO" ─────────────────────────────────────────
 * Sólo si tenés botellas. Es una instrucción sobre una botella que está
 * esperando en algún lado: sin botella no le habla a nadie.
 *
 * Se reportó al revés: entrar desde Probados a un vino ya tomado y encontrarse
 * con "mejor tomar en tal fecha". La misma ficha se dibuja en cuatro
 * situaciones y en tres de ellas no hay nada que decidir.
 */
describe("la recomendación de cuándo tomarlo, según el contexto", () => {
  const malbec = { name: "Portillo", winery: "Salentein", varietal: "Malbec", vintage: 2019, type: "red" };

  it("con botellas en la cava, la dice", () => {
    enElAño(2026);
    render(<WineIdentity wine={{ ...malbec, quantity: 3 }} />);
    expect(screen.getByText("Listo para tomar")).toBeInTheDocument();
  });

  it("sin stock no la dice: ya no hay nada que guardar", () => {
    enElAño(2026);
    render(<WineIdentity wine={{ ...malbec, quantity: 0 }} />);
    expect(screen.queryByText("Listo para tomar")).not.toBeInTheDocument();
  });

  it("desde Probados y sin stock, no la dice", () => {
    enElAño(2026);
    render(<WineIdentity wine={{ ...malbec, quantity: 0, tasted: true }} />);
    expect(screen.queryByText("Listo para tomar")).not.toBeInTheDocument();
    // Y tampoco la versión que peor caía: "pasó su mejor momento" sobre un vino
    // que la persona disfrutó anoche.
    expect(screen.queryByText("Pasó su mejor momento")).not.toBeInTheDocument();
  });

  it("probado pero con botellas todavía, sí la dice", () => {
    // Probado y en stock son dos hechos independientes (ver utils/cellarViews.js):
    // que ya lo hayas tomado no borra que te queden tres esperando.
    enElAño(2026);
    render(<WineIdentity wine={{ ...malbec, quantity: 3, tasted: true }} />);
    expect(screen.getByText("Listo para tomar")).toBeInTheDocument();
  });

  it("en un vino del catálogo —que no tenés— no la dice", () => {
    // Un resultado de búsqueda no trae `quantity`: la misma condición lo cubre
    // sin preguntar por la ruta ni por quién montó el componente.
    enElAño(2026);
    render(<WineIdentity wine={malbec} />);
    expect(screen.queryByText("Listo para tomar")).not.toBeInTheDocument();
  });
});
