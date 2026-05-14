import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(() => {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

  return {
    plugins: [react()],
    envDir: projectRoot,
    envPrefix: ["VITE_", "REQUEST_"],
    server: {
      host: "0.0.0.0",
      port: 5174,
    },
  };
});
