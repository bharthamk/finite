import { handleAcceptedTruthRequest, type D1Database } from "./accepted-truth.js";
import { handleAuthRequest } from "./auth.js";
import { handleArrivalRequest } from "./arrival.js";
import { handleConstructionPacketRequest } from "./construction-packet.js";

interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

interface WorkerEnvironment {
  ASSETS: AssetsBinding;
  DB: D1Database;
}

export const finiteRelease = {
  build: "full-journey-v45",
  script: "/assets/index-1aJ-MMFh.js",
  stylesheet: "/assets/index-DB9QVcV0.css",
} as const;

const assetRequest = (request: Request, pathname: string): Request => new Request(new URL(pathname, request.url), {
  method: "GET",
  headers: { accept: pathname.endsWith(".css") ? "text/css" : "text/javascript" },
});

export const serveFiniteReleaseShell = async (request: Request, assets: AssetsBinding): Promise<Response | null> => {
  const url = new URL(request.url);
  if (request.method !== "GET" || (url.pathname !== "/" && url.pathname !== "/index.html")) return null;
  const current = await assets.fetch(request);
  if (!current.ok || !current.headers.get("content-type")?.includes("text/html")) return current;
  const [script, stylesheet] = await Promise.all([
    assets.fetch(assetRequest(request, finiteRelease.script)),
    assets.fetch(assetRequest(request, finiteRelease.stylesheet)),
  ]);
  if (!script.ok || !stylesheet.ok) return current;

  let html = await current.text();
  html = html.replace(/<meta name="finite-build" content="[^"]*"\s*\/>/, `<meta name="finite-build" content="${finiteRelease.build}" />`);
  if (!html.includes('name="finite-build"')) html = html.replace("<title>", `<meta name="finite-build" content="${finiteRelease.build}" />\n    <title>`);
  html = html
    .replace(/\/assets\/index-[A-Za-z0-9_-]+\.js/g, finiteRelease.script)
    .replace(/\/assets\/index-[A-Za-z0-9_-]+\.css/g, finiteRelease.stylesheet);
  const headers = new Headers(current.headers);
  headers.set("cache-control", "no-store");
  headers.set("x-finite-build", finiteRelease.build);
  headers.delete("content-length");
  headers.delete("etag");
  return new Response(html, { status: current.status, statusText: current.statusText, headers });
};

export default {
  async fetch(request: Request, environment: WorkerEnvironment): Promise<Response> {
    const authResponse = await handleAuthRequest(request, environment.DB);
    if (authResponse) return authResponse;
    const arrivalResponse = await handleArrivalRequest(request, environment.DB);
    if (arrivalResponse) return arrivalResponse;
    const constructionResponse = await handleConstructionPacketRequest(request, environment.DB);
    if (constructionResponse) return constructionResponse;
    const apiResponse = await handleAcceptedTruthRequest(request, environment.DB);
    if (apiResponse) return apiResponse;
    const releaseShell = await serveFiniteReleaseShell(request, environment.ASSETS);
    if (releaseShell) return releaseShell;
    return environment.ASSETS.fetch(request);
  },
};
