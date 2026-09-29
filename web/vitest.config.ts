import { defineConfig } from "vitest/config";

// Unit tests for pure logic: the web app's own, and the backend functions'
// shared modules, which carry no runtime-specific imports.
export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts", "../supabase/tests/**/*.test.ts"],
  },
  server: { fs: { allow: [".."] } },
});
