/**
 * Coerces a raw Supabase NUMERIC value to number | null.
 * PostgREST serialises NUMERIC columns as JSON strings ("7.5", not 7.5).
 * Rejects null, non-primitives (arrays, objects), NaN, and values outside 0–10.
 */
export function coerceRating(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string" && typeof v !== "number") return null;
  const n = Number(v);
  return Number.isNaN(n) || n < 0 || n > 10 ? null : n;
}
