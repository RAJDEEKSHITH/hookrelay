/**
 * JSON.stringify with object keys sorted at every level, so two payloads that differ only in key order
 * (a request body and the same data read back from jsonb, which reorders keys) give the same string.
 * Array order is kept. Other values follow JSON.stringify (undefined is dropped in objects, null in arrays).
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!isPlainObject(value)) return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortKeys(value[key]);
  }
  return sorted;
}
