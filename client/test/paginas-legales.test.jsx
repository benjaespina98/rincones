import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PrivacidadPage from "../src/pages/PrivacidadPage";
import TerminosPage from "../src/pages/TerminosPage";

const textoDe = (Pagina) => {
  const { container } = render(
    <MemoryRouter>
      {createElement(Pagina)}
    </MemoryRouter>
  );
  return container.textContent;
};

describe("páginas legales", () => {
  it.each([
    ["Privacidad", PrivacidadPage],
    ["Términos", TerminosPage],
  ])("%s nombra al responsable y el contacto, y no una persona", (_, Pagina) => {
    const texto = textoDe(Pagina);
    expect(texto).toContain("200ok.dev");
    expect(texto).toContain("rincones.wines@gmail.com");
    expect(texto).not.toMatch(/Benjam[ií]n|Espina/i);
  });
});
