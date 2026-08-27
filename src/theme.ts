export type ThemeMode = "light" | "dark";
export type ThemeKind = "built_in" | "custom";
export type ThemeSourceSurface = "site" | "codex";

export const themeCoreTokenKeys = [
  "paper", "panel", "ink", "line", "muted", "accent", "accentSoft", "deep", "signal",
] as const;

export type ThemeCoreTokenKey = typeof themeCoreTokenKeys[number];
export type ThemeCoreTokens = Record<ThemeCoreTokenKey, string>;

export interface ThemeTokens extends ThemeCoreTokens {
  onDeep: string;
  onSignal: string;
  focus: string;
  danger: string;
  onDanger: string;
  success: string;
}

export interface ThemeDefinition {
  themeId: string;
  name: string;
  kind: ThemeKind;
  mode: ThemeMode;
  tokens: ThemeTokens;
  contentHash?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ThemeDraft {
  themeId: string;
  name: string;
  mode: ThemeMode;
  tokens: ThemeCoreTokens;
}

export interface ThemeCatalogResult {
  [key: string]: unknown;
  ok: boolean;
  code: string;
  builtIns: ThemeDefinition[];
  custom: ThemeDefinition[];
  activeThemeId: string;
  activeTheme: ThemeDefinition;
  acceptedStateChanged: boolean;
  message?: string;
}

export interface ThemeResult extends Partial<ThemeCatalogResult> {
  [key: string]: unknown;
  ok: boolean;
  code: string;
  acceptedStateChanged: boolean;
  theme?: ThemeDefinition;
  receipt?: Record<string, unknown>;
  issues?: string[];
  message?: string;
}

const hexPattern = /^#[0-9a-fA-F]{6}$/;

const rgb = (hex: string): [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

const luminance = (hex: string): number => {
  const values = rgb(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * values[0]! + 0.7152 * values[1]! + 0.0722 * values[2]!;
};

export const themeContrast = (first: string, second: string): number => {
  const high = Math.max(luminance(first), luminance(second));
  const low = Math.min(luminance(first), luminance(second));
  return (high + 0.05) / (low + 0.05);
};

const bestForeground = (background: string): string =>
  themeContrast(background, "#ffffff") >= themeContrast(background, "#111111") ? "#ffffff" : "#111111";

export const resolveThemeTokens = (core: ThemeCoreTokens, mode: ThemeMode): ThemeTokens => ({
  ...core,
  onDeep: bestForeground(core.deep),
  onSignal: bestForeground(core.signal),
  focus: themeContrast(core.accent, core.paper) >= 3 ? core.accent : core.ink,
  danger: mode === "dark" ? "#d8685b" : "#8d2f25",
  onDanger: mode === "dark" ? "#111111" : "#ffffff",
  success: mode === "dark" ? "#72c58d" : "#2f7d4b",
});

const builtIn = (themeId: string, name: string, mode: ThemeMode, tokens: ThemeCoreTokens): ThemeDefinition => ({
  themeId, name, kind: "built_in", mode, tokens: resolveThemeTokens(tokens, mode),
});

export const builtInThemes: ThemeDefinition[] = [
  builtIn("workshop", "Workshop", "light", {
    paper: "#f4f0e8", panel: "#fffdf8", ink: "#17211f", line: "#b9b2a4", muted: "#56605d",
    accent: "#b9412b", accentSoft: "#f5d9cf", deep: "#173f37", signal: "#d7ee67",
  }),
  builtIn("night-shift", "Night Shift", "dark", {
    paper: "#101513", panel: "#18201d", ink: "#f2f0e8", line: "#4a5752", muted: "#aebbb6",
    accent: "#ff8a70", accentSoft: "#402820", deep: "#07110e", signal: "#d7ee67",
  }),
  builtIn("field-notes", "Field Notes", "light", {
    paper: "#edf1e7", panel: "#f8faf4", ink: "#183126", line: "#a8b6a8", muted: "#52655a",
    accent: "#83501f", accentSoft: "#ead8bd", deep: "#244d3d", signal: "#e3d45d",
  }),
  builtIn("high-contrast", "High Contrast", "light", {
    paper: "#ffffff", panel: "#ffffff", ink: "#050505", line: "#555555", muted: "#333333",
    accent: "#0038a8", accentSoft: "#dce7ff", deep: "#000000", signal: "#ffe600",
  }),
];

export const defaultTheme = builtInThemes[0]!;

export const themeSchema = () => ({
  schemaVersion: "finite-theme.v1",
  themeId: { pattern: "^custom_[a-z0-9-]{3,60}$", description: "Stable tenant-local custom theme id." },
  name: { minLength: 1, maxLength: 60 },
  mode: ["light", "dark"],
  tokens: Object.fromEntries(themeCoreTokenKeys.map((key) => [key, { format: "#RRGGBB" }])),
  derivedTokens: ["onDeep", "onSignal", "focus", "danger", "onDanger", "success"],
  contrast: {
    bodyText: "ink on paper and panel >= 4.5:1",
    supportingText: "muted on paper and panel >= 4.5:1",
    accentText: "accent on paper >= 4.5:1",
    emphasisSurface: "derived onDeep on deep >= 4.5:1",
    signalSurface: "derived onSignal on signal >= 4.5:1",
  },
  boundary: "Tokens only. No CSS, selectors, markup, scripts, URLs, remote fonts, or assets.",
});

export const validateThemeDraft = (value: unknown): { ok: true; draft: ThemeDraft; definition: ThemeDefinition } | { ok: false; issues: string[] } => {
  const issues: string[] = [];
  const draft = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const themeId = typeof draft.themeId === "string" ? draft.themeId : "";
  const name = typeof draft.name === "string" ? draft.name.trim() : "";
  const mode = draft.mode === "light" || draft.mode === "dark" ? draft.mode : null;
  const rawTokens = draft.tokens && typeof draft.tokens === "object" && !Array.isArray(draft.tokens) ? draft.tokens as Record<string, unknown> : {};
  if (!/^custom_[a-z0-9-]{3,60}$/.test(themeId)) issues.push("themeId must match custom_[a-z0-9-]{3,60}");
  if (name.length < 1 || name.length > 60) issues.push("name must contain 1 to 60 characters");
  if (!mode) issues.push("mode must be light or dark");
  const suppliedKeys = Object.keys(rawTokens);
  for (const key of suppliedKeys) if (!themeCoreTokenKeys.includes(key as ThemeCoreTokenKey)) issues.push(`unknown token ${key}`);
  for (const key of themeCoreTokenKeys) if (typeof rawTokens[key] !== "string" || !hexPattern.test(String(rawTokens[key]))) issues.push(`${key} must be an exact #RRGGBB colour`);
  if (issues.length || !mode) return { ok: false, issues };
  const tokens = Object.fromEntries(themeCoreTokenKeys.map((key) => [key, String(rawTokens[key]).toLowerCase()])) as ThemeCoreTokens;
  const contrastChecks: Array<[string, string, string, number]> = [
    ["ink on paper", tokens.ink, tokens.paper, 4.5],
    ["ink on panel", tokens.ink, tokens.panel, 4.5],
    ["muted on paper", tokens.muted, tokens.paper, 4.5],
    ["muted on panel", tokens.muted, tokens.panel, 4.5],
    ["accent on paper", tokens.accent, tokens.paper, 4.5],
    ["ink on accentSoft", tokens.ink, tokens.accentSoft, 4.5],
  ];
  for (const [label, foreground, background, minimum] of contrastChecks) {
    const ratio = themeContrast(foreground, background);
    if (ratio < minimum) issues.push(`${label} contrast is ${ratio.toFixed(2)}:1; minimum is ${minimum}:1`);
  }
  if (themeContrast(tokens.line, tokens.paper) < 1.35 || themeContrast(tokens.line, tokens.panel) < 1.35) issues.push("line must remain distinguishable from paper and panel");
  if (issues.length) return { ok: false, issues };
  const normalized: ThemeDraft = { themeId, name, mode, tokens };
  return { ok: true, draft: normalized, definition: { ...normalized, kind: "custom", tokens: resolveThemeTokens(tokens, mode) } };
};

export const applyThemeDefinition = (theme: ThemeDefinition, target: HTMLElement = document.documentElement): void => {
  target.dataset.theme = theme.themeId;
  target.dataset.themeMode = theme.mode;
  target.style.colorScheme = theme.mode;
  const cssNames: Record<keyof ThemeTokens, string> = {
    paper: "--paper", panel: "--panel", ink: "--ink", line: "--line", muted: "--muted",
    accent: "--accent", accentSoft: "--accent-soft", deep: "--deep", signal: "--signal",
    onDeep: "--on-deep", onSignal: "--on-signal", focus: "--focus", danger: "--danger",
    onDanger: "--on-danger", success: "--success",
  };
  for (const [key, cssName] of Object.entries(cssNames)) target.style.setProperty(cssName, theme.tokens[key as keyof ThemeTokens]);
};

const requestJson = async (url: string, init: RequestInit = {}): Promise<ThemeResult | ThemeCatalogResult> => {
  const response = await fetch(url, { ...init, headers: { accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers } });
  const payload = await response.json() as ThemeResult | ThemeCatalogResult;
  return payload;
};

export interface ThemeRepository {
  list(context?: { signal?: AbortSignal }): Promise<ThemeCatalogResult>;
  preview(draft: ThemeDraft, context?: { signal?: AbortSignal }): Promise<ThemeResult>;
  save(draft: ThemeDraft & { idempotencyKey: string; sourceSurface: ThemeSourceSurface }, context?: { signal?: AbortSignal }): Promise<ThemeResult>;
  setActive(input: { themeId: string; idempotencyKey: string; sourceSurface: ThemeSourceSurface }, context?: { signal?: AbortSignal }): Promise<ThemeResult>;
  delete(input: { themeId: string; idempotencyKey: string; sourceSurface: ThemeSourceSurface }, context?: { signal?: AbortSignal }): Promise<ThemeResult>;
}

export class HttpThemeRepository implements ThemeRepository {
  async list(context: { signal?: AbortSignal } = {}): Promise<ThemeCatalogResult> {
    return requestJson("/api/themes", { ...(context.signal ? { signal: context.signal } : {}) }) as Promise<ThemeCatalogResult>;
  }

  async preview(draft: ThemeDraft, context: { signal?: AbortSignal } = {}): Promise<ThemeResult> {
    return requestJson("/api/themes/preview", { method: "POST", body: JSON.stringify(draft), ...(context.signal ? { signal: context.signal } : {}) }) as Promise<ThemeResult>;
  }

  async save(input: ThemeDraft & { idempotencyKey: string; sourceSurface: ThemeSourceSurface }, context: { signal?: AbortSignal } = {}): Promise<ThemeResult> {
    return requestJson("/api/themes", { method: "POST", body: JSON.stringify(input), ...(context.signal ? { signal: context.signal } : {}) }) as Promise<ThemeResult>;
  }

  async setActive(input: { themeId: string; idempotencyKey: string; sourceSurface: ThemeSourceSurface }, context: { signal?: AbortSignal } = {}): Promise<ThemeResult> {
    return requestJson("/api/themes/active", { method: "POST", body: JSON.stringify(input), ...(context.signal ? { signal: context.signal } : {}) }) as Promise<ThemeResult>;
  }

  async delete(input: { themeId: string; idempotencyKey: string; sourceSurface: ThemeSourceSurface }, context: { signal?: AbortSignal } = {}): Promise<ThemeResult> {
    return requestJson(`/api/themes/${encodeURIComponent(input.themeId)}`, { method: "DELETE", body: JSON.stringify(input), ...(context.signal ? { signal: context.signal } : {}) }) as Promise<ThemeResult>;
  }
}
