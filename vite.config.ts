import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  root: "web",
  plugins: [svelte()],
  server: {
    proxy: { "/api": "http://localhost:4000" },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
