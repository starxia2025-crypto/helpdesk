export function stringifyDbJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

export function parseDbJson<T>(value: unknown, fallback: T): T {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") return value as T;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
