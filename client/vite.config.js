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
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom", "axios"],
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
