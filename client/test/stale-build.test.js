import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { esErrorDeBuildViejo, recuperarDeBuildViejo, observarBuildViejo } from "../src/utils/staleBuild";

/**
 * El módulo recuerda el último chunk caído en una variable suya, así que un test
 * que la ensucia le cambiaría la respuesta al siguiente. Esto trae una copia
 * limpia para los tests que dependen de ese recuerdo.
 */
const moduloLimpio = async () => {
  vi.resetModules();
  return import("../src/utils/staleBuild");
};

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

    /**
     * Esto salió de correr un build de producción con un chunk borrado, y es el
     * caso REAL: el error que llega a React no menciona ningún módulo.
     *
     * Vite atrapa el preload fallido, emite `vite:preloadError`, y el `import()`
     * resuelve a `undefined`. Entonces `React.lazy` hace `modulo.default` sobre
     * eso y lo que sube por el árbol es un `TypeError: Cannot read properties of
     * undefined (reading 'default')` — idéntico a cualquier bug común.
     *
     * Sin esto, la rama del ErrorBoundary para build viejo era código muerto:
     * nunca matcheaba, y la persona veía "Algo salió mal" con un "Reintentar"
     * que no podía funcionar.
     */
    it("reconoce el daño colateral de un chunk caído, que no menciona módulos", async () => {
      const mod = await moduloLimpio();
      const elTypeErrorDeLazy = new TypeError("Cannot read properties of undefined (reading 'default')");

      // Antes del fallo es un error común y no hay que tocarlo.
      expect(mod.esErrorDeBuildViejo(elTypeErrorDeLazy)).toBe(false);

      const desenganchar = mod.observarBuildViejo();
      window.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));
      desenganchar();

      // Ahora sí: hay una causa conocida y reciente que lo explica.
      expect(mod.esErrorDeBuildViejo(elTypeErrorDeLazy)).toBe(true);
    });

    it("el recuerdo del chunk caído no se lo queda para siempre", async () => {
      const mod = await moduloLimpio();
      const desenganchar = mod.observarBuildViejo();
      window.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));
      desenganchar();
      expect(mod.esErrorDeBuildViejo(new TypeError("otro error"))).toBe(true);

      // Un bug de verdad, un rato después, no puede heredar la excusa y quedar
      // tapado detrás de una pantalla de "hay una versión nueva".
      vi.useFakeTimers();
      vi.setSystemTime(Date.now() + 30_000);
      expect(mod.esErrorDeBuildViejo(new TypeError("otro error"))).toBe(false);
      vi.useRealTimers();
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
