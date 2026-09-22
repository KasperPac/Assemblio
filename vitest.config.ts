import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    // .worktrees/ holds full checkouts of in-flight branches. Vitest was
    // scanning them, so every test ran twice and the pass/fail counts
    // reported stale copies of the code as if they were main.
    exclude: [...configDefaults.exclude, "**/.worktrees/**"],
  },
});
