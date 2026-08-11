import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: "jsdom",
    // e2e/ holds Playwright specs, a different test runner -- vitest's
    // default include pattern would otherwise try (and fail) to run them.
    exclude: ["**/node_modules/**", "e2e/**"],
  },
});
