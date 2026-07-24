import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
  },
});
