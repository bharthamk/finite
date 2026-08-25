import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { sites } from "@openai/sites-vite-plugin";

export default defineConfig({
  plugins: [
    sites(),
    cloudflare({
      viteEnvironment: { name: "server" },
      config: {
        name: "finite-plan-kitchen",
        compatibility_date: "2026-08-26",
        main: "./worker/index.ts",
        assets: {
          binding: "ASSETS",
          not_found_handling: "single-page-application",
          run_worker_first: true,
        },
      },
    }),
  ],
  build: {
    target: "es2022",
    sourcemap: true,
  },
  server: {
    host: "127.0.0.1",
    port: 4188,
    headers: {
      "Origin-Agent-Cluster": "?1",
      "Permissions-Policy": "tools=(self)",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4188,
    headers: {
      "Origin-Agent-Cluster": "?1",
      "Permissions-Policy": "tools=(self)",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
