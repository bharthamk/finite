import type { EnumerableStoragePort } from "./persistence.js";

export const localDemoModeKey = "finite-plan.local-demo-mode.v1";
export const localDemoInstallationKey = "finite-plan.local-demo-installation.v1";

export const localDemoModeEnabled = (storage: Pick<Storage, "getItem">): boolean => storage.getItem(localDemoModeKey) === "true";

export const setLocalDemoMode = (storage: Pick<Storage, "setItem" | "removeItem">, enabled: boolean): void => {
  if (enabled) storage.setItem(localDemoModeKey, "true");
  else storage.removeItem(localDemoModeKey);
};

export const localDemoStorageScope = (storage: Pick<Storage, "getItem" | "setItem">, createId: () => string = () => crypto.randomUUID()): string => {
  const existing = storage.getItem(localDemoInstallationKey);
  if (existing && /^local_demo_[a-f0-9]{32}$/.test(existing)) return existing;
  const scope = `local_demo_${createId().replaceAll("-", "").toLowerCase()}`;
  storage.setItem(localDemoInstallationKey, scope);
  return scope;
};

export const installLocalDemoWriteGuard = (target: Window, enabled: boolean): (() => void) => {
  if (!enabled) return () => undefined;
  const original = target.fetch.bind(target);
  target.fetch = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : null;
    const method = String(init?.method ?? request?.method ?? "GET").toUpperCase();
    const url = new URL(request?.url ?? String(input), target.location.href);
    const remoteMutation = url.origin === target.location.origin && url.pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(method);
    if (!remoteMutation) return original(input, init);
    return Promise.resolve(new Response(JSON.stringify({
      ok: false,
      code: "LOCAL_DEMO_REMOTE_WRITE_BLOCKED",
      message: "Demo mode keeps changes in this browser. No remote write was attempted.",
      acceptedStateChanged: false,
    }), { status: 409, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }));
  }) as typeof target.fetch;
  return () => { target.fetch = original; };
};

export const localDemoRecordCount = (storage: EnumerableStoragePort, scope: string): number => {
  const prefix = `finite-scope:${scope}:`;
  let count = 0;
  for (let index = 0; index < storage.length; index += 1) if (storage.key(index)?.startsWith(prefix)) count += 1;
  return count;
};
