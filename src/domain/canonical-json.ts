function normalizeCanonicalValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON does not accept non-finite numbers.");
    return value;
  }
  if (Array.isArray(value)) return value.map(normalizeCanonicalValue);
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, entry]) => {
        if (entry === undefined) throw new Error("Canonical JSON does not accept undefined values.");
        return [key, normalizeCanonicalValue(entry)] as const;
      });
    return Object.fromEntries(entries);
  }
  throw new Error(`Canonical JSON does not accept ${typeof value} values.`);
}

export function canonicalJson(value: unknown): string {
  const serialized = JSON.stringify(normalizeCanonicalValue(value));
  if (serialized === undefined) throw new Error("The value could not be serialized as canonical JSON.");
  return serialized;
}
