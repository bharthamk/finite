import { handleAcceptedTruthRequest, type D1Database } from "./accepted-truth.js";
import { handleAuthRequest } from "./auth.js";
import { handleArrivalRequest } from "./arrival.js";
import { handleConstructionPacketRequest } from "./construction-packet.js";
import { handleThemeRequest } from "./themes.js";
import { handleSkinRequest } from "./skins.js";
import { handlePlanShareRequest } from "./plan-shares.js";
import { handlePlanCollaborationRequest } from "./plan-collaboration.js";
import { handleSettingsRequest } from "./settings.js";
import { handlePlanInputRequest } from "./plan-inputs.js";
import { handlePlanWorkRequest } from "./plan-work.js";
import { handlePlanLearningRequest } from "./plan-learning.js";
import type { FiniteFilesBucket } from "./files.js";
import { finiteRelease } from "../src/release.js";

interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

interface WorkerEnvironment {
  ASSETS: AssetsBinding;
  DB: D1Database;
  FILES?: FiniteFilesBucket;
}

export { finiteRelease };

export const withSecurityHeaders = (source: Response): Response => {
  const headers = new Headers(source.headers);
  headers.set("x-finite-build", finiteRelease.build);
  headers.set("content-security-policy", "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; form-action 'self'");
  headers.set("cross-origin-opener-policy", "same-origin");
  headers.set("cross-origin-resource-policy", "same-origin");
  headers.set("origin-agent-cluster", "?1");
  headers.set("permissions-policy", "tools=(self), camera=(), microphone=(), geolocation=()");
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-content-type-options", "nosniff");
  return new Response(source.body, { status: source.status, statusText: source.statusText, headers });
};

export const serveFiniteReleaseShell = async (request: Request, assets: AssetsBinding): Promise<Response | null> => {
  const url = new URL(request.url);
  const isSharePage = url.pathname.startsWith("/share/");
  const isCollaborationPage = url.pathname.startsWith("/collaborate/");
  if (request.method !== "GET" || (url.pathname !== "/" && url.pathname !== "/index.html" && !isSharePage && !isCollaborationPage)) return null;
  // Hosted static routing can bypass the Worker when /index.html exists.
  // The production build relocates that file so document requests reach us.
  // Use the asset's canonical URL: hosted assets redirect *.html to extensionless
  // URLs, and forwarding that redirect would lose the original demo query.
  let current = await assets.fetch(new Request(new URL("/finite-shell", request.url), request));
  // Vite serves the ordinary index during development, before relocation.
  if (current.status === 404) current = await assets.fetch(new Request(new URL("/", request.url), request));
  if (!current.ok || !current.headers.get("content-type")?.includes("text/html")) return current;
  let html = await current.text();
  html = html.replace(/<meta name="finite-build" content="[^"]*"\s*\/>/, `<meta name="finite-build" content="${finiteRelease.build}" />`);
  if (!html.includes('name="finite-build"')) html = html.replace("<title>", `<meta name="finite-build" content="${finiteRelease.build}" />\n    <title>`);
  if (isSharePage) {
    html = html
      .replace(/<title>[^<]*<\/title>/, "<title>Shared plan — Finite</title>")
      .replace(/<meta name="description" content="[^"]*"\s*\/?>/, '<meta name="description" content="A deliberately selected, read-only view of a Finite plan." />')
      .replace(/<meta property="og:title" content="[^"]*"\s*\/?>/, '<meta property="og:title" content="Shared plan — Finite" />')
      .replace(/<meta property="og:description" content="[^"]*"\s*\/?>/, '<meta property="og:description" content="A deliberately selected, read-only view of a Finite plan." />')
      .replace(/<meta property="og:url" content="[^"]*"\s*\/?>/, `<meta property="og:url" content="${url.origin}${url.pathname}" />`)
      .replace(/\s*<meta property="og:image(?:[^\"]*)" content="[^"]*"\s*\/?>/g, "")
      .replace(/<meta name="twitter:card" content="[^"]*"\s*\/?>/, '<meta name="twitter:card" content="summary" />')
      .replace(/<meta name="twitter:title" content="[^"]*"\s*\/?>/, '<meta name="twitter:title" content="Shared plan — Finite" />')
      .replace(/<meta name="twitter:description" content="[^"]*"\s*\/?>/, '<meta name="twitter:description" content="A deliberately selected, read-only view of a Finite plan." />')
      .replace(/\s*<meta name="twitter:image" content="[^"]*"\s*\/?>/g, "");
  }
  if (isCollaborationPage) {
    html = html
      .replace(/<title>[^<]*<\/title>/, "<title>Plan invitation — Finite</title>")
      .replace(/<meta name="description" content="[^"]*"\s*\/?>/, '<meta name="description" content="An authenticated invitation to collaborate on a Finite plan." />');
  }
  const headers = new Headers(current.headers);
  headers.set("cache-control", "no-store");
  headers.set("x-finite-build", finiteRelease.build);
  headers.delete("content-length");
  headers.delete("etag");
  return new Response(html, { status: current.status, statusText: current.statusText, headers });
};

export default {
  async fetch(request: Request, environment: WorkerEnvironment): Promise<Response> {
    const authResponse = await handleAuthRequest(request, environment.DB, environment.FILES);
    if (authResponse) return withSecurityHeaders(authResponse);
    const settingsResponse = await handleSettingsRequest(request, environment.DB);
    if (settingsResponse) return withSecurityHeaders(settingsResponse);
    const planInputResponse = await handlePlanInputRequest(request, environment.DB);
    if (planInputResponse) return withSecurityHeaders(planInputResponse);
    const planWorkResponse = await handlePlanWorkRequest(request, environment.DB, environment.FILES);
    if (planWorkResponse) return withSecurityHeaders(planWorkResponse);
    const planLearningResponse = await handlePlanLearningRequest(request, environment.DB);
    if (planLearningResponse) return withSecurityHeaders(planLearningResponse);
    const themeResponse = await handleThemeRequest(request, environment.DB);
    if (themeResponse) return withSecurityHeaders(themeResponse);
    const skinResponse = await handleSkinRequest(request, environment.DB);
    if (skinResponse) return withSecurityHeaders(skinResponse);
    const shareResponse = await handlePlanShareRequest(request, environment.DB);
    if (shareResponse) return withSecurityHeaders(shareResponse);
    const collaborationResponse = await handlePlanCollaborationRequest(request, environment.DB);
    if (collaborationResponse) return withSecurityHeaders(collaborationResponse);
    const arrivalResponse = await handleArrivalRequest(request, environment.DB);
    if (arrivalResponse) return withSecurityHeaders(arrivalResponse);
    const constructionResponse = await handleConstructionPacketRequest(request, environment.DB);
    if (constructionResponse) return withSecurityHeaders(constructionResponse);
    const apiResponse = await handleAcceptedTruthRequest(request, environment.DB);
    if (apiResponse) return withSecurityHeaders(apiResponse);
    const releaseShell = await serveFiniteReleaseShell(request, environment.ASSETS);
    if (releaseShell) return withSecurityHeaders(releaseShell);
    return withSecurityHeaders(await environment.ASSETS.fetch(request));
  },
};
