import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ContentCard from "../src/components/ContentCard";
import { fromPromotion } from "../src/data/contentTypes";

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
 *
 * ── POR QUÉ CAMBIÓ DE COMPONENTE ────────────────────────────────────────────
 * `PromoCard` desapareció con el rediseño de Descubrí: las cinco formas de
 * dibujar "algo con título, bajada, ícono y enlace" se unificaron en
 * `ContentCard`. El test quedó apuntando a un archivo inexistente y la suite
 * entera no compilaba.
 *
 * Se porta y no se borra a propósito. Las dos lecciones que encierra —cómo se
 * llaman las clases y que el enlace sea un enlace— no eran del componente viejo
 * sino del PROBLEMA, y el problema sobrevive a cualquier rediseño: lo pago se
 * sigue mostrando, los bloqueadores siguen existiendo y `window.open` sigue sin
 * ser una forma de navegar. Borrarlo habría tirado justo la parte que costó
 * aprender.
 */

afterEach(cleanup);

const promo = {
  _id: "1",
  type: "event",
  title: "Fiesta Nacional de la Vendimia",
  summary: "La celebración más grande de Mendoza",
  image: "https://cdn.example/foto.jpg",
  url: "https://ejemplo.com/",
  sponsored: true,
  sponsor: { name: "", logo: "" },
};

const publicidad = fromPromotion(promo);

const dibujar = (item, props = {}) =>
  render(
    <MemoryRouter>
      <ContentCard item={item} onOpen={() => {}} {...props} />
    </MemoryRouter>
  );

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
    const { container } = dibujar(publicidad);
    const tarjeta = container.querySelector("article");

    const puestas = tarjeta.className.split(/\s+/);
    for (const nombre of NOMBRES_QUE_SE_BLOQUEAN) {
      expect(puestas, `la clase "${nombre}" hace invisible la tarjeta`).not.toContain(nombre);
    }
  });

  it("tampoco las lleva ninguno de sus nodos internos", () => {
    // La regla de EasyList es genérica: esconde CUALQUIER elemento con esa
    // clase, no sólo el contenedor. Un `__adtag` adentro escondería el cartel de
    // "Publicidad" y dejaría la campaña al aire sin declararse — que es peor que
    // el bug original.
    const { container } = dibujar(publicidad);

    for (const nodo of container.querySelectorAll("*")) {
      const clases = String(nodo.className?.baseVal ?? nodo.className ?? "").split(/\s+/);
      for (const nombre of NOMBRES_QUE_SE_BLOQUEAN) {
        expect(clases, `la clase "${nombre}" esconde parte de la tarjeta`).not.toContain(nombre);
      }
    }
  });

  it("sigue avisando que es paga, que es lo que no se negocia", () => {
    // El cartel viene de `sponsored`, que es el dato, no de cómo se llame el
    // contenedor. Y lo pone la tarjeta, no la sección: una sección que se olvide
    // no puede existir.
    dibujar(publicidad);
    expect(screen.getByText("Publicidad")).toBeInTheDocument();
  });

  it("se declara paga incluso donde no se muestra el tipo", () => {
    // `showType={false}` es lo que usan los grupos homogéneos del feed. El
    // rótulo del tipo se puede callar; el de "Publicidad", nunca.
    dibujar(publicidad, { showType: false });
    expect(screen.getByText("Publicidad")).toBeInTheDocument();
  });

  it("un evento no se anuncia como publicidad", () => {
    dibujar(fromPromotion({ ...promo, sponsored: false }));
    expect(screen.queryByText("Publicidad")).not.toBeInTheDocument();
    expect(screen.getByText("Evento")).toBeInTheDocument();
  });

  it("sin enlace no finge ser un botón", () => {
    const { container } = dibujar(fromPromotion({ ...promo, url: "" }));
    expect(container.querySelector(".ccard__hit")).toBeNull();
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
    const { container } = dibujar(publicidad);
    const enlace = container.querySelector(".ccard__hit");

    expect(enlace.tagName).toBe("A");
    expect(enlace.getAttribute("href")).toBe("https://ejemplo.com/");
    expect(enlace.getAttribute("target")).toBe("_blank");
    // El sitio del anunciante no puede tocar la pestaña de la app.
    expect(enlace.getAttribute("rel")).toContain("noopener");
  });

  it("cuenta el clic, pero como algo aparte de navegar", () => {
    const clics = [];
    const { container } = render(
      <MemoryRouter>
        <ContentCard item={publicidad} onOpen={(p) => clics.push(p.id)} />
      </MemoryRouter>
    );
    container.querySelector(".ccard__hit").click();
    expect(clics).toEqual(["1"]);
  });

  it("un destino interno navega por router, sin recargar la app", () => {
    // Una url que empieza con "/" es una pantalla de Rincones. Mandarla por
    // <a href> funcionaría, pero recargaría la SPA entera para ir a la pantalla
    // de al lado.
    const { container } = dibujar(fromPromotion({ ...promo, url: "/descubrir" }));
    const enlace = container.querySelector(".ccard__hit");

    expect(enlace.tagName).toBe("A");
    expect(enlace.getAttribute("href")).toBe("/descubrir");
    expect(enlace.getAttribute("target")).toBeNull();
  });

  it("es alcanzable con teclado y se anuncia con lo que dice la tarjeta", () => {
    const { container } = dibujar(publicidad);
    const enlace = container.querySelector(".ccard__hit");

    expect(enlace.getAttribute("tabindex")).toBe("0");
    expect(enlace.getAttribute("aria-label")).toContain("Fiesta Nacional de la Vendimia");
  });
});
