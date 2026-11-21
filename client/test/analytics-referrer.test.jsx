import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const post = vi.fn(() => Promise.resolve({}));
vi.mock("../src/services/api", () => ({ default: { post: (...a) => post(...a), defaults: { baseURL: "/api" } } }));

const poner = (valor) =>
  Object.defineProperty(document, "referrer", { value: valor, configurable: true });

describe("analytics: de dónde llegó la persona", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    post.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    poner("");
  });

  it("manda el referrer externo una sola vez, sólo como origen", async () => {
    const api = await import("../src/services/analyticsApi");
    api._reiniciarReferrer();
    poner("https://www.instagram.com/p/abc?x=1");
    api.trackPageview("/");
    api.trackPageview("/bodega");
    vi.advanceTimersByTime(4100);

    const eventos = post.mock.calls[0][1].events;
    expect(eventos[0].referrer).toBe("https://www.instagram.com");
    expect(eventos[1].referrer).toBeUndefined();
  });

  it("no manda referrer si viene de la propia app", async () => {
    const api = await import("../src/services/analyticsApi");
    api._reiniciarReferrer();
    poner(`${window.location.origin}/login`);
    expect(api.referrerExterno()).toBe("");
    api.trackPageview("/");
    vi.advanceTimersByTime(4100);
    expect(post.mock.calls[0][1].events[0].referrer).toBeUndefined();
  });

  it("PageviewTracker no mide /admin pero sí el resto", async () => {
    const api = await import("../src/services/analyticsApi");
    api._reiniciarReferrer();
    const { default: PageviewTracker } = await import("../src/components/PageviewTracker");
    render(
      <MemoryRouter initialEntries={["/admin/users"]}>
        <PageviewTracker />
      </MemoryRouter>
    );
    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <PageviewTracker />
      </MemoryRouter>
    );
    render(
      <MemoryRouter initialEntries={["/bodega"]}>
        <PageviewTracker />
      </MemoryRouter>
    );
    vi.advanceTimersByTime(4100);
    const eventos = post.mock.calls.flatMap((c) => c[1].events);
    expect(eventos.map((e) => e.path)).toEqual(["/bodega"]);
  });
});
