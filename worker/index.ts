import { handleAcceptedTruthRequest, type D1Database } from "./accepted-truth.js";
import { handleAuthRequest } from "./auth.js";

interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

interface WorkerEnvironment {
  ASSETS: AssetsBinding;
  DB: D1Database;
}

export default {
  async fetch(request: Request, environment: WorkerEnvironment): Promise<Response> {
    const authResponse = await handleAuthRequest(request, environment.DB);
    if (authResponse) return authResponse;
    const apiResponse = await handleAcceptedTruthRequest(request, environment.DB);
    if (apiResponse) return apiResponse;
    return environment.ASSETS.fetch(request);
  },
};
