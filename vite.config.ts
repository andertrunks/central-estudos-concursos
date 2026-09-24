import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  base: "/central-estudos-concursos/",
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icon-192.png", "icon-512.png"],
      manifest: {
        id: "./",
        name: "Central de Estudos — Concursos Contínuos",
        short_name: "Central de Estudos",
        description: "Biblioteca permanente de estudos para concursos",
        lang: "pt-BR",
        start_url: "./",
        scope: "./",
        display: "standalone",
        background_color: "#f5f6f2",
        theme_color: "#123d3a",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,json,webp,jpg}"],
        cleanupOutdatedCaches: true,
        navigateFallback: "index.html",
      },
    }),
  ],
});
