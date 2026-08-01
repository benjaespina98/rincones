import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import PromoCard from "../src/components/PromoCard";

/**
 * La tarjeta del espacio destacado.
 *
 * ── POR QUÉ EXISTE ESTE TEST ────────────────────────────────────────────────
 * Una campaña estuvo al aire sin verse. El server la devolvía, React la contaba
 * —el encabezado decía "Destacados · Lo que está pasando", que es el texto de UNA
 * campaña— y debajo no había nada. Sólo pasaba con las publicidades.
 *
 * La tarjeta llevaba la clase `is-sponsored`, que no tenía ni una regla de CSS.
 * EasyList —la lista que traen de fábrica uBlock Origin, AdBlock Plus, AdGuard y
 * el escudo de Brave— incluye la regla genérica `##.is-sponsored`: esconde con
 * display:none cualquier elemento con esa clase, en cualquier sitio del mundo.
 *
 * Un nombre de clase invisible en el código fuente y catastrófico en producción
 * es exactamente lo que no se detecta leyendo el diff, así que queda escrito acá:
 * la tarjeta no se nombra como el ad-tech de terceros.
 */

afterEach(cleanup);

const publicidad = {
  _id: "1",
  kind: "ad",
  title: "Fiesta Nacional de la Vendimia",
  summary: "La celebración más grande de Mendoza",
  image: "https://cdn.example/foto.jpg",
  url: "https://ejemplo.com/",
  sponsored: true,
  sponsor: { name: "", logo: "" },
};

/** Nombres que las listas de bloqueo esconden de arriba abajo. */
const NOMBRES_QUE_SE_BLOQUEAN = [
  "is-sponsored",
  "sponsored",
  "sponsor",
  "ad",
  "ads",
  "adbox",
  "banner",
  "adslot",
  "promo-ad",
];

describe("la tarjeta de una publicidad", () => {
  it("no lleva ninguna clase que los bloqueadores escondan", () => {
    const { container } = render(<PromoCard promo={publicidad} onOpen={() => {}} />);
    const tarjeta = container.querySelector("article");

    const puestas = tarjeta.className.split(/\s+/);
    for (const nombre of NOMBRES_QUE_SE_BLOQUEAN) {
      expect(puestas, `la clase "${nombre}" hace invisible la tarjeta`).not.toContain(nombre);
    }
  });

  it("sigue avisando que es paga, que es lo que no se negocia", () => {
    // Sacar la clase no puede costar la transparencia: el cartel viene de
    // `promo.sponsored`, que es el dato, no de cómo se llame el contenedor.
    render(<PromoCard promo={publicidad} onOpen={() => {}} />);
    expect(screen.getByText("Publicidad")).toBeInTheDocument();
  });

  it("un evento no se anuncia como publicidad", () => {
    render(<PromoCard promo={{ ...publicidad, kind: "event", sponsored: false }} onOpen={() => {}} />);
    expect(screen.queryByText("Publicidad")).not.toBeInTheDocument();
    expect(screen.getByText("Evento")).toBeInTheDocument();
  });

  it("sin enlace no finge ser un botón", () => {
    const { container } = render(<PromoCard promo={{ ...publicidad, url: "" }} onOpen={() => {}} />);
    expect(container.querySelector(".promo__hit")).toBeNull();
  });
});

describe("el enlace de la tarjeta", () => {
  /**
   * Era un <button> que llamaba a `window.open` en su handler, después de contar
   * el clic. Tocabas y no pasaba nada: cualquier error al contar se llevaba puesta
   * la navegación, y `window.open` es justo lo que bloquean navegadores y
   * extensiones en una tarjeta que dice "Publicidad".
   */
  it("es un <a href> de verdad, con la url que se cargó en el panel", () => {
    const { container } = render(<PromoCard promo={publicidad} onOpen={() => {}} />);
    const enlace = container.querySelector(".promo__hit");

    expect(enlace.tagName).toBe("A");
    expect(enlace.getAttribute("href")).toBe("https://ejemplo.com/");
    expect(enlace.getAttribute("target")).toBe("_blank");
    // El sitio del anunciante no puede tocar la pestaña de la app.
    expect(enlace.getAttribute("rel")).toContain("noopener");
  });

  it("cuenta el clic, pero como algo aparte de navegar", () => {
    const clics = [];
    const { container } = render(
      <PromoCard promo={publicidad} onOpen={(p) => clics.push(p._id)} />
    );
    container.querySelector(".promo__hit").click();
    expect(clics).toEqual(["1"]);
  });
});
