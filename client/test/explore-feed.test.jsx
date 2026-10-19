import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("../src/components/TrackedCard", () => ({
  default: ({ item, showType }) => (
    <div data-testid="item" data-show-type={String(showType)}>
      {item.id}
    </div>
  ),
}));
vi.mock("../src/components/DailyLesson", () => ({ default: () => <div data-testid="leccion" /> }));

const { default: ExploreFeed } = await import("../src/components/ExploreFeed");

afterEach(cleanup);

const grupo = (id, items) => ({ id, label: `Grupo ${id}`, hint: `hint ${id}`, items });
const item = (id, type = "video") => ({ id, type });

describe("ExploreFeed: un grupo a la vez", () => {
  const dos = [grupo("a", [item("1")]), grupo("b", [item("2"), item("3")])];

  it("muestra los chips y la lista del primer grupo", () => {
    render(<ExploreFeed groups={dos} stats={{}} />);
    expect(screen.getByRole("button", { name: "Grupo a" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Grupo b" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getAllByTestId("item").map((n) => n.textContent)).toEqual(["1"]);
  });

  it("tocar otro chip cambia la lista", () => {
    render(<ExploreFeed groups={dos} stats={{}} />);
    fireEvent.click(screen.getByRole("button", { name: "Grupo b" }));
    expect(screen.getByRole("button", { name: "Grupo b" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Grupo a" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getAllByTestId("item").map((n) => n.textContent)).toEqual(["2", "3"]);
  });

  it("con un solo grupo no hay chips pero sí la lista", () => {
    render(<ExploreFeed groups={[grupo("a", [item("1")])]} stats={{}} />);
    expect(screen.queryByRole("group", { name: "Qué explorar" })).toBeNull();
    expect(screen.getAllByTestId("item")).toHaveLength(1);
  });

  it("ignora los grupos vacíos", () => {
    render(<ExploreFeed groups={[grupo("a", []), grupo("b", [item("2")])]} stats={{}} />);
    expect(screen.queryByRole("group", { name: "Qué explorar" })).toBeNull();
    expect(screen.getAllByTestId("item").map((n) => n.textContent)).toEqual(["2"]);
  });

  it("sin grupos no rompe y deja la lección", () => {
    render(<ExploreFeed groups={[]} stats={{}} />);
    expect(screen.getByTestId("leccion")).toBeInTheDocument();
    expect(screen.queryAllByTestId("item")).toHaveLength(0);
  });

  it("si el grupo elegido desaparece, cae al primero", () => {
    const { rerender } = render(<ExploreFeed groups={dos} stats={{}} />);
    fireEvent.click(screen.getByRole("button", { name: "Grupo b" }));
    rerender(<ExploreFeed groups={[grupo("a", [item("1")]), grupo("c", [item("9")])]} stats={{}} />);
    expect(screen.getAllByTestId("item").map((n) => n.textContent)).toEqual(["1"]);
  });

  it("el rótulo de tipo por fila sólo aparece en un grupo mixto", () => {
    const { rerender } = render(<ExploreFeed groups={[grupo("a", [item("1", "video"), item("2", "event")])]} stats={{}} />);
    expect(screen.getAllByTestId("item")[0]).toHaveAttribute("data-show-type", "true");
    rerender(<ExploreFeed groups={[grupo("a", [item("1", "video"), item("2", "video")])]} stats={{}} />);
    expect(screen.getAllByTestId("item")[0]).toHaveAttribute("data-show-type", "false");
  });
});
