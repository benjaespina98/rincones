import { defineConfig, devices } from "@playwright/test";

// E2E contra la base `test`, nunca contra producción: el server se levanta acá
// con PORT explícito (el harness exporta PORT=5173 y chocaría con Vite) y el
// client apunta a ese server por VITE_API_URL. Los usuarios que crean los tests
// son descartables (e2e_*@example.test) y se limpian con `npm run e2e:limpiar`.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:5173", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /ui\.spec\.js/ },
  ],
  webServer: [
    {
      command: "npm run dev -w server",
      cwd: "..",
      env: { PORT: "4000" },
      url: "http://localhost:4000/api/health",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "npm run dev -w client -- --port 5173 --strictPort",
      cwd: "..",
      env: { VITE_API_URL: "http://localhost:4000/api" },
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
