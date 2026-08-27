export const defaultAgenticName = "Codex";

export interface AgentSettings {
  agenticName: string;
  updatedAt: string | null;
}

export interface SettingsResult {
  ok: boolean;
  code: string;
  settings: AgentSettings;
  acceptedStateChanged: boolean;
  message?: string;
  issues?: string[];
  receipt?: Record<string, unknown>;
}

export const defaultAgentSettings = (): AgentSettings => ({ agenticName: defaultAgenticName, updatedAt: null });

export const validateAgenticName = (value: unknown): { ok: true; name: string } | { ok: false; issues: string[] } => {
  if (typeof value !== "string") return { ok: false, issues: ["Enter a name for the agent."] };
  const name = value.trim();
  const issues: string[] = [];
  if (!name) issues.push("Enter a name for the agent.");
  if (Array.from(name).length > 40) issues.push("Use 40 characters or fewer.");
  if (/\r|\n|[\u0000-\u001f\u007f]/u.test(name)) issues.push("Use a single line without control characters.");
  return issues.length ? { ok: false, issues } : { ok: true, name };
};

export class HttpSettingsRepository {
  async load(): Promise<SettingsResult> {
    const response = await fetch("/api/settings", { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`Finite settings returned HTTP ${response.status}.`);
    return response.json() as Promise<SettingsResult>;
  }

  async save(input: { agenticName: string; idempotencyKey: string; sourceSurface: "site" | "codex" }): Promise<SettingsResult> {
    const response = await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(input),
    });
    return response.json() as Promise<SettingsResult>;
  }
}
