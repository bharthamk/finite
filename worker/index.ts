import { handleAcceptedTruthRequest, type D1Database } from "./accepted-truth.js";
import { handleAuthRequest } from "./auth.js";
import { handleArrivalRequest } from "./arrival.js";
import { handleConstructionPacketRequest } from "./construction-packet.js";
import { finiteRelease } from "../src/release.js";

interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

interface WorkerEnvironment {
  ASSETS: AssetsBinding;
  DB: D1Database;
}

export { finiteRelease };

export const serveFiniteReleaseShell = async (request: Request, assets: AssetsBinding): Promise<Response | null> => {
  const url = new URL(request.url);
  if (request.method !== "GET" || (url.pathname !== "/" && url.pathname !== "/index.html")) return null;
  const current = await assets.fetch(request);
  if (!current.ok || !current.headers.get("content-type")?.includes("text/html")) return current;
  let html = await current.text();
  html = html.replace(/<meta name="finite-build" content="[^"]*"\s*\/>/, `<meta name="finite-build" content="${finiteRelease.build}" />`);
  if (!html.includes('name="finite-build"')) html = html.replace("<title>", `<meta name="finite-build" content="${finiteRelease.build}" />\n    <title>`);
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
