import { test, expect } from "@playwright/test";
import { API, con, crearUsuario } from "./helpers";

// Regresión del bug reportado: un vino tomado, con una unidad agregada y otra
// descontada, no puede perder la instancia tomada.
test("tomar, reponer y descontar conserva el vino tomado y sus lotes", async ({ request }) => {
  const u = await crearUsuario(request, "inv");
  const creado = await request.post(`${API}/wines`, {
    ...con(u.token),
    data: { name: "E2E Malbec", winery: "E2E Bodega", varietal: "Malbec", quantity: 1 },
  });
  expect(creado.status()).toBe(201);
  const id = (await creado.json()).data._id;

  const abrir = await request.patch(`${API}/wines/${id}/stock`, {
    ...con(u.token),
    data: { delta: -1, markTasted: true },
  });
  expect((await abrir.json()).data.tasted).toBe(true);

  await request.patch(`${API}/wines/${id}/stock`, { ...con(u.token), data: { delta: 1 } });
  const final = (
    await (await request.patch(`${API}/wines/${id}/stock`, { ...con(u.token), data: { delta: -1 } })).json()
  ).data;

  expect(final.tasted).toBe(true);
  expect(final.quantity).toBe(0);
  expect(final.lots).toHaveLength(2);

  const lista = (await (await request.get(`${API}/wines`, con(u.token))).json()).data;
  expect(lista.filter((w) => w.name === "E2E Malbec")).toHaveLength(1);
});

test("descuentos simultáneos no pierden ni inventan botellas", async ({ request }) => {
  const u = await crearUsuario(request, "conc");
  const id = (
    await (
      await request.post(`${API}/wines`, {
        ...con(u.token),
        data: { name: "E2E Concurrente", winery: "E2E", varietal: "Malbec", quantity: 10 },
      })
    ).json()
  ).data._id;

  await Promise.all(
    Array.from({ length: 5 }, () =>
      request.patch(`${API}/wines/${id}/stock`, { ...con(u.token), data: { delta: -1 } })
    )
  );
  const w = (await (await request.get(`${API}/wines/${id}`, con(u.token))).json()).data;
  expect(w.quantity).toBe(5);
  expect(w.lots.reduce((n, l) => n + l.remaining, 0)).toBe(5);
});
