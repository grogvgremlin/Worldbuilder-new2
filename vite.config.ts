// Build settings. A relative base ("./") so the same build works at any address
// (GitHub Pages serves it under /Worldbuilder-new2/).
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Shown on the Data screen, so the owner can tell which build the phone is running.
const version = (process.env.GITHUB_SHA ?? "dev").slice(0, 7) + " · " + new Date().toISOString().slice(0, 16).replace("T", " ");

export default defineConfig({
  base: "./",
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-180.png", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "Worldbuilder",
        short_name: "Worldbuilder",
        description: "Warhammer armies, rules and worlds, kept on this device.",
        start_url: "./",
        scope: "./",
        display: "standalone",
        background_color: "#f6f3ee",
        theme_color: "#f6f3ee",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: { globPatterns: ["**/*.{js,css,html,png,webmanifest}"], navigateFallback: "index.html" },
    }),
  ],
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
