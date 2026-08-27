export type SkinKind = "built_in" | "custom";
export type SkinSourceSurface = "site" | "codex";

export const skinTraitKeys = [
  "typeStyle", "headingScale", "density", "cornerStyle", "borderStyle",
  "shadowStyle", "controlStyle", "panelStyle", "motionStyle",
] as const;

export type SkinTraitKey = typeof skinTraitKeys[number];
export type SkinRecipe = {
  typeStyle: "grotesk" | "editorial" | "system" | "humanist";
  headingScale: "restrained" | "balanced" | "expressive";
  density: "compact" | "comfortable" | "airy";
  cornerStyle: "square" | "subtle" | "rounded" | "pill";
  borderStyle: "none" | "hairline" | "strong";
  shadowStyle: "none" | "soft" | "offset";
  controlStyle: "plain" | "solid" | "pill";
  panelStyle: "flat" | "outlined" | "layered";
  motionStyle: "none" | "restrained" | "expressive";
};

export interface SkinDefinition {
  skinId: string;
  name: string;
  description: string;
  kind: SkinKind;
  recipe: SkinRecipe;
  contentHash?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SkinDraft {
  skinId: string;
  name: string;
  description: string;
  recipe: SkinRecipe;
}

export interface SkinCatalogResult {
  [key: string]: unknown;
  ok: boolean;
  code: string;
  builtIns: SkinDefinition[];
  custom: SkinDefinition[];
  activeSkinId: string;
  activeSkin: SkinDefinition;
  acceptedStateChanged: boolean;
  message?: string;
}

export interface SkinResult extends Partial<SkinCatalogResult> {
  [key: string]: unknown;
  ok: boolean;
  code: string;
  acceptedStateChanged: boolean;
  skin?: SkinDefinition;
  receipt?: Record<string, unknown>;
  issues?: string[];
  message?: string;
}

const choices = {
  typeStyle: ["grotesk", "editorial", "system", "humanist"],
  headingScale: ["restrained", "balanced", "expressive"],
  density: ["compact", "comfortable", "airy"],
  cornerStyle: ["square", "subtle", "rounded", "pill"],
  borderStyle: ["none", "hairline", "strong"],
  shadowStyle: ["none", "soft", "offset"],
  controlStyle: ["plain", "solid", "pill"],
  panelStyle: ["flat", "outlined", "layered"],
  motionStyle: ["none", "restrained", "expressive"],
} as const satisfies Record<SkinTraitKey, readonly string[]>;

const builtIn = (skinId: string, name: string, description: string, recipe: SkinRecipe): SkinDefinition => ({ skinId, name, description, kind: "built_in", recipe });

export const builtInSkins: SkinDefinition[] = [
  builtIn("workshop", "Workshop", "Bold, expressive and deliberately hard-edged.", {
    typeStyle: "grotesk", headingScale: "expressive", density: "comfortable", cornerStyle: "square",
    borderStyle: "strong", shadowStyle: "offset", controlStyle: "solid", panelStyle: "outlined", motionStyle: "expressive",
  }),
  builtIn("quiet", "Quiet", "Restrained type, more breathing room and almost no visual pressure.", {
    typeStyle: "humanist", headingScale: "restrained", density: "airy", cornerStyle: "subtle",
    borderStyle: "hairline", shadowStyle: "none", controlStyle: "plain", panelStyle: "flat", motionStyle: "restrained",
  }),
  builtIn("editorial", "Editorial", "A calm, document-like surface with a serif-led hierarchy.", {
    typeStyle: "editorial", headingScale: "balanced", density: "airy", cornerStyle: "square",
    borderStyle: "hairline", shadowStyle: "none", controlStyle: "plain", panelStyle: "outlined", motionStyle: "restrained",
  }),
  builtIn("soft-system", "Soft System", "Rounded surfaces, gentle depth and familiar app ergonomics.", {
    typeStyle: "system", headingScale: "restrained", density: "comfortable", cornerStyle: "rounded",
    borderStyle: "none", shadowStyle: "soft", controlStyle: "pill", panelStyle: "layered", motionStyle: "restrained",
  }),
];

export const defaultSkin = builtInSkins[0]!;

export const skinSchema = () => ({
  schemaVersion: "finite-skin.v1",
  skinId: { pattern: "^custom_[a-z0-9-]{3,60}$", description: "Stable account-local custom skin id." },
  name: { minLength: 1, maxLength: 60 },
  description: { minLength: 1, maxLength: 160 },
  recipe: Object.fromEntries(skinTraitKeys.map((key) => [key, [...choices[key]]])),
  composition: "Skin is independent from palette. Apply a skin for visual character and a theme for colour.",
  boundary: "Categorical recipe only. No CSS, selectors, markup, scripts, URLs, remote fonts, or assets.",
});

export const validateSkinDraft = (value: unknown): { ok: true; draft: SkinDraft; definition: SkinDefinition } | { ok: false; issues: string[] } => {
  const issues: string[] = [];
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const skinId = typeof input.skinId === "string" ? input.skinId : "";
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  const rawRecipe = input.recipe && typeof input.recipe === "object" && !Array.isArray(input.recipe) ? input.recipe as Record<string, unknown> : {};
  if (!/^custom_[a-z0-9-]{3,60}$/.test(skinId)) issues.push("skinId must match custom_[a-z0-9-]{3,60}");
  if (name.length < 1 || name.length > 60) issues.push("name must contain 1 to 60 characters");
  if (description.length < 1 || description.length > 160) issues.push("description must contain 1 to 160 characters");
  for (const key of Object.keys(rawRecipe)) if (!skinTraitKeys.includes(key as SkinTraitKey)) issues.push(`unknown recipe trait ${key}`);
  for (const key of skinTraitKeys) if (!(choices[key] as readonly unknown[]).includes(rawRecipe[key])) issues.push(`${key} must be one of: ${choices[key].join(", ")}`);
  if (issues.length) return { ok: false, issues };
  const recipe = Object.fromEntries(skinTraitKeys.map((key) => [key, rawRecipe[key]])) as SkinRecipe;
  const draft: SkinDraft = { skinId, name, description, recipe };
  return { ok: true, draft, definition: { ...draft, kind: "custom" } };
};

export const applySkinDefinition = (skin: SkinDefinition, target: HTMLElement = document.documentElement): void => {
  target.dataset.skin = skin.skinId;
  for (const key of skinTraitKeys) target.dataset[`skin${key[0]!.toUpperCase()}${key.slice(1)}`] = skin.recipe[key];
};

const requestJson = async (url: string, init: RequestInit = {}): Promise<SkinResult | SkinCatalogResult> => {
  const response = await fetch(url, { ...init, headers: { accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers } });
  return response.json() as Promise<SkinResult | SkinCatalogResult>;
};

export interface SkinRepository {
  list(context?: { signal?: AbortSignal }): Promise<SkinCatalogResult>;
  preview(draft: SkinDraft, context?: { signal?: AbortSignal }): Promise<SkinResult>;
  save(draft: SkinDraft & { idempotencyKey: string; sourceSurface: SkinSourceSurface }, context?: { signal?: AbortSignal }): Promise<SkinResult>;
  setActive(input: { skinId: string; idempotencyKey: string; sourceSurface: SkinSourceSurface }, context?: { signal?: AbortSignal }): Promise<SkinResult>;
  delete(input: { skinId: string; idempotencyKey: string; sourceSurface: SkinSourceSurface }, context?: { signal?: AbortSignal }): Promise<SkinResult>;
}

export class HttpSkinRepository implements SkinRepository {
  async list(context: { signal?: AbortSignal } = {}): Promise<SkinCatalogResult> { return requestJson("/api/skins", { ...(context.signal ? { signal: context.signal } : {}) }) as Promise<SkinCatalogResult>; }
  async preview(draft: SkinDraft, context: { signal?: AbortSignal } = {}): Promise<SkinResult> { return requestJson("/api/skins/preview", { method: "POST", body: JSON.stringify(draft), ...(context.signal ? { signal: context.signal } : {}) }) as Promise<SkinResult>; }
  async save(input: SkinDraft & { idempotencyKey: string; sourceSurface: SkinSourceSurface }, context: { signal?: AbortSignal } = {}): Promise<SkinResult> { return requestJson("/api/skins", { method: "POST", body: JSON.stringify(input), ...(context.signal ? { signal: context.signal } : {}) }) as Promise<SkinResult>; }
  async setActive(input: { skinId: string; idempotencyKey: string; sourceSurface: SkinSourceSurface }, context: { signal?: AbortSignal } = {}): Promise<SkinResult> { return requestJson("/api/skins/active", { method: "POST", body: JSON.stringify(input), ...(context.signal ? { signal: context.signal } : {}) }) as Promise<SkinResult>; }
  async delete(input: { skinId: string; idempotencyKey: string; sourceSurface: SkinSourceSurface }, context: { signal?: AbortSignal } = {}): Promise<SkinResult> { return requestJson(`/api/skins/${encodeURIComponent(input.skinId)}`, { method: "DELETE", body: JSON.stringify(input), ...(context.signal ? { signal: context.signal } : {}) }) as Promise<SkinResult>; }
}
