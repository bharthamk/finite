interface AuthStatus {
  session: {
    kind: "account" | "demo";
    provider: "chatgpt" | "demo";
    displayName: string;
    email: string | null;
    expiresAt: string | null;
    storageScope: string;
    legacyBrowserCacheEligible: boolean;
  } | null;
  signInPath?: string;
}

export {};

const shareId = location.pathname.startsWith("/share/") ? decodeURIComponent(location.pathname.slice(7)) : null;
const collaborationToken = location.pathname.startsWith("/collaborate/") ? decodeURIComponent(location.pathname.slice(13)) : null;
const startupQuery = new URLSearchParams(location.search);
const localSpotlight = (startupQuery.get("start") === "live-demo" || startupQuery.get("start") === "spotlight-active")
  && startupQuery.get("tour") === "spotlight";
if (shareId && !shareId.includes("/")) {
  const { renderShare } = await import("./share-entry.js");
  await renderShare(shareId);
} else if (localSpotlight) {
  const { startKitchen } = await import("./main.js");
  try {
    await startKitchen({
      kind: "demo",
      provider: "demo",
      displayName: "Finite Spotlight",
      email: null,
      expiresAt: null,
      storageScope: "local-spotlight-bootstrap",
      legacyBrowserCacheEligible: false,
    });
  } catch (error) {
    if (window.finiteWebMCPReadiness) {
      window.finiteWebMCPReadiness.state = "failed";
      window.finiteWebMCPReadiness.detail = error instanceof Error ? error.message : String(error);
    }
    throw error;
  }
} else {
  const response = await fetch("/api/auth/session", { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Finite identity returned HTTP ${response.status}.`);
  const auth = await response.json() as AuthStatus;
  if (collaborationToken && !collaborationToken.includes("/")) {
    const { renderCollaboration } = await import("./collaboration-entry.js");
    await renderCollaboration(collaborationToken, auth.session, auth.signInPath);
  } else if (auth.session) {
    const { startKitchen } = await import("./main.js");
    try { await startKitchen(auth.session); }
    catch (error) {
      if (window.finiteWebMCPReadiness) {
        window.finiteWebMCPReadiness.state = "failed";
        window.finiteWebMCPReadiness.detail = error instanceof Error ? error.message : String(error);
      }
      throw error;
    }
  } else {
    if (window.finiteWebMCPReadiness) window.finiteWebMCPReadiness.state = "signed_out";
    const { renderPublicGate } = await import("./public-gate.js");
    renderPublicGate(auth.signInPath);
  }
}
