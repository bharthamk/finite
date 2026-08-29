import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { sites } from "@openai/sites-vite-plugin";
import { finiteRelease } from "./src/release.js";

const finiteStaticHeaders = `/*
  Content-Security-Policy: default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; form-action 'self'
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-origin
  Origin-Agent-Cluster: ?1
  Permissions-Policy: tools=(self), camera=(), microphone=(), geolocation=()
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  X-Finite-Build: ${finiteRelease.build}

/
  Cache-Control: no-store

/share/*
  Cache-Control: no-store
`;

const finiteReleaseContract = {
  name: "finite-release-contract",
  transformIndexHtml(html: string): string {
    return html.replace('content="initializing"', `content="${finiteRelease.build}"`);
  },
  generateBundle(this: { emitFile(file: { type: "asset"; fileName: string; source: string }): void }): void {
    this.emitFile({ type: "asset", fileName: "_headers", source: finiteStaticHeaders });
  },
};

const finiteClientChunk = (id: string): string | undefined => {
  const source = id.replaceAll("\\", "/").split("?")[0] ?? id;
  if (!source.includes("/src/")) return undefined;
  if (/\/(arrival|arrival-presentation|codex-handoff|experience-route)\.ts$/.test(source)) return "finite-arrival";
  if (/\/(theme|skin|settings|plan-share|plan-input|plan-work|kitchen-reset)\.ts$/.test(source)) return "finite-services";
  if (/\/(webmcp|runtime|kernel|chef-menu|operator-policy|plan-facts|surface|profiles|persistence|types|crypto|accepted-truth|construction-packet)\.ts$/.test(source)) return "finite-operator";
  return undefined;
};

export default defineConfig(({ command }) => ({
  plugins: [
    finiteReleaseContract,
    sites(),
    cloudflare({
      viteEnvironment: { name: "server" },
      config: {
        name: "finite-plan-kitchen",
        compatibility_date: "2026-05-22",
        main: "./worker/index.ts",
        assets: {
          binding: "ASSETS",
          not_found_handling: "single-page-application",
          run_worker_first: true,
        },
        ...(command === "serve" ? {
          d1_databases: [{
            binding: "DB",
            database_name: "finite-local",
            database_id: "11111111-1111-4111-8111-111111111111",
            migrations_dir: "drizzle",
          }],
        } : {}),
      },
    }),
  ],
  build: {
    target: "es2022",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: finiteClientChunk,
      },
    },
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
}));
