import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import BottomTabNavigation from "../src/components/BottomTabNavigation";
import { TABS } from "../src/data/navigation";

const auth = vi.hoisted(() => ({ user: { name: "Benja", email: "b@x.com", role: "user" } }));
vi.mock("../src/hooks/useAuth", () => ({ useAuth: () => ({ user: auth.user }) }));

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
    // /privacidad no es una pestaña ni cuelga de ninguna: el indicador no tiene
    // dónde pararse, y poner uno en la posición cero sería marcar Descubrí.
    const { container } = enRuta("/privacidad");
    expect(container.querySelector('[aria-current="page"]')).toBeNull();
    expect(container.querySelector(".bottom-tabs__indicador")).toBeNull();
  });

  it("renderiza las cuatro pestañas y Escanear en el centro, con su nombre", () => {
    enRuta("/");
    for (const tab of TABS) {
      expect(screen.getByLabelText(tab.label)).toBeInTheDocument();
    }
    expect(TABS).toHaveLength(4);
    expect(screen.getByRole("button", { name: /escanear/i })).toBeInTheDocument();
  });

  it("el orden es Descubrí, Sommelier, Escanear, Mi Bodega, Cuenta", () => {
    const { container } = enRuta("/");
    const nombres = [...container.querySelectorAll(".bottom-tabs > button")].map((b) => b.textContent.trim());
    expect(nombres).toEqual(["Descubrí", "Sommelier", "Escanear", "Mi Bodega", expect.stringMatching(/Cuenta$/)]);
  });

  it("Cuenta lleva al perfil y toma el estado de la ficha de valoraciones", () => {
    const { container } = enRuta("/valoraciones");
    expect(container.querySelector('[aria-current="page"]')).toHaveAttribute("aria-label", "Cuenta");
  });

  it("Cuenta muestra el avatar (iniciales o foto) y el punto de admin sólo para administradores", () => {
    const antes = auth.user;
    auth.user = { name: "Benja", email: "b@x.com", role: "user" };
    let r = enRuta("/");
    expect(r.container.querySelector(".tab-avatar")).not.toBeNull();
    expect(r.container.querySelector(".tab-avatar__admin")).toBeNull();
    r.unmount();
    auth.user = { name: "Benja", email: "b@x.com", role: "admin", avatarPhoto: "https://x.com/f.jpg" };
    r = enRuta("/");
    expect(r.container.querySelector(".tab-avatar--photo")).not.toBeNull();
    expect(r.container.querySelector(".tab-avatar__admin")).not.toBeNull();
    auth.user = antes;
  });
});
