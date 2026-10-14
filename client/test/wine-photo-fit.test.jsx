import React from "react";
import { describe, expect, test } from "vitest";
import { fireEvent, render } from "@testing-library/react";

const { default: WinePhoto } = await import("../src/components/WinePhoto.jsx");

/**
 * `fit="auto"` llena el marco (cover) salvo que la imagen sea mucho más angosta
 * que él: ahí cover le comería el pico y la base de la botella y se pasa a
 * contain. Se decide con la proporción REAL de la imagen, que sólo se conoce
 * cuando carga.
 */
const cargar = (contenedor, ancho, alto) => {
  const img = contenedor.querySelector("img");
  Object.defineProperty(img, "naturalWidth", { value: ancho, configurable: true });
  Object.defineProperty(img, "naturalHeight", { value: alto, configurable: true });
  fireEvent.load(img);
};

const marco = (c) => c.querySelector(".wine-photo");

describe("WinePhoto fit=auto", () => {
  test("una foto cuadrada o apaisada llena el marco: cover", () => {
    const { container } = render(<WinePhoto src="/a.jpg" fit="auto" />);
    cargar(container, 1200, 1200);
    expect(marco(container)).toHaveClass("wine-photo--cover");
  });

  test("una foto vertical normal (3:4) también cubre", () => {
    const { container } = render(<WinePhoto src="/a.jpg" fit="auto" />);
    cargar(container, 900, 1200);
    expect(marco(container)).toHaveClass("wine-photo--cover");
  });

  test("una botella de catálogo muy angosta (1:3) se muestra entera: contain", () => {
    const { container } = render(<WinePhoto src="/a.png" fit="auto" />);
    cargar(container, 300, 900);
    expect(marco(container)).toHaveClass("wine-photo--contain");
  });

  test("antes de cargar no inventa una proporción: arranca en cover", () => {
    const { container } = render(<WinePhoto src="/a.jpg" fit="auto" />);
    expect(marco(container)).toHaveClass("wine-photo--cover");
  });

  test("un fit explícito no se toca, sin importar la proporción", () => {
    const { container } = render(<WinePhoto src="/a.png" fit="contain" />);
    cargar(container, 1200, 1200);
    expect(marco(container)).toHaveClass("wine-photo--contain");
  });
});

describe("WinePhoto fit=auto: bordes", () => {
  test("el umbral es exacto: 0,5 cubre y apenas menos se muestra entera", () => {
    const a = render(<WinePhoto src="/a.png" fit="auto" />);
    cargar(a.container, 300, 600);
    expect(marco(a.container)).toHaveClass("wine-photo--cover");

    const b = render(<WinePhoto src="/b.png" fit="auto" />);
    cargar(b.container, 299, 600);
    expect(marco(b.container)).toHaveClass("wine-photo--contain");
  });

  test("dimensiones 0 no producen NaN ni cambian el ajuste, y la foto se muestra", () => {
    const a = render(<WinePhoto src="/a.png" fit="auto" />);
    cargar(a.container, 0, 0);
    expect(marco(a.container)).toHaveClass("wine-photo--cover", "is-loaded");

    const b = render(<WinePhoto src="/b.png" fit="auto" />);
    cargar(b.container, 300, 0);
    expect(marco(b.container)).toHaveClass("wine-photo--cover", "is-loaded");
  });

  test("si la imagen falla no queda imagen ni marca de cargada, y sigue en cover", () => {
    const { container } = render(<WinePhoto src="/rota.png" fit="auto" />);
    fireEvent.error(container.querySelector("img"));
    expect(container.querySelector("img")).toBeNull();
    expect(marco(container)).not.toHaveClass("is-loaded");
    expect(marco(container)).toHaveClass("wine-photo--cover");
  });

  test("sin src no hay imagen y queda en cover", () => {
    const { container } = render(<WinePhoto fit="auto" />);
    expect(container.querySelector("img")).toBeNull();
    expect(marco(container)).toHaveClass("wine-photo--cover");
  });
});

describe("WinePhoto: cambiar de foto con el componente montado", () => {
  test("una botella 1:3 reemplazada por una 4:3 vuelve a cubrir", () => {
    const { container, rerender } = render(<WinePhoto src="/a.png" fit="auto" />);
    cargar(container, 300, 900);
    expect(marco(container)).toHaveClass("wine-photo--contain");

    rerender(<WinePhoto src="/b.jpg" fit="auto" />);
    cargar(container, 1200, 900);
    expect(marco(container)).toHaveClass("wine-photo--cover");
  });

  test("una 4:3 reemplazada por una botella 1:3 pasa a mostrarse entera", () => {
    const { container, rerender } = render(<WinePhoto src="/a.jpg" fit="auto" />);
    cargar(container, 1200, 900);
    expect(marco(container)).toHaveClass("wine-photo--cover");

    rerender(<WinePhoto src="/b.png" fit="auto" />);
    cargar(container, 300, 900);
    expect(marco(container)).toHaveClass("wine-photo--contain");
  });

  test("después de una foto que falló, la nueva sí se muestra", () => {
    const { container, rerender } = render(<WinePhoto src="/rota.png" fit="auto" />);
    fireEvent.error(container.querySelector("img"));
    expect(container.querySelector("img")).toBeNull();

    rerender(<WinePhoto src="/buena.jpg" fit="auto" />);
    expect(container.querySelector("img")).not.toBeNull();
  });
});
