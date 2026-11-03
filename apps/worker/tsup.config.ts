import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  platform: "node",
  target: "node24",
  // Internal packages export TypeScript source, so they are bundled into the app.
  noExternal: [/^@hookrelay\//],
  // Their dependencies (pg, drizzle-orm, bullmq) are bundled too, and the CommonJS ones call require() for
  // Node built-ins, which ESM output does not define. This gives them a real require().
  // Aliased because bundled libraries import createRequire themselves.
  banner: {
    js: 'import { createRequire as __hrCreateRequire } from "node:module"; const require = __hrCreateRequire(import.meta.url);',
  },
  clean: true,
  sourcemap: true,
});
