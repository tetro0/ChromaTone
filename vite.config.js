import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the built site works from a GitHub Pages project path
  // (https://user.github.io/chromatone/) as well as from a domain root.
  base: "./",
  server: {
    port: 5173,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.js"],
  },
});
