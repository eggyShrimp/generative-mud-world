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
    // Pure function tests (.test.ts) run in Node.js.
    // Rendering tests (.test.tsx) require Bun runtime (bun-ffi-structs / node:ffi)
    // and are excluded here. Run them with:
    //   bun test src/__tests__/*.test.tsx
    // or:
    //   bunx vitest run --config vitest.bun.config.ts
    include: ["src/**/*.test.ts"],
    globals: true,
  },
});
