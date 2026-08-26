import { ensureAuthenticatedTenant, type D1Database } from "./accepted-truth.js";

type JsonRecord = Record<string, unknown>;

interface ConstructionRow {
  packet_id: string;
  packet_json: string;
  checksum: string;
  base_plan_id: string;
  base_profile_hash: string;
  base_revision: number;
  kind: string;
  source_order_id: string | null;
  source_order_version: number | null;
  source_order_checksum: string | null;
  created_at: string;
  expires_at: string;
  cleared_at: string | null;
  updated_at: string;
}

interface HeadRow {
  profile_hash: string;
  revision: number;
}

interface ArrivalRow {
  order_id: string;
  version: number;
  status: string;
  packet_checksum: string;
}

const jsonHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const response = (status: number, body: JsonRecord): Response => new Response(JSON.stringify(body), { status, headers: jsonHeaders });
const errorResponse = (status: number, code: string, message: string, details: JsonRecord = {}): Response => response(status, { ok: false, code, message, ...details });
const record = (value: unknown): JsonRecord => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const valueRecord = value as JsonRecord;
    return `{${Object.keys(valueRecord).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(valueRecord[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const sha256 = async (value: unknown): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stableSerialize(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const forbiddenAuthorityKey = (value: unknown): string | null => {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = forbiddenAuthorityKey(item);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value as JsonRecord)) {
    if (["confirmationId", "approvalId", "authorityId", "challengeId"].includes(key)) return key;
    const found = forbiddenAuthorityKey(child);
    if (found) return found;
  }
  return null;
};

const sourceArrival = (packet: JsonRecord): JsonRecord | null => {
  const payload = record(packet.payload);
  const source = packet.kind === "intake" ? record(record(payload.facts).sourceArrival) : record(payload.sourceArrival);
  return Object.keys(source).length ? source : null;
};

export const constructionPacketIntegrityIssues = async (packet: unknown): Promise<string[]> => {
  const issues: string[] = [];
  const value = record(packet);
  if (value.packetVersion !== "finite-plan-construction.v1") issues.push("unsupported packet version");
  if (!(value.kind === "intake" || value.kind === "draft")) issues.push("invalid packet kind");
  if (typeof value.packetId !== "string" || !/^construction_[a-f0-9]{16}$/.test(value.packetId)) issues.push("invalid packet id");
  if (typeof value.basePlanId !== "string" || !value.basePlanId || value.basePlanId.length > 200) issues.push("invalid base plan id");
  if (typeof value.baseProfileHash !== "string" || !/^[a-f0-9]{64}$/.test(value.baseProfileHash)) issues.push("invalid base profile hash");
  if (!Number.isInteger(value.baseRevision) || Number(value.baseRevision) < 1) issues.push("invalid base revision");
  if (!record(value.payload) || !Object.keys(record(value.payload)).length) issues.push("invalid packet payload");
  const createdAt = Date.parse(String(value.createdAt ?? ""));
  const expiresAt = Date.parse(String(value.expiresAt ?? ""));
  if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt) || expiresAt - createdAt !== 7 * 24 * 60 * 60 * 1000) issues.push("invalid packet lifetime");
  const checksum = String(value.checksum ?? "");
  const { packetId: _packetId, checksum: _checksum, ...content } = value;
  if (!/^[a-f0-9]{64}$/.test(checksum) || await sha256(content) !== checksum || value.packetId !== `construction_${checksum.slice(0, 16)}`) issues.push("packet checksum mismatch");
  const authorityKey = forbiddenAuthorityKey(value.payload);
  if (authorityKey) issues.push(`human authority field is forbidden: ${authorityKey}`);
  const source = sourceArrival(value);
  if (source && (typeof source.orderId !== "string" || !source.orderId || !Number.isInteger(source.orderVersion) || Number(source.orderVersion) < 1 || typeof source.orderChecksum !== "string" || !/^[a-f0-9]{64}$/.test(source.orderChecksum))) issues.push("invalid source arrival binding");
  return [...new Set(issues)];
};

const parseJson = async (request: Request): Promise<JsonRecord> => {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) throw new Error("JSON_CONTENT_TYPE_REQUIRED");
  const text = await request.text();
  if (text.length > 120_000) throw new Error("JSON_BODY_TOO_LARGE");
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("JSON_OBJECT_REQUIRED");
  return value as JsonRecord;
};

const sameOriginWrite = (request: Request): boolean => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};

const loadRow = async (db: D1Database, scopeId: string): Promise<ConstructionRow | null> => db.prepare("SELECT packet_id, packet_json, checksum, base_plan_id, base_profile_hash, base_revision, kind, source_order_id, source_order_version, source_order_checksum, created_at, expires_at, cleared_at, updated_at FROM construction_packets WHERE scope_id = ?")
  .bind(scopeId).first<ConstructionRow>();

const loadPacket = async (db: D1Database, scopeId: string): Promise<Response> => {
  const row = await loadRow(db, scopeId);
  if (!row) return errorResponse(404, "CONSTRUCTION_PACKET_NOT_FOUND", "No cross-surface construction packet exists.");
  if (row.cleared_at) return errorResponse(410, "CONSTRUCTION_PACKET_CLEARED", "The last cross-surface construction packet was discarded.", { packetId: row.packet_id, clearedAt: row.cleared_at });
  return response(200, { ok: true, code: "CONSTRUCTION_PACKET_CURRENT", packet: JSON.parse(row.packet_json) });
};

const savePacket = async (db: D1Database, scopeId: string, body: JsonRecord): Promise<Response> => {
  const packet = record(body.packet);
  const issues = await constructionPacketIntegrityIssues(packet);
  if (issues.length) return errorResponse(422, "CONSTRUCTION_PACKET_INTEGRITY_FAILED", "Construction packet failed server validation.", { issues });

  const head = await db.prepare("SELECT profile_hash, revision FROM plan_heads WHERE scope_id = ? AND plan_id = ?")
    .bind(scopeId, packet.basePlanId).first<HeadRow>();
  if (!head || head.profile_hash !== packet.baseProfileHash || head.revision !== packet.baseRevision) return errorResponse(409, "CONSTRUCTION_PACKET_BASE_STALE", "Construction work is not bound to current accepted truth.", { currentRevision: head?.revision ?? null, currentProfileHash: head?.profile_hash ?? null });

  const arrival = await db.prepare("SELECT order_id, version, status, packet_checksum FROM arrival_orders WHERE scope_id = ? ORDER BY updated_at DESC LIMIT 1")
    .bind(scopeId).first<ArrivalRow>();
  const source = sourceArrival(packet);
  const amendment = record(record(packet.payload).amendment);
  if (arrival?.status === "interpretation_confirmed" && !source && !Object.keys(amendment).length) return errorResponse(409, "CONSTRUCTION_ARRIVAL_BINDING_REQUIRED", "The active reviewed order requires an exact arrival-bound construction packet.");
  if (source && (!arrival || source.orderId !== arrival.order_id || source.orderVersion !== arrival.version || source.orderChecksum !== arrival.packet_checksum || arrival.status !== "interpretation_confirmed")) return errorResponse(409, "CONSTRUCTION_ARRIVAL_STALE", "Construction work does not match the current reviewed human order.", { currentOrderId: arrival?.order_id ?? null, currentOrderVersion: arrival?.version ?? null, currentOrderChecksum: arrival?.packet_checksum ?? null, currentOrderStatus: arrival?.status ?? null });

  const existing = await loadRow(db, scopeId);
  if (existing?.cleared_at && (existing.packet_id === packet.packetId || Date.parse(String(packet.createdAt)) <= Date.parse(existing.cleared_at))) return errorResponse(409, "CONSTRUCTION_PACKET_TOMBSTONED", "A discarded construction packet cannot be restored by a stale browser surface.", { packetId: existing.packet_id, clearedAt: existing.cleared_at });
  if (existing && existing.packet_id === packet.packetId) return response(200, { ok: true, code: "CONSTRUCTION_PACKET_REPLAY", packet: JSON.parse(existing.packet_json), replay: true });
  if (existing && existing.source_order_version !== null && source && existing.source_order_version > Number(source.orderVersion)) return errorResponse(409, "CONSTRUCTION_PACKET_VERSION_REGRESSION", "A newer arrival-bound construction packet already exists.", { currentPacketId: existing.packet_id, currentOrderVersion: existing.source_order_version });
  if (existing && existing.source_order_version === source?.orderVersion && existing.kind === "draft" && packet.kind === "intake") return errorResponse(409, "CONSTRUCTION_PACKET_PHASE_REGRESSION", "A compiled draft cannot be replaced by an earlier intake phase for the same order version.", { currentPacketId: existing.packet_id });

  const now = new Date().toISOString();
  await db.batch([db.prepare(`
    INSERT INTO construction_packets (scope_id, packet_id, packet_json, checksum, base_plan_id, base_profile_hash, base_revision, kind, source_order_id, source_order_version, source_order_checksum, created_at, expires_at, cleared_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
    ON CONFLICT(scope_id) DO UPDATE SET
      packet_id = excluded.packet_id,
      packet_json = excluded.packet_json,
      checksum = excluded.checksum,
      base_plan_id = excluded.base_plan_id,
      base_profile_hash = excluded.base_profile_hash,
      base_revision = excluded.base_revision,
      kind = excluded.kind,
      source_order_id = excluded.source_order_id,
      source_order_version = excluded.source_order_version,
      source_order_checksum = excluded.source_order_checksum,
      created_at = excluded.created_at,
      expires_at = excluded.expires_at,
      cleared_at = NULL,
      updated_at = excluded.updated_at
  `).bind(scopeId, packet.packetId, JSON.stringify(packet), packet.checksum, packet.basePlanId, packet.baseProfileHash, packet.baseRevision, packet.kind, source?.orderId ?? null, source?.orderVersion ?? null, source?.orderChecksum ?? null, packet.createdAt, packet.expiresAt, now)]);
  return response(existing ? 200 : 201, { ok: true, code: existing ? "CONSTRUCTION_PACKET_REPLACED" : "CONSTRUCTION_PACKET_SAVED", packet, replay: false });
};

const clearPacket = async (db: D1Database, scopeId: string, packetId: string): Promise<Response> => {
  const existing = await loadRow(db, scopeId);
  if (!existing || existing.packet_id !== packetId) return errorResponse(404, "CONSTRUCTION_PACKET_NOT_FOUND", "The exact construction packet was not found.");
  if (existing.cleared_at) return response(200, { ok: true, code: "CONSTRUCTION_PACKET_CLEAR_REPLAY", packetId, clearedAt: existing.cleared_at });
  const clearedAt = new Date().toISOString();
  await db.batch([db.prepare("UPDATE construction_packets SET cleared_at = ?, updated_at = ? WHERE scope_id = ? AND packet_id = ?").bind(clearedAt, clearedAt, scopeId, packetId)]);
  return response(200, { ok: true, code: "CONSTRUCTION_PACKET_CLEARED", packetId, clearedAt });
};

export const handleConstructionPacketRequest = async (request: Request, db: D1Database): Promise<Response | null> => {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/construction-packet")) return null;
  if (request.method !== "GET" && !sameOriginWrite(request)) return errorResponse(403, "CROSS_ORIGIN_WRITE_REFUSED", "Finite writes must be same-origin.");
  try {
    const scopeId = await ensureAuthenticatedTenant(request, db);
    if (request.method === "GET" && url.pathname === "/api/construction-packet") return loadPacket(db, scopeId);
    if (request.method === "PUT" && url.pathname === "/api/construction-packet") return savePacket(db, scopeId, await parseJson(request));
    if (request.method === "DELETE" && url.pathname.startsWith("/api/construction-packet/")) {
      const packetId = decodeURIComponent(url.pathname.slice("/api/construction-packet/".length));
      if (!packetId || packetId.includes("/")) return errorResponse(400, "CONSTRUCTION_PACKET_ID_INVALID", "A single construction packet id is required.");
      return clearPacket(db, scopeId, packetId);
    }
    return errorResponse(405, "METHOD_NOT_ALLOWED", "Unsupported construction-packet operation.");
  } catch (error) {
    const code = error instanceof Error ? error.message : "CONSTRUCTION_PACKET_SERVICE_FAILED";
    if (code === "AUTHENTICATED_USER_REQUIRED") return errorResponse(401, code, "Sign in with ChatGPT or start an isolated demo session.");
    if (["JSON_CONTENT_TYPE_REQUIRED", "JSON_BODY_TOO_LARGE", "JSON_OBJECT_REQUIRED"].includes(code)) return errorResponse(400, code, "Construction-packet request body is invalid.");
    return errorResponse(500, "CONSTRUCTION_PACKET_SERVICE_FAILED", "Construction-packet service failed safely.");
  }
};
