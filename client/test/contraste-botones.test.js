import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Contraste (WCAG AA, 4,5:1) del texto blanco sobre los rellenos de los botones. Se mide con la
 * fórmula de luminancia sobre el valor declarado en index.css, no a ojo: el hover del primario
 * (--accent-light) daba 2,42:1 y el confirmar destructivo (--danger) 3,69:1 sin que nada fallara.
 */
const css = fs.readFileSync(path.resolve(__dirname, "../src/index.css"), "utf8");
const token = (nombre) => {
  const m = css.match(new RegExp("--" + nombre + ": *(#[0-9a-fA-F]{6}) *;"));
  if (!m) throw new Error(`--${nombre} tiene que ser un hex de 6 dígitos en index.css`);
  return m[1];
};
const luz = (hex) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [luz(a), luz(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

describe("texto blanco sobre los rellenos de botón", () => {
  for (const nombre of ["accent", "accent-fill-hover", "danger-fill"]) {
    it(`--${nombre} pasa AA (≥ 4,5:1)`, () => {
      expect(ratio("#ffffff", token(nombre))).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("el hover del primario y el confirmar destructivo ya no usan los tokens que fallaban", () => {
    const leer = (f) => fs.readFileSync(path.resolve(__dirname, "../src", f), "utf8");
    expect(leer("components/Button.css")).not.toMatch(/btn--primary:hover[^}]*accent-light/);
    expect(leer("pages/Auth.css")).not.toMatch(/auth-submit:hover[^}]*accent-light/);
    expect(leer("styles/shared/ConfirmModal.css")).not.toMatch(/confirm-modal__confirm--danger\s*{[^}]*var\(--danger\)/);
  });
});
