interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

interface WorkerEnvironment {
  ASSETS: AssetsBinding;
}

export default {
  fetch(request: Request, environment: WorkerEnvironment): Promise<Response> {
    return environment.ASSETS.fetch(request);
  },
};
