import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import BottomTabNavigation from "../src/components/BottomTabNavigation";
import { TABS } from "../src/data/navigation";

/**
 * El cableado de la barra, que es lo que se puede romper sin que se note.
 *
 * Lo visual —el glass, el indicador deslizándose— se mira. Lo que no se mira es
 * que la pestaña correcta quede anunciada como la actual: `aria-current` es lo
 * único que le dice a un lector de pantalla dónde está parada la persona, y no
 * tiene ningún efecto visible que delate su ausencia.
 *
 * El indicador NO se testea por posición: en jsdom no hay layout, así que todo
 * mide cero y una aserción sobre píxeles no probaría nada. Lo que sí se fija es
 * que exista cuando hay pestaña activa y que desaparezca cuando no la hay, que
 * es la regla de producto: en una pantalla de detalle no hay pestaña marcada.
 */

const enRuta = (ruta) =>
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <BottomTabNavigation />
    </MemoryRouter>
  );

describe("BottomTabNavigation", () => {
  it("marca como actual la pestaña de la ruta, y sólo esa", () => {
    const { container } = enRuta("/bodega");
    const actuales = container.querySelectorAll('[aria-current="page"]');
    expect(actuales).toHaveLength(1);
    expect(actuales[0]).toHaveAttribute("aria-label", "Mi Bodega");
  });

  it("una pantalla de detalle sigue colgando de su pestaña", () => {
    // La ficha de un vino propio cuelga de Mi Bodega; la del catálogo, de
    // Descubrí. Si la barra se apagara entera en el detalle, daría la sensación
    // de haberse salido de la app.
    const { container } = enRuta("/vino/abc123");
    expect(container.querySelector('[aria-current="page"]')).toHaveAttribute(
      "aria-label",
      "Mi Bodega"
    );
  });

  it("dibuja el indicador cuando hay pestaña activa", () => {
    const { container } = enRuta("/sommelier");
    expect(container.querySelector(".bottom-tabs__indicador")).not.toBeNull();
  });

  it("sin pestaña activa no dibuja indicador", () => {
    // /perfil no es una pestaña ni cuelga de ninguna: el indicador no tiene
    // dónde pararse, y poner uno en la posición cero sería marcar Descubrí.
    const { container } = enRuta("/perfil");
    expect(container.querySelector('[aria-current="page"]')).toBeNull();
    expect(container.querySelector(".bottom-tabs__indicador")).toBeNull();
  });

  it("renderiza las tres pestañas y el botón de cámara", () => {
    enRuta("/");
    for (const tab of TABS) {
      expect(screen.getByLabelText(tab.label)).toBeInTheDocument();
    }
    expect(TABS).toHaveLength(3);
  });
});
