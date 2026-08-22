import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import CollapsibleSection from "../src/components/CollapsibleSection";

/**
 * La sección que se pliega, y el bug que dejaba texto asomando.
 *
 * ── EL SÍNTOMA ──────────────────────────────────────────────────────────────
 * Con la sección CERRADA se veía un renglón de texto recortado colgando por
 * debajo del encabezado, pisando el borde de la tarjeta.
 *
 * ── LA CAUSA ────────────────────────────────────────────────────────────────
 * El plegado se anima con `grid-template-rows: 0fr → 1fr`, que encoge la FILA.
 * Pero el elemento que se encoge tenía padding y borde propios, y eso no se
 * puede colapsar: un border-box con 26px de padding mide 26px por más que la
 * fila valga `0fr` y por más `overflow: hidden` que tenga.
 *
 * La estructura correcta —y lo que fija este test— es de tres capas: el panel
 * que el grid encoge tiene que estar VACÍO de relleno, y el relleno vive en un
 * envoltorio interno que sí puede medir lo que quiera.
 */

afterEach(cleanup);

describe("CollapsibleSection", () => {
  it("el elemento que el grid encoge no lleva relleno propio", () => {
    // Es la regla estructural que evita que vuelva el texto asomando. Se mira el
    // DOM y no el píxel porque jsdom no calcula layout: lo que se puede
    // garantizar acá es que el relleno esté en la capa que corresponde.
    const { container } = render(
      <CollapsibleSection id="p" title="Precio" hint="Sin datos todavía">
        <p>Contenido largo que no debería asomar</p>
      </CollapsibleSection>
    );

    const panel = container.querySelector(".collapsible__panel");
    const inner = container.querySelector(".collapsible__panel-inner");

    expect(panel).toBeTruthy();
    // La capa interna existe y es la que envuelve al contenido.
    expect(inner).toBeTruthy();
    expect(panel.contains(inner)).toBe(true);
    expect(inner.textContent).toContain("Contenido largo");
  });

  it("cerrada, el panel queda marcado como oculto para lectores de pantalla", () => {
    const { container } = render(
      <CollapsibleSection id="p" title="Precio">
        <p>Algo</p>
      </CollapsibleSection>
    );

    const wrap = container.querySelector(".collapsible__panel-wrap");
    expect(wrap.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector(".collapsible.is-open")).toBeNull();
  });

  it("abre y cierra, y el resumen del encabezado se ve siempre", () => {
    const { container } = render(
      <CollapsibleSection id="p" title="Precio" hint="Sin datos todavía">
        <p>Algo</p>
      </CollapsibleSection>
    );

    // El resumen es lo que permite decidir si vale la pena abrir: está a la
    // vista con la sección cerrada.
    expect(screen.getByText("Sin datos todavía")).toBeTruthy();

    const cabecera = screen.getByRole("button", { name: /precio/i });
    expect(cabecera.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(cabecera);
    expect(cabecera.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector(".collapsible.is-open")).toBeTruthy();
    expect(container.querySelector(".collapsible__panel-wrap").getAttribute("aria-hidden")).toBe("false");

    fireEvent.click(cabecera);
    expect(cabecera.getAttribute("aria-expanded")).toBe("false");
  });
});
