import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwind from "@tailwindcss/vite";

export default defineConfig({
  root: "web",
  plugins: [svelte(), tailwind()],
  server: {
    proxy: { "/api": "http://localhost:4000" },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
