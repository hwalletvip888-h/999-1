import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/services/**/*.test.ts", "src/wallet-backend/**/*.test.ts", "src/trend/**/*.test.ts"],
    passWithNoTests: true,
  },
});
