/**
 * A per-visitor limit: at most `limit` calls in any window of `windowMs`.
 *
 * ponytail: held in this server instance's memory. It resets when the
 * instance restarts and is not shared between instances, so it slows a casual
 * abuser and no more. A firewall rule on the route is the stronger limit.
 */
export type LimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

export function createLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const windows = new Map<string, { count: number; resetAt: number }>();

  const check = (key: string, now: number = Date.now()): LimitResult => {
    // Forget every window that has passed, so memory tracks current visitors only.
    for (const [seen, window] of windows) if (window.resetAt <= now) windows.delete(seen);

    const window = windows.get(key);
    if (!window) {
      windows.set(key, { count: 1, resetAt: now + windowMs });
      return { ok: true };
    }
    if (window.count >= limit) return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1000)) };
    windows.set(key, { ...window, count: window.count + 1 });
    return { ok: true };
  };

  /** How many visitors are being counted right now. */
  return Object.assign(check, { size: () => windows.size });
}
