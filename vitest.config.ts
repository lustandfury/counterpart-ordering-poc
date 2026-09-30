import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Match tsconfig's "@/*" path so tests can import real modules through the same alias as the app
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
});
