import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * El service worker cachea los assets inmutables (los que llevan hash). La regla vieja exigía un
 * punto antes del hash y Vite usa un guion: no coincidía con ningún archivo real. Se extrae la
 * regla de public/sw.js y se prueba contra nombres reales de Vite.
 */
const fuente = fs.readFileSync(path.resolve(__dirname, "../public/sw.js"), "utf8");
const inicio = fuente.indexOf("const esAssetConHash");
const bloque = fuente.slice(inicio, fuente.indexOf(";", fuente.indexOf(".test(", inicio)) + 1);
const esAssetConHash = new Function("self", `${bloque}; return esAssetConHash;`)({ location: { origin: "https://x.test" } });
const url = (p) => ({ origin: "https://x.test", pathname: p });

describe("service worker: assets inmutables", () => {
  it("reconoce los nombres que genera Vite (nombre-HASH.ext), incluidas las fotos", () => {
    for (const p of [
      "/assets/index-BO229LJY.js",
      "/assets/vendor-CnHiwrhx.js",
      "/assets/index-BO229LJY.css",
      "/assets/chakana-nieve-1280-Ab3dEf9h.webp",
    ]) expect(esAssetConHash(url(p)), p).toBe(true);
  });

  it("no toma por inmutable lo que no lleva hash, ni lo de otro origen", () => {
    expect(esAssetConHash(url("/index.html"))).toBe(false);
    expect(esAssetConHash(url("/assets/logo.png"))).toBe(false);
    expect(esAssetConHash({ origin: "https://otro.test", pathname: "/assets/index-BO229LJY.js" })).toBe(false);
  });
});
