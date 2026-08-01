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
    // Es el único campo que se muestra vacío: sin la bodega la ficha está
    // incompleta, y esconderlo haría que el usuario nunca se enterara.
    const onEdit = vi.fn();
    render(<WineIdentity wine={{ name: "Un vino escaneado", type: "red" }} onEdit={onEdit} />);

    expect(screen.getByText("Bodega")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Completar" })).toBeInTheDocument();
  });

  it("no repite la bodega cuando el vino se llama igual que ella", () => {
    render(<WineIdentity wine={{ name: "Rutini", winery: "Rutini", type: "red" }} />);
    // El nombre ya lo dice el encabezado: decirlo de nuevo con rótulo de bodega es
    // ocupar una fila para no agregar nada.
    expect(screen.queryByText("Rutini")).not.toBeInTheDocument();
  });
});
