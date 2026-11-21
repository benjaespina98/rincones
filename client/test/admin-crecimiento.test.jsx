import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within, configure } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Estas páginas pesan: con la suite entera corriendo en paralelo el default (1 s) de findBy*/waitFor
// daba falsos rojos por carga.
configure({ asyncUtilTimeout: 4000 });

const m = vi.hoisted(() => ({
  getAdminGrowth: vi.fn(),
  getChangeLogs: vi.fn(),
  getChangeLogActors: vi.fn(),
  getUsers: vi.fn(),
  getAnalyticsSummary: vi.fn(),
}));

vi.mock("../src/services/adminApi", () => ({
  getAdminGrowth: m.getAdminGrowth,
  getChangeLogs: m.getChangeLogs,
  getChangeLogActors: m.getChangeLogActors,
  getUsers: m.getUsers,
  updateUserRole: vi.fn(),
  deleteUser: vi.fn(),
  bulkDeleteUsers: vi.fn(),
}));
vi.mock("../src/services/analyticsApi", () => ({ getAnalyticsSummary: m.getAnalyticsSummary }));

import AdminAnalyticsPage from "../src/pages/AdminAnalyticsPage";
import AdminActivityPage from "../src/pages/AdminActivityPage";
import AdminUsersPage from "../src/pages/AdminUsersPage";
import { ToastProvider } from "../src/context/ToastContext";

const dias = ["2026-11-19", "2026-11-20", "2026-11-21"];
const growth = (over = {}) => ({
  range: { days: 30, from: "2026-10-23", to: "2026-11-21" },
  accounts: { total: 120, excluded: 9, real: 111 },
  signups: {
    total: 14,
    byMethod: { google: 6, password: 8 },
    daily: dias.map((day, i) => ({ day, total: i, google: i, password: 0 })),
  },
  verified: 9, verifiedPct: 64.3,
  onboarded: 11, onboardedPct: 78.6,
  activation: {
    within24h: { eligible: 12, activated: 5, pct: 41.7 },
    within7d: { eligible: 0, activated: 0, pct: null },
  },
  activeUsers: { asOf: "2026-11-21", dau: 3, wau: 11, mau: 25, stickinessPct: 12 },
  accountDeletions: { total: 4, bySelf: 1, byAdmin: 3, daily: dias.map((day) => ({ day, self: 0, admin: 0 })) },
  wines: { totalAdded: 80, totalBottleOpenedEvents: 31, daily: dias.map((day) => ({ day, added: 2, bottleOpenedEvents: 1 })) },
  ...over,
});

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset());
  m.getAnalyticsSummary.mockResolvedValue({ totals: { views: 0 }, daily: [] });
});

