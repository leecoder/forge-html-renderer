import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "config-build",
    emptyOutDir: true,
    rollupOptions: {
      input: "config.html",
    },
  },
});
