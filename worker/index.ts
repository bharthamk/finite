import { handleAcceptedTruthRequest, type D1Database } from "./accepted-truth.js";

interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

interface WorkerEnvironment {
  ASSETS: AssetsBinding;
  DB: D1Database;
}

export default {
  async fetch(request: Request, environment: WorkerEnvironment): Promise<Response> {
    const apiResponse = await handleAcceptedTruthRequest(request, environment.DB);
    if (apiResponse) return apiResponse;
    return environment.ASSETS.fetch(request);
  },
};