describe("Métricas: crecimiento", () => {
  it("muestra altas, porcentajes y activos; un porcentaje null dice 'Sin datos', no 0 %", async () => {
    m.getAdminGrowth.mockResolvedValue(growth());
    render(<AdminAnalyticsPage />);
    expect(await screen.findByText("64,3 %")).toBeTruthy();
    expect(screen.getByText("78,6 %")).toBeTruthy();
    expect(screen.getByText("41,7 %")).toBeTruthy();
    expect(screen.getByText("Google 6 · Contraseña 8")).toBeTruthy();
    expect(screen.getByText("Ninguna alta cumplió todavía los 7 días.")).toBeTruthy();
    expect(screen.getByText("12 %")).toBeTruthy(); // stickiness
    expect(screen.queryByText("0 %")).toBeNull();
    expect(screen.getByRole("img", { name: /Altas por día: Google 3, Contraseña 0/ })).toBeTruthy();
    // sin bajas: copy de vacío en vez de un gráfico plano
    expect(screen.getByText("No hubo bajas en este período.")).toBeTruthy();
  });

  it("growth null: avisa que no está disponible y reintenta", async () => {
    m.getAdminGrowth.mockResolvedValueOnce(null).mockResolvedValueOnce(growth());
    render(<AdminAnalyticsPage />);
    expect(await screen.findByText(/no está disponible en este momento/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("64,3 %")).toBeTruthy();
    expect(m.getAdminGrowth).toHaveBeenCalledTimes(2);
  });

  it("si el pedido falla, lo dice sin tirar abajo el resto de Métricas", async () => {
    m.getAdminGrowth.mockRejectedValue(new Error("x"));
    render(<AdminAnalyticsPage />);
    expect(await screen.findByText(/No se pudo cargar el crecimiento/)).toBeTruthy();
    expect(screen.getByText(/Cómo se cuenta cada número/)).toBeTruthy();
  });

  it("sin altas: todo el bloque queda en 'Sin datos' con explicación", async () => {
    m.getAdminGrowth.mockResolvedValue(
      growth({
        signups: { total: 0, byMethod: { google: 0, password: 0 }, daily: dias.map((day) => ({ day, total: 0, google: 0, password: 0 })) },
        verified: 0, verifiedPct: null, onboarded: 0, onboardedPct: null,
        activeUsers: { asOf: "2026-11-21", dau: 0, wau: 0, mau: 0, stickinessPct: null },
      })
    );
    render(<AdminAnalyticsPage />);
    expect(await screen.findByText(/No hubo altas en este período: los porcentajes/)).toBeTruthy();
    expect(screen.getAllByText("Sin datos").length).toBeGreaterThanOrEqual(4);
  });
});

describe("Actividad: Quién", () => {
  beforeEach(() => {
    m.getChangeLogs.mockResolvedValue({ data: [], pagination: { page: 1, pages: 1, total: 0 } });
    m.getChangeLogActors.mockResolvedValue({
      emails: ["a@x.com", "u@x.com"],
      details: [{ email: "a@x.com", role: "admin" }, { email: "u@x.com", role: "user" }],
    });
  });

  it("filtra por rol con actorRole y pide los autores de ese rol", async () => {
    render(<MemoryRouter><AdminActivityPage /></MemoryRouter>);
    await waitFor(() => expect(m.getChangeLogs).toHaveBeenCalled());
    expect(screen.getByText("Quién")).toBeTruthy();
    expect(screen.queryByText("Admin", { selector: "span" })).toBeNull();

    const grupo = screen.getByRole("group", { name: /rol de quien actuó/ });
    fireEvent.click(within(grupo).getByRole("button", { name: "Usuarios" }));
    await waitFor(() =>
      expect(m.getChangeLogs).toHaveBeenLastCalledWith(expect.objectContaining({ actorRole: "user" }))
    );
    expect(m.getChangeLogActors).toHaveBeenLastCalledWith({ role: "user" });
  });

  it("la columna se llama Quién y rotula al usuario común", async () => {
    m.getChangeLogs.mockResolvedValue({
      data: [{ _id: "1", action: "update", entityType: "wine", createdAt: new Date().toISOString(), after: { name: "Malbec" }, actor: { email: "u@x.com", role: "user" } }],
      pagination: { page: 1, pages: 1, total: 1 },
    });
    render(<MemoryRouter><AdminActivityPage /></MemoryRouter>);
    expect(await screen.findByText(/· usuario/)).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Quién" })).toBeTruthy();
    expect(screen.getByText("u@x.com", { exact: false })).toBeTruthy();
    expect(screen.getByText(/· usuario/)).toBeTruthy();
  });
});

describe("Usuarios: orden por página", () => {
  it("aclara que el orden por vinos/reseñas es sólo de la página visible", async () => {
    m.getUsers.mockResolvedValue({ data: [], pagination: { page: 1, pages: 3, total: 50 }, admins: 1 });
    render(<ToastProvider><MemoryRouter><AdminUsersPage /></MemoryRouter></ToastProvider>);
    await waitFor(() => expect(m.getUsers).toHaveBeenCalled());
    expect(screen.queryByRole("note")).toBeNull(); // orden por alta: es global
    fireEvent.click(screen.getByRole("button", { name: /Ordenar por/ }));
    fireEvent.click(await screen.findByRole("option", { name: "Más vinos (esta página)" }));
    expect(await screen.findByRole("note")).toBeTruthy();
    expect(screen.getByRole("note").textContent).toMatch(/sólo las cuentas de esta página/);
  });
});
