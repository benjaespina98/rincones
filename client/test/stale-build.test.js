import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { esErrorDeBuildViejo, recuperarDeBuildViejo, observarBuildViejo } from "../src/utils/staleBuild";

/**
 * El caso que estos tests fijan: la PWA instalada arrancaba con un `index.html`
 * viejo y pedía chunks de un build que ya no existía. La pantalla que no cargaba
 * era la de entrar, así que el síntoma era "en la PWA no puedo hacer login", y
 * la única salida conocida era desinstalar la app.
 *
 * Lo que no puede volver a pasar: que un chunk caído termine en una pantalla
 * muerta, y que la recuperación se pueda repetir sola (una recarga en loop es
 * peor que el error).
 */
describe("staleBuild", () => {
  let reload;

  beforeEach(() => {
    sessionStorage.clear();
    reload = vi.fn();
    // jsdom no deja reasignar location.reload directamente.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("esErrorDeBuildViejo", () => {
    it("reconoce las tres redacciones de los navegadores", () => {
      // Chrome/Android, Safari/iOS y Firefox dicen lo mismo de tres formas.
      const mensajes = [
        "Failed to fetch dynamically imported module: https://rincones.vercel.app/assets/LoginPage-a1b2c3.js",
        "Importing a module script failed.",
        "error loading dynamically imported module",
      ];
      for (const message of mensajes) {
        expect(esErrorDeBuildViejo(new Error(message)), message).toBe(true);
      }
    });

    it("reconoce el caso en que el server devolvió HTML en vez del módulo", () => {
      const error = new Error(
        'Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/html".'
      );
      expect(esErrorDeBuildViejo(error)).toBe(true);
    });

    it("no confunde un bug de la app con un build viejo", () => {
      // Si esto diera true, cualquier error de render dispararía una recarga y
      // el bug quedaría escondido detrás de una pantalla que se refresca sola.
      expect(esErrorDeBuildViejo(new TypeError("Cannot read properties of undefined"))).toBe(false);
      expect(esErrorDeBuildViejo(new Error("Request failed with status code 500"))).toBe(false);
      expect(esErrorDeBuildViejo(null)).toBe(false);
      expect(esErrorDeBuildViejo(undefined)).toBe(false);
    });
  });

  describe("recuperarDeBuildViejo", () => {
    it("trae el documento nuevo la primera vez", () => {
      expect(recuperarDeBuildViejo()).toBe(true);
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it("no recarga dos veces: si con la versión nueva sigue fallando, es un error real", () => {
      recuperarDeBuildViejo();
      reload.mockClear();

      expect(recuperarDeBuildViejo()).toBe(false);
      expect(reload).not.toHaveBeenCalled();
    });
  });

  describe("observarBuildViejo", () => {
    it("ataja el aviso de Vite antes de que el error llegue a la pantalla", () => {
      const desenganchar = observarBuildViejo();

      const evento = new Event("vite:preloadError", { cancelable: true });
      window.dispatchEvent(evento);

      expect(reload).toHaveBeenCalledTimes(1);
      expect(evento.defaultPrevented).toBe(true);

      desenganchar();
    });

    it("deja de escuchar al desengancharse", () => {
      const desenganchar = observarBuildViejo();
      desenganchar();

      window.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));

      expect(reload).not.toHaveBeenCalled();
    });
  });
});
