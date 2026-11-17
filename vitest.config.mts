import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "tests/unit/**/*.test.ts"],
    // RLS integration tests hit a real database; run them with `pnpm test:rls`.
    exclude: ["tests/integration/**", "node_modules/**"],
  },
});
