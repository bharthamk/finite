import type { D1Database } from "./accepted-truth.js";

type JsonRecord = Record<string, unknown>;

export interface FinitePrincipal {
  kind: "account" | "demo";
  provider: "chatgpt" | "demo";
  tenantIdentity: JsonRecord;
  displayName: string;
  email: string | null;
  expiresAt: string | null;
}

interface DemoSessionRow {
  session_hash: string;
  scope_id: string;
  created_at: string;
  expires_at: string;
}

const demoCookieName = "finite_demo";
const demoTtlSeconds = 24 * 60 * 60;
const jsonHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as JsonRecord;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

export const authSha256 = async (value: unknown): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stableSerialize(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const response = (status: number, body: JsonRecord, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...jsonHeaders, ...headers } });

const sameOriginWrite = (request: Request): boolean => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};

const cookieValue = (request: Request, name: string): string | null => {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) return decodeURIComponent(rawValue.join("="));
  }
  return null;
};

const randomToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

const demoCookie = (token: string, maxAge: number): string =>
  `${demoCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

const purgeDemoScope = async (db: D1Database, scopeId: string): Promise<void> => {
  const confirmedDemo = await db.prepare("SELECT scope_id FROM demo_sessions WHERE scope_id = ?").bind(scopeId).first();
  if (!confirmedDemo) return;
  await db.batch([
    db.prepare("DELETE FROM arrival_events WHERE scope_id = ?").bind(scopeId),
    db.prepare("DELETE FROM arrival_orders WHERE scope_id = ?").bind(scopeId),
    db.prepare("DELETE FROM challenge_consumptions WHERE scope_id = ?").bind(scopeId),
    db.prepare("DELETE FROM authority_challenges WHERE scope_id = ?").bind(scopeId),
    db.prepare("DELETE FROM operator_sessions WHERE scope_id = ?").bind(scopeId),
    db.prepare("DELETE FROM operation_log WHERE scope_id = ?").bind(scopeId),
    db.prepare("DELETE FROM evidence_records WHERE scope_id = ?").bind(scopeId),
    db.prepare("DELETE FROM domain_events WHERE scope_id = ?").bind(scopeId),
    db.prepare("DELETE FROM receipts WHERE scope_id = ?").bind(scopeId),
    db.prepare("DELETE FROM activation_receipts WHERE scope_id = ?").bind(scopeId),
    db.prepare("DELETE FROM plan_revisions WHERE scope_id = ?").bind(scopeId),
    db.prepare("DELETE FROM plan_heads WHERE scope_id = ?").bind(scopeId),
    db.prepare("DELETE FROM demo_sessions WHERE scope_id = ?").bind(scopeId),
    db.prepare("DELETE FROM tenant_accounts WHERE scope_id = ?").bind(scopeId),
  ]);
};

const accountPrincipal = (request: Request): FinitePrincipal | null => {
  const siteUserId = request.headers.get("oai-authenticated-user-id")?.trim();
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase() || null;
  if (!siteUserId && !email) return null;
  const encodedName = request.headers.get("oai-authenticated-user-full-name")?.trim();
  const fullName = encodedName && request.headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8"
    ? (() => { try { return decodeURIComponent(encodedName); } catch { return ""; } })()
    : "";
  return {
    kind: "account",
    provider: "chatgpt",
    tenantIdentity: siteUserId ? { siteUserId } : { siteUserEmail: email },
    displayName: fullName || email || "ChatGPT user",
    email,
    expiresAt: null,
  };
};

export const resolveRequestPrincipal = async (request: Request, db: D1Database): Promise<FinitePrincipal | null> => {
  const account = accountPrincipal(request);
  if (account) return account;
  const token = cookieValue(request, demoCookieName);
  if (!token) return null;
  const sessionHash = await authSha256({ demoToken: token });
  const session = await db.prepare("SELECT session_hash, scope_id, created_at, expires_at FROM demo_sessions WHERE session_hash = ?")
    .bind(sessionHash).first<DemoSessionRow>();
  if (!session) return null;
  if (Date.parse(session.expires_at) <= Date.now()) {
    await purgeDemoScope(db, session.scope_id);
    return null;
  }
  return {
    kind: "demo",
    provider: "demo",
    tenantIdentity: { demoSessionHash: session.session_hash },
    displayName: "Demo diner",
    email: null,
    expiresAt: session.expires_at,
  };
};

const publicSession = (principal: FinitePrincipal | null): JsonRecord => principal ? {
  ok: true,
  code: principal.kind === "demo" ? "DEMO_SESSION" : "AUTHENTICATED_SESSION",
  session: {
    kind: principal.kind,
    provider: principal.provider,
    displayName: principal.displayName,
    email: principal.email,
    expiresAt: principal.expiresAt,
  },
} : {
  ok: true,
  code: "SIGNED_OUT",
  session: null,
  signInPath: "/signin-with-chatgpt",
};

const createDemoSession = async (request: Request, db: D1Database): Promise<Response> => {
  const existing = await resolveRequestPrincipal(request, db);
  if (existing) return response(200, publicSession(existing));
  const token = randomToken();
  const sessionHash = await authSha256({ demoToken: token });
  const identityHash = await authSha256({ demoSessionHash: sessionHash });
  const scopeId = `demo_${identityHash.slice(0, 32)}`;
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + demoTtlSeconds * 1000).toISOString();
  await db.batch([
    db.prepare("INSERT INTO tenant_accounts (scope_id, user_id_hash, legacy_scope_adopted, created_at) VALUES (?, ?, 0, ?)")
      .bind(scopeId, identityHash, createdAt),
    db.prepare("INSERT INTO demo_sessions (session_hash, scope_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .bind(sessionHash, scopeId, createdAt, expiresAt),
  ]);
  return response(201, {
    ok: true,
    code: "DEMO_SESSION_CREATED",
    session: { kind: "demo", provider: "demo", displayName: "Demo diner", email: null, expiresAt },
  }, { "set-cookie": demoCookie(token, demoTtlSeconds) });
};

const endDemoSession = async (request: Request, db: D1Database): Promise<Response> => {
  const token = cookieValue(request, demoCookieName);
  if (token) {
    const sessionHash = await authSha256({ demoToken: token });
    const session = await db.prepare("SELECT session_hash, scope_id, created_at, expires_at FROM demo_sessions WHERE session_hash = ?")
      .bind(sessionHash).first<DemoSessionRow>();
    if (session) await purgeDemoScope(db, session.scope_id);
  }
  return response(200, { ok: true, code: "DEMO_SESSION_ENDED", session: null }, { "set-cookie": demoCookie("", 0) });
};

export const handleAuthRequest = async (request: Request, db: D1Database): Promise<Response | null> => {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/auth/")) return null;
  if (request.method !== "GET" && !sameOriginWrite(request)) return response(403, { ok: false, code: "CROSS_ORIGIN_WRITE_REFUSED", message: "Finite writes must be same-origin." });
  try {
    if (request.method === "GET" && url.pathname === "/api/auth/session") return response(200, publicSession(await resolveRequestPrincipal(request, db)));
    if (request.method === "POST" && url.pathname === "/api/auth/demo") return createDemoSession(request, db);
    if (request.method === "POST" && url.pathname === "/api/auth/demo/end") return endDemoSession(request, db);
    return response(405, { ok: false, code: "METHOD_NOT_ALLOWED", message: "Unsupported authentication operation." });
  } catch {
    return response(500, { ok: false, code: "AUTH_SERVICE_FAILED", message: "Authentication service failed safely." });
  }
};
