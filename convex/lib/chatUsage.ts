/** UTC day key "YYYY-MM-DD" for a millisecond timestamp. */
export function dayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/** Numeric env var with a safe fallback (unset or non-numeric → fallback). */
export function capFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** True when `count` exceeds `cap` — i.e. this send should be refused. */
export function isOverCap(count: number, cap: number): boolean {
  return count > cap;
}
