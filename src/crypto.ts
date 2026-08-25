const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

export const sha256 = async (value: unknown): Promise<string> => {
  const bytes = new TextEncoder().encode(stableSerialize(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const makeId = (prefix: string): string => `${prefix}_${globalThis.crypto.randomUUID().slice(0, 8)}`;

export const clone = <T>(value: T): T => structuredClone(value);

export const deepFreeze = <T>(value: T): Readonly<T> => {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};
