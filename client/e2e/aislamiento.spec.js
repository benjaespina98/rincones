import { test, expect } from "@playwright/test";
import { API, con, crearUsuario } from "./helpers";

test("un usuario no puede leer, tocar ni borrar los datos de otro", async ({ request }) => {
  const a = await crearUsuario(request, "a");
  const b = await crearUsuario(request, "b");
  const wid = (
    await (
      await request.post(`${API}/wines`, {
        ...con(a.token),
        data: { name: "E2E Privado", winery: "E2E", varietal: "Malbec", quantity: 2 },
      })
    ).json()
  ).data._id;
  await request.post(`${API}/wines/${wid}/moments`, { ...con(a.token), data: { note: "nota privada de A" } });

  const intentos = [
    ["get", `/wines/${wid}`],
    ["put", `/wines/${wid}`, { name: "hackeado" }],
    ["patch", `/wines/${wid}/stock`, { delta: -1 }],
    ["get", `/wines/${wid}/moments`],
    ["post", `/wines/${wid}/moments`, { note: "x" }],
    ["delete", `/wines/${wid}`],
  ];
  for (const [metodo, ruta, data] of intentos) {
    const r = await request[metodo](`${API}${ruta}`, { ...con(b.token), data });
    expect(r.status(), `${metodo} ${ruta}`).toBe(404);
  }

  const lista = JSON.stringify(await (await request.get(`${API}/wines`, con(b.token))).json());
  expect(lista).not.toContain("E2E Privado");
  const exportado = JSON.stringify(await (await request.get(`${API}/users/me/export`, con(b.token))).json());
  expect(exportado).not.toContain("nota privada de A");
  expect((await request.get(`${API}/users/${a.id}/wine-stats`, con(b.token))).status()).toBe(403);
  expect((await request.get(`${API}/admin/users`, con(b.token))).status()).toBe(403);
  expect((await request.get(`${API}/wines`)).status()).toBe(401);

  const intacto = JSON.stringify(await (await request.get(`${API}/wines/${wid}`, con(a.token))).json());
  expect(intacto).toContain("E2E Privado");
  expect(intacto).not.toContain("hackeado");
});
