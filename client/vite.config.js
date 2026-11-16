import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// El dominio para las URLs absolutas de index.html (Open Graph, canonical).
//
// No se resuelve con el %VITE_SITE_URL% nativo de Vite porque ese mecanismo
// deja el placeholder vacío si la variable no está definida — y hoy no hay
// dominio propio, así que no está definida en ningún .env. Este plugin hace lo
// mismo pero con un default: sin VITE_SITE_URL, el build sale exactamente
// igual que hasta ahora (rincones.vercel.app). El día que haya dominio propio,
// configurar la variable en Vercel alcanza — no hay que tocar este archivo.
const siteUrlPlugin = () => ({
  name: "site-url-html",
  transformIndexHtml(html) {
    const siteUrl = String(process.env.VITE_SITE_URL || "https://rincones.vercel.app").replace(/\/$/, "");
    return html.replaceAll("__SITE_URL__", siteUrl);
  },
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), siteUrlPlugin()],
  build: {
    rollupOptions: {
      output: {
        // Separamos las librerías (React, Router, Axios) en un chunk propio.
        // Cambian poquísimo, así que el navegador lo mantiene cacheado entre
        // deploys aunque cambie el código de la app.
        //
        // Función y no lista: con la lista, `react-dom/client` (que la app importa por esa ruta
        // y no por `react-dom`) quedaba FUERA del chunk y viajaba dentro del entry, que cambia
        // en cada deploy y se vuelve a bajar entero. Acá se agrupa por carpeta de node_modules.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          // Las rutas de Windows traen barras invertidas: se normalizan antes de comparar.
          const ruta = id.split("\\").join("/");
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler|axios)\//.test(ruta)) {
            return "vendor";
          }
          return undefined;
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./test/setup.js",
    exclude: ["**/node_modules/**", "e2e/**"],
  },
});
