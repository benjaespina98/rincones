import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * El registro del service worker.
 *
 * Lo que se cuida acá no es que cachee bien —eso se mira en el navegador— sino
 * las tres formas en que esto puede romper la app entera:
 *
 *   · que se registre en desarrollo, donde pelea con el hot reload de Vite;
 *   · que NO desregistre el que alguien ya tenga instalado de antes, que es el
 *     caso real: no alcanza con dejar de registrarlo;
 *   · que una falla suya —modo privado, permisos— tire el arranque.
 *
 * El módulo lee `import.meta.env.PROD` al ejecutarse, así que cada test lo
 * reimporta limpio con el entorno que quiere probar.
 */

const cargar = async () => {
  vi.resetModules();
  return import("../src/utils/registrarSW");
};

/** Un `navigator.serviceWorker` de mentira que anota lo que le piden. */
const falsearSW = ({ registros = [], registrarFalla = false } = {}) => {
  const anotado = { registrados: [], desregistrados: 0 };
  const sw = {
    register: vi.fn(async (ruta) => {
      if (registrarFalla) throw new Error("sin permiso");
      anotado.registrados.push(ruta);
      return {};
    }),
    getRegistrations: vi.fn(async () =>
      registros.map(() => ({
        unregister: async () => {
          anotado.desregistrados += 1;
          return true;
        },
      }))
    ),
  };
  Object.defineProperty(navigator, "serviceWorker", { value: sw, configurable: true });
  return anotado;
};

describe("registrarSW", () => {
  beforeEach(() => {
    vi.stubGlobal("caches", {
      keys: async () => ["rincones-assets-v1", "otra-cosa"],
      delete: vi.fn(async () => true),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete navigator.serviceWorker;
  });

  it("en producción lo registra, pero recién después del load", async () => {
    const anotado = falsearSW();
    const { registrarSW } = await cargar();

    registrarSW({ produccion: true });
    // Todavía no: registrar durante el pintado le compite el ancho de banda a
    // la primera pantalla.
    expect(anotado.registrados).toEqual([]);

    window.dispatchEvent(new Event("load"));
    await Promise.resolve();
    expect(anotado.registrados).toEqual(["/sw.js"]);
  });

  it("en desarrollo NO lo registra", async () => {
    const anotado = falsearSW();
    const { registrarSW } = await cargar();

    registrarSW({ produccion: false });
    window.dispatchEvent(new Event("load"));
    await Promise.resolve();

    expect(anotado.registrados).toEqual([]);
  });

  it("en desarrollo da de baja el que ya estuviera instalado", async () => {
    // Es el caso de verdad: no alcanza con dejar de registrarlo, porque quien
    // ya lo tenga lo conserva y le sigue contestando con archivos viejos.
    const anotado = falsearSW({ registros: [1, 2] });
    const { registrarSW } = await cargar();

    registrarSW({ produccion: false });
    await vi.waitFor(() => expect(anotado.desregistrados).toBe(2));
  });

  it("al desregistrar borra sólo los cachés de la app", async () => {
    falsearSW({ registros: [1] });
    const { desregistrar } = await cargar();

    await desregistrar();

    // `otra-cosa` no es nuestro: borrarlo sería pisar el caché de otra app
    // servida desde el mismo origen.
    expect(caches.delete).toHaveBeenCalledWith("rincones-assets-v1");
    expect(caches.delete).not.toHaveBeenCalledWith("otra-cosa");
  });

  it("si el registro falla, no tira", async () => {
    falsearSW({ registrarFalla: true });
    const { registrarSW } = await cargar();

    registrarSW({ produccion: true });
    expect(() => window.dispatchEvent(new Event("load"))).not.toThrow();
  });

  it("sin soporte de service workers no hace nada ni explota", async () => {
    delete navigator.serviceWorker;
    const { registrarSW, desregistrar } = await cargar();

    expect(() => registrarSW({ produccion: true })).not.toThrow();
    await expect(desregistrar()).resolves.toBeUndefined();
  });
});
