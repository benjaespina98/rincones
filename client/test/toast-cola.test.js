import { describe, it, expect } from "vitest";
import { agregarConTope, MAX_AVISOS } from "../src/utils/toastCola";

const t = (id, action = null) => ({ id, message: id, action });

describe("agregarConTope", () => {
  it("hasta el tope no descarta nada", () => {
    let cola = [];
    for (let i = 0; i < MAX_AVISOS; i += 1) cola = agregarConTope(cola, t(`a${i}`));
    expect(cola.map((x) => x.id)).toEqual(["a0", "a1", "a2"]);
  });

  it("al pasarse descarta el más viejo", () => {
    let cola = [];
    for (let i = 0; i < 6; i += 1) cola = agregarConTope(cola, t(`a${i}`));
    expect(cola.map((x) => x.id)).toEqual(["a3", "a4", "a5"]);
  });

  it("nunca descarta uno con acción (Deshacer) mientras haya otro que sí", () => {
    let cola = [t("deshacer", { label: "Deshacer" }), t("b"), t("c")];
    cola = agregarConTope(cola, t("d"));
    expect(cola.map((x) => x.id)).toEqual(["deshacer", "c", "d"]);
  });

  it("si todos traen acción, manda el tope y se va el más viejo", () => {
    const a = { label: "x" };
    const cola = agregarConTope([t("1", a), t("2", a), t("3", a)], t("4", a));
    expect(cola.map((x) => x.id)).toEqual(["2", "3", "4"]);
  });

  it("el recién llegado nunca es el descartado", () => {
    const cola = agregarConTope([t("1"), t("2"), t("3")], t("nuevo"));
    expect(cola.at(-1).id).toBe("nuevo");
  });
});
