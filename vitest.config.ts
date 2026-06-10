import oxc from "unplugin-oxc/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    oxc({
      transform: {
        jsx: { importSource: "@opentui/solid" },
      },
    }),
  ],
  test: {
    include: ["src/**/*.test.ts"],
    globals: true,
  },
});
